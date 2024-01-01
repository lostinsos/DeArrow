import { setupTabUpdates } from "../maze-utils/src/tab-updates";
import { sendRealRequestToCustomServer, setupBackgroundRequestProxy } from "../maze-utils/src/background-request-proxy";
import { generateUserID } from "../maze-utils/src/setup";
import Config from "./config/config";
import { isSafari } from "../maze-utils/src/config";
import * as CompileConfig from "../config.json";
import { isFirefoxOrSafari } from "../maze-utils/src";
import { logError } from "./utils/logger";
import { injectUpdatedScripts } from "../maze-utils/src/cleanup";
import { freeTrialActive, getContentScripts, getFreeAccessRequestTimeLeft, getFreeTrialTimeLeft, isActivated } from "./license/license";
import { waitFor } from "../maze-utils/src";
import { chromeP } from "../maze-utils/src/browserApi";

setupTabUpdates(Config);
setupBackgroundRequestProxy();

waitFor(() => Config.isReady()).then(() => {
    if (!Config.config!.activated && (Config.config!.alreadyActivated || Config.config!.licenseKey)) {
        Config.config!.activated = true;
    }
    if (Config.config!.activated && Config.config!.userID) {
        Config.config!.alreadyActivated = true;
    }

    if (Config.config!.userID) {
        registerNeededContentScripts().then(() => {
            if (!isFirefoxOrSafari()) {
                // Chrome doesn't trigger onInstall when this happens, but they need to be
                // re-registered to apply to incognito tabs
                chrome.extension.isAllowedIncognitoAccess((isAllowedAccess) => {
                    if (isAllowedAccess && !Config.config!.lastIncognitoStatus) {
                        registerNeededContentScripts(undefined, true).catch(logError);
                    }
        
                    Config.config!.lastIncognitoStatus = isAllowedAccess;
                });
            }
        }).catch(logError);
    }

    setupAlarms();

    // Check every time since sometimes initial onInstall isn't called
    if (!Config.config!.userID) {
        const setupUserID = async () => {
            const userID = Config.config!.userID;
    
            // If there is no userID, then it is the first install.
            if (!userID){
                const groupPolicyLicenseKey = await getGroupPolicyLicenseKey();
                const paywallEnabled = false
                    && !navigator.userAgent.includes("Mobile;")
                    && !navigator.userAgent.includes("iPhone;")
                    && !navigator.userAgent.includes("iPad;")
                    && await isPaywallEnabled()
                    && !groupPolicyLicenseKey
                    && !Config.config!.licenseKey
                    && !Config.config!.alreadyActivated;
                if (paywallEnabled) {
                    Config.config!.activated = false;
                    Config.config!.showActivatedMessage = true;
                    Config.config!.freeActivation = false;
                } else if (groupPolicyLicenseKey) {
                    Config.config!.licenseKey = groupPolicyLicenseKey;
                    Config.config!.freeActivation = false;
                }

                // Safari won't have freeActivation enabled
                if (CompileConfig["freeAccess"]) {
                    Config.config!.freeActivation = false;
                }
    
                registerNeededContentScripts().catch(logError);
    
                // First check for config from SponsorBlock extension
                const sponsorBlockConfig = await Promise.race([
                    new Promise((resolve) => setTimeout(resolve, 1000)),
                    new Promise((resolve) => {
                        const extensionIds = getExtensionIdsToImportFrom();
                        
                        for (const id of extensionIds) {
                            chrome.runtime.sendMessage(id, { message: "requestConfig" }, (response) => {
                                if (response) {
                                    resolve(response);
                                }
                            });
                        }
                    })
                ]);
    
                if (sponsorBlockConfig) {
                    Config.config!.userID = sponsorBlockConfig["userID"];
                    Config.config!.allowExpirements = sponsorBlockConfig["allowExpirements"];
                    Config.config!.showDonationLink = sponsorBlockConfig["showDonationLink"];
                    Config.config!.showUpsells = sponsorBlockConfig["showUpsells"];
                    Config.config!.darkMode = sponsorBlockConfig["darkMode"];
                    Config.config!.importedConfig = true;
                }
                
                if (!Config.config!.userID) {
                    const newUserID = generateUserID();
                    Config.config!.userID = newUserID;
                }
    
                Config.config!.showInfoAboutRandomThumbnails = true;
    
                if (paywallEnabled) {
                    setTimeout(() => void chrome.tabs.create({url: chrome.runtime.getURL("/payment.html")}), 100);
                } else if (!groupPolicyLicenseKey) {
                    setTimeout(() => void chrome.tabs.create({url: chrome.runtime.getURL("/help.html")}), 100);
                }
            }
        };
    
        if (isFirefoxOrSafari() && !isSafari()) {
            // This let's the config sync to run fully before checking.
            // This is required on Firefox
            setTimeout(() => void setupUserID(), 1500);
        } else {
            waitFor(() => Config.isReady()).then(() => setupUserID()).catch(logError);
        }
    }
}).catch(logError);

async function isPaywallEnabled(): Promise<boolean> {
    try {
        const result = await sendRealRequestToCustomServer("GET", `${Config.config!.serverAddress}/api/featureFlag/deArrowPaywall`);

        if (result.ok) {
            const json = await result.json();

            return json.enabled;
        }
    } catch (e) {
        logError(e);
    }

    return false;
}

async function getGroupPolicyLicenseKey(): Promise<string | null> {
    try {
        if ("managed" in chrome.storage) {
            const result = await chrome.storage.managed.get("licenseKey");
            return result?.licenseKey || null;
        }
    } catch (e) {
        // Managed storage not available on this browser
    }

    return null;
}

const existingRegistrations: { id: string; script: browser.contentScripts.RegisteredContentScript }[] = [];

chrome.runtime.onMessage.addListener((request, _, sendResponse) =>  {
    switch(request.message) {
        case "openConfig":
            void chrome.tabs.create({url: chrome.runtime.getURL('options/options.html' + (request.hash ? '#' + request.hash : ''))});
            return false;
        case "openHelp":
            void chrome.tabs.create({url: chrome.runtime.getURL('help.html')});
            return false;
        case "openPayment":
            void chrome.tabs.create({url: chrome.runtime.getURL('payment.html')});
            return false;
        case "registerNeededContentScripts":
            registerNeededContentScripts(request.activated).then(sendResponse).catch(sendResponse);
            setupAlarms();
            return true;
        case "setupAlarms":
            setupAlarms();
            return false;
    }

    return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
    switch (alarm.name) {
        case "freeTrial": {
            onFreeTrialComplete();
            break;
        }
        case "freeAccessRequest":
            onFreeAccessRequestComplete();
            break;
    }
});

function onFreeTrialComplete() {
    if (!freeTrialActive() && !isActivated()) {
        Config.config!.freeTrialEnded = true;

        void chrome.tabs.create({url: chrome.runtime.getURL('payment.html')});

        registerNeededContentScripts().catch(logError);
    }
}

function onFreeAccessRequestComplete() {
    if (Config.config!.activated) return;

    Config.config!.freeActivation = true;
    Config.config!.activated = true;
    Config.config!.freeTrialEnded = true;

    registerNeededContentScripts().catch(logError);

    setTimeout(() => void chrome.tabs.create({url: chrome.runtime.getURL('help.html')}), 1000);
}

function getExtensionIdsToImportFrom(): string[] {
    if (isSafari()) {
        return CompileConfig.extensionImportList.safari;
    } else if (isFirefoxOrSafari()) {
        return CompileConfig.extensionImportList.firefox;
    } else {
        return CompileConfig.extensionImportList.chromium;
    }
}

chrome.runtime.onMessageExternal.addListener((request, sender, callback) => {
    if (sender.id && getExtensionIdsToImportFrom().includes(sender.id)) {
        if (request.message === "isInstalled") {
            callback(true);
        }
    }
});

async function registerNeededContentScripts(activated?: boolean, forceUpdate?: boolean) {
    if (isSafari()) return;

    const contentScripts = getContentScripts(activated);
    if ("scripting" in chrome && "getRegisteredContentScripts" in chrome.scripting 
            && isPersistentContentScriptSupported()) {
        Config.config!.firefoxOldContentScriptRegistration = false;

        const existingRegistration = await chromeP.scripting.getRegisteredContentScripts();
        if (existingRegistration?.length > 0) {
            const registrationsToRemove = existingRegistration
                .filter((script) => forceUpdate || !contentScripts.some((newScript) => newScript.id === script.id));

            if (registrationsToRemove.length > 0) {
                await chromeP.scripting.unregisterContentScripts({
                    ids: registrationsToRemove.map((script) => script.id),
                });
            }
        }

        let scriptsChanged = false;
        for (const script of contentScripts) {
            if (forceUpdate || !existingRegistration || !existingRegistration.some((existing) => existing.id === script.id)) {
                await chromeP.scripting.registerContentScripts([{
                    id: script.id,
                    runAt: script.runAt,
                    matches: script.matches,
                    allFrames: script.allFrames,
                    js: script.js,
                    css: script.css,
                    persistAcrossSessions: true,
                }]);

                scriptsChanged = true;
            }
        }

        if (scriptsChanged) {
            await injectUpdatedScripts(contentScripts);
        }
    } else {
        Config.config!.firefoxOldContentScriptRegistration = true;
        
        if (existingRegistrations.length > 0) {
            const registrationsToRemove = existingRegistrations
                .filter((script) => forceUpdate || !contentScripts.some((newScript) => newScript.id === script.id));

            for (const registration of registrationsToRemove) {
                await registration.script.unregister();
                existingRegistrations.splice(existingRegistrations.indexOf(registration), 1);
            }
        }

        let scriptsChanged = false;
        for (const script of contentScripts) {
            if (forceUpdate || !existingRegistrations.some((existing) => existing.id === script.id)) {
                existingRegistrations.push({
                    id: script.id,
                    script: await browser.contentScripts.register({
                        runAt: script.runAt,
                        matches: script.matches,
                        allFrames: script.allFrames,
                        js: script.js?.map?.(js => ({file: js})),
                        css: script.css?.map?.(css => ({file: css})),
                    })
                });

                scriptsChanged = true;
            }
        }

        if (scriptsChanged) {
            await injectUpdatedScripts(contentScripts);
        }
    }
}

function isPersistentContentScriptSupported() {
    if (!isFirefoxOrSafari() || isSafari()) return true;

    const userAgentVersion = parseInt(navigator.userAgent.match(/Firefox\/(\S+)/)?.[1] ?? "");
    return !isNaN(userAgentVersion) && userAgentVersion > 105;
}

function setupAlarms() {
    if (!Config.config!.activated) {
        const freeTrialTimeLeft = getFreeTrialTimeLeft();
        if (freeTrialTimeLeft && freeTrialTimeLeft > 0) {
            void chrome.alarms.create("freeTrial", { when: Date.now() + freeTrialTimeLeft + 1000 * 60 });
        } else if (freeTrialTimeLeft && !Config.config!.freeTrialEnded) {
            onFreeTrialComplete();
        }

        const freeAccessRequestTimeLeft = getFreeAccessRequestTimeLeft();
        if (freeAccessRequestTimeLeft && freeAccessRequestTimeLeft > 0) {
            void chrome.alarms.create("freeAccessRequest", { when: Date.now() + freeAccessRequestTimeLeft });
        } else if (freeAccessRequestTimeLeft) {
            onFreeAccessRequestComplete();
        }
    }
}
