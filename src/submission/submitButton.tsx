import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { BrandingResult, replaceCurrentVideoBranding } from "../videoBranding/videoBranding";
import { SubmissionComponent } from "./SubmissionComponent";
import { getVideo, getVideoID, getYouTubeVideoID, isOnMobileYouTube } from "../../maze-utils/src/video";
import { log, logError } from "../utils/logger";
import { TitleSubmission } from "../titles/titleData";
import { ThumbnailSubmission } from "../thumbnails/thumbnailData";
import { queueThumbnailCacheRequest, submitVideoBranding } from "../dataFetching";
import Config from "../config/config";
import { addTitleChangeListener, getOrCreateTitleButtonContainer } from "../utils/titleBar";
import { onMobile } from "../../maze-utils/src/pageInfo";
import { addCleanupListener } from "../../maze-utils/src/cleanup";

const submitButtonIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M14.1 7.1l2.9 2.9L6.1 20.7l-3.6.7.7-3.6L14.1 7.1zm0-2.8L1.4 16.9 0 24l7.1-1.4L19.8 9.9l-5.7-5.7zm7.1 4.3L24 5.7 18.3 0l-2.8 2.8 5.7 5.7z"/>
</svg>`;

export class SubmitButton {
    button: HTMLButtonElement;
    container: HTMLElement | null;
    root: Root | null;

    mutationObserver?: MutationObserver;

    submissions: BrandingResult;

    constructor() {
        this.submissions = {
            thumbnails: [],
            titles: [],
            randomTime: null,
            videoDuration: null
        };

        addCleanupListener(() => {
            this.mutationObserver?.disconnect?.();

            this.close();
        });
    }

    async attachToPage(): Promise<void> {
        if (!getVideo()) {
            log("Not attaching submit button, no video");
            return;
        }

        const referenceNode = await getOrCreateTitleButtonContainer();
        if (referenceNode) {
            if (!referenceNode.contains(this.button)) {
                if (!this.button) {
                    const existingButton = referenceNode.querySelector(".cbSubmitButton");
                    if (existingButton) {
                        existingButton.remove();
                    }

                    this.button = document.createElement('button');
                    this.button.className = "cbSubmitButton cbButton" + (onMobile() ? " cbMobileButton" : "");
                    this.button.innerHTML = submitButtonIcon;
                    this.button.draggable = false;

                    this.button.addEventListener("click", (e) => {
                        if (!chrome.runtime?.id) return;

                        e.stopPropagation();
                        this.openOrClose().catch(logError);
                    });
                }

                referenceNode.appendChild(this.button);
            }
        }

        addTitleChangeListener(() => {
            this.render();
        });
    }

    close(): void {
        if (this.container) {
            // Experimental YouTube layout with description on right
            const isOnDescriptionOnRightLayout = document.querySelector("#title #description");
            if (isOnDescriptionOnRightLayout) {
                // Undo preventing color from changing on hover
                const title = document.querySelector("#above-the-fold #title") as HTMLElement | null;
                if (title) {
                    title.style.removeProperty("background");
                }
            }
            
            this.root?.unmount?.();
            this.root = null;
            this.container.remove();
            this.container = null;
        }
    }

    async openOrClose(): Promise<void> {
        const referenceNode = this.button?.parentElement ?? await getOrCreateTitleButtonContainer();
        if (!referenceNode) return;

        // Experimental YouTube layout with description on right
        const isOnDescriptionOnRightLayout = document.querySelector("#title #description");

        let popupNode = onMobile()
            ? document.querySelector(".watch-below-the-player") 
            : document.querySelector("#secondary-inner");
        if (!popupNode || popupNode.childElementCount < 2 || isOnDescriptionOnRightLayout) {
            popupNode = referenceNode.parentElement;
        }

        if (popupNode && !popupNode.contains(this.container)) {
            if (!this.container) {
                this.container = document.createElement('span');
                this.container.id = "cbSubmitMenu";

                if (isOnDescriptionOnRightLayout) {
                    this.container.style.marginTop = referenceNode.parentElement?.offsetHeight + "px";

                    // Prevent color from changing on hover
                    referenceNode.parentElement!.parentElement!.style.background = "transparent";
                }

                this.root = createRoot(this.container);
                this.render();
            }

            popupNode.insertBefore(this.container, popupNode.firstChild);

            if (isOnMobileYouTube()) {
                if (this.mutationObserver) {
                    this.mutationObserver.disconnect();
                }
                
                this.mutationObserver = new MutationObserver(() => 
                    void this.attachToPage());
    
                this.mutationObserver.observe(referenceNode, { 
                    childList: true,
                    subtree: true
                });
            }
        } else {
            this.close();
        }
    }

    clearSubmissions(): void {
        this.setSubmissions({
            thumbnails: [],
            titles: [],
            randomTime: null,
            videoDuration: null
        });
    }

    setSubmissions(submissions: BrandingResult): void {
        this.submissions = submissions;
        this.render();
    }

    render(): void {
        if (this.root) {
            this.root?.render(<SubmissionComponent
                video={getVideo()!}
                videoID={getVideoID()!}
                submissions={this.submissions}
                submitClicked={(title, thumbnail, actAsVip) => this.submitPressed(title, thumbnail, actAsVip)}
            />);
        }
    }

    private async submitPressed(title: TitleSubmission | null, thumbnail: ThumbnailSubmission | null, actAsVip: boolean): Promise<boolean> {
        if (title) {
            title.title = title.title.trim();

            if (title.title.length === 0) {
                title = null;
            }
        }

        if (getVideoID() !== getYouTubeVideoID()) {
            alert(chrome.i18n.getMessage("videoIDWrongWhenSubmittingError"));
            return false;
        }
        
        const result = await submitVideoBranding(getVideoID()!, title, thumbnail, false, actAsVip);

        if (result && result.ok) {
            this.close();

            // Try to get this generated by the server
            if (thumbnail && !thumbnail.original) {
                queueThumbnailCacheRequest(getVideoID()!, thumbnail.timestamp, undefined, false, true);
            }

            // Set the unsubmitted as selected
            const unsubmitted = Config.local!.unsubmitted[getVideoID()!];
            if (unsubmitted) {
                if (Config.config!.keepUnsubmitted 
                        && (!chrome.extension.inIncognitoContext || Config.config!.keepUnsubmittedInPrivate)) {
                    unsubmitted.titles.forEach((t) => t.selected = false);
                    unsubmitted.thumbnails.forEach((t) => t.selected = false);

                    if (title) {
                        const unsubmittedTitle = unsubmitted.titles.find((t) => t.title === title!.title);
                        if (unsubmittedTitle) unsubmittedTitle.selected = true;
                    }
                    
                    if (thumbnail) {
                        if (thumbnail.original && !unsubmitted.thumbnails.find((t) => t.original)) {
                            unsubmitted.thumbnails.push({
                                original: true,
                                selected: true
                            });
                        } else {
                            const unsubmittedThumbnail = unsubmitted.thumbnails.find((t) => (t.original && thumbnail.original) 
                                || (!t.original && !thumbnail.original && t.timestamp === thumbnail.timestamp))
                            if (unsubmittedThumbnail) unsubmittedThumbnail.selected = true;
                        }
                    }
                } else {
                    delete Config.local!.unsubmitted[getVideoID()!];
                }

                Config.forceLocalUpdate("unsubmitted");
            }

            replaceCurrentVideoBranding().catch(logError);

            return true;
        } else {
            const text = result.responseText;

            if (text.includes("<head>")) {
                alert(chrome.i18n.getMessage("502"));
            } else {
                alert(text);
            }

            return false;
        }
    }
}