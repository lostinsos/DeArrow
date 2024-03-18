import * as React from "react";
import Config from "../config/config";
import { showDonationLink } from "../utils/configUtils";
import { YourWorkComponent } from "./YourWorkComponent";
import { ToggleOptionComponent } from "./ToggleOptionComponent";
import { FormattingOptionsComponent } from "./FormattingOptionsComponent";
import { isSafari } from "../../maze-utils/src/config";
import { isActivated } from "../license/license";
import { LicenseComponent } from "../license/LicenseComponent";
import { FormattedText } from "./FormattedTextComponent";

export const PopupComponent = () => {
    const [extensionEnabled, setExtensionEnabled] = React.useState(Config.config!.extensionEnabled);
    const [replaceTitles, setReplaceTitles] = React.useState(Config.config!.replaceTitles);
    const [replaceThumbnails, setReplaceThumbnails] = React.useState(Config.config!.replaceThumbnails);
    const [titleFormatting, setTitleFormatting] = React.useState(Config.config!.titleFormatting);

    return (
        <>
            <header className="sbPopupLogo">
                <img src="icons/logo.svg" alt="DeArrow Logo" width="40" height="40" id="dearrowPopupLogo"/>
                <p className="u-mZ">
                    <FormattedText
                        text="DeArrow"
                        titleFormatting={titleFormatting}
                    />
                </p>
            </header>

            {
                (!Config.config!.activated) &&
                <div className="activation-needed">
                    {
                        !isActivated() &&
                        <p>
                            {chrome.i18n.getMessage("DeArrowNotActivated")}
                        </p>
                    }

                    <div className="option-button"
                        onClick={() => {
                            void chrome.runtime.sendMessage({ message: "openPayment" });
                        }}>
                        {chrome.i18n.getMessage("ActivateDeArrow")}
                    </div>
                </div>
            }

            {
                isActivated() &&
                <>
                    {/* Toggle Box */}
                    <div className="sbControlsMenu">
                        {/* github: mbledkowski/toggle-switch */}
                        <label id="disableExtension" htmlFor="toggleSwitch" className="toggleSwitchContainer sbControlsMenu-item">
                        <span className="toggleSwitchContainer-switch">
                            <input type="checkbox" 
                                style={{ "display": "none" }} 
                                id="toggleSwitch" 
                                checked={extensionEnabled}
                                onChange={(e) => {
                                    Config.config!.extensionEnabled = e.target.checked;
                                    setExtensionEnabled(e.target.checked)
                                }}/>
                            <span className="switchBg shadow"></span>
                            <span className="switchBg white"></span>
                            <span className="switchBg blue"></span>
                            <span className="switchDot"></span>
                        </span>
                        <span id="disableSkipping" className={extensionEnabled ? " hidden" : ""}>
                            <FormattedText
                                langKey="disable"
                                titleFormatting={titleFormatting}
                            />
                        </span>
                        <span id="enableSkipping" className={!extensionEnabled ? " hidden" : ""}>
                            <FormattedText
                                langKey="Enable"
                                titleFormatting={titleFormatting}
                            />
                        </span>
                        </label>
                        <button id="optionsButton" 
                            className="sbControlsMenu-item" 
                            title={chrome.i18n.getMessage("Options")}
                            onClick={() => {
                                chrome.runtime.sendMessage({ "message": "openConfig" });
                            }}>
                        <img src="/icons/settings.svg" alt="Settings icon" width="23" height="23" className="sbControlsMenu-itemIcon" id="sbPopupIconSettings" />
                            <FormattedText
                                langKey="Options"
                                titleFormatting={titleFormatting}
                            />
                        </button>
                    </div>

                    {/* Replace titles/thumbnails */}
                    <ToggleOptionComponent
                        id="replaceTitles"
                        onChange={(value) => {
                            setReplaceTitles(value);
                            Config.config!.replaceTitles = value;
                        }}
                        value={replaceTitles}
                        label={chrome.i18n.getMessage("replaceTitles")}
                        titleFormatting={titleFormatting}
                    />

                    <ToggleOptionComponent
                        id="replaceThumbnails"
                        style={{
                            paddingTop: "15px"
                        }}
                        onChange={(value) => {
                            setReplaceThumbnails(value);
                            Config.config!.replaceThumbnails = value;
                        }}
                        value={replaceThumbnails}
                        label={chrome.i18n.getMessage("replaceThumbnails")}
                        titleFormatting={titleFormatting}
                    />

                    <FormattingOptionsComponent
                        titleFormatting={titleFormatting}
                        setTitleFormatting={setTitleFormatting}
                    />

                    {/* Your Work box */}
                    <YourWorkComponent titleFormatting={titleFormatting}/>
                </>
            }

            {/* Footer */}
            <footer id="sbFooter">
                {
                    isActivated() &&
                    <a id="helpButton"
                        onClick={() => {
                            chrome.runtime.sendMessage({ "message": "openHelp" });
                        }}>
                            <FormattedText
                                langKey="help"
                                titleFormatting={titleFormatting}
                            />
                    </a>
                }
                <a href="https://dearrow.ajay.app" target="_blank" rel="noreferrer">
                    <FormattedText
                        langKey="website"
                        titleFormatting={titleFormatting}
                    />
                </a>
                <a href="https://dearrow.ajay.app/stats" target="_blank" rel="noreferrer" className={isSafari() ? " hidden" : ""}>
                    <FormattedText
                        langKey="viewLeaderboard"
                        titleFormatting={titleFormatting}
                    />
                </a>
                <a href="https://dearrow.ajay.app/donate" target="_blank" rel="noreferrer" className={!showDonationLink() ? " hidden" : ""}>
                    <FormattedText
                        langKey="Donate"
                        titleFormatting={titleFormatting}
                    />
                </a>
                <br />
                <a href="https://github.com/ajayyy/DeArrow" target="_blank" rel="noreferrer">
                    <FormattedText
                        text="GitHub"
                        titleFormatting={titleFormatting}
                    />
                </a>
                <a href="https://discord.gg/SponsorBlock" target="_blank" rel="noreferrer">
                    <FormattedText
                        text="Discord"
                        titleFormatting={titleFormatting}
                    />
                </a>
                <a href="https://matrix.to/#/#sponsor:ajay.app?via=ajay.app&via=matrix.org&via=mozilla.org" target="_blank" rel="noreferrer">
                    <FormattedText
                        text="Matrix"
                        titleFormatting={titleFormatting}
                    />
                </a>
            </footer>

            <LicenseComponent titleFormatting={titleFormatting} />
        </>
    );
};