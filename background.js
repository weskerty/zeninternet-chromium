let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let SKIP_THEMING_KEY = "skipThemingList";
let FALLBACK_BACKGROUND_KEY = "fallbackBackgroundList";
let BROWSER_STORAGE_KEY = "transparentZenSettings";
let STYLES_MAPPING_KEY = "stylesMapping";
let logging = true;

const cssCache = new Map();
const activeTabs = new Map();
const stylingStateCache = new Map();

const ICON_ON = {
  48: "assets/images/logo_48.png",
  96: "assets/images/logo_96.png",
};
const ICON_OFF = {
  48: "assets/images/logo-off_48.png",
  96: "assets/images/logo-off_96.png",
};

const DEFAULT_SETTINGS = {
  enableStyling: true,
  autoUpdate: true,
  forceStyling: false,
  whitelistMode: false,
  whitelistStyleMode: false,
  disableTransparency: false,
  disableHover: false,
  disableFooter: false,
  fallbackBackgroundList: [],
};

function normalizeHostname(hostname) {
  return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
}

function ensureDefaultSettings(settings = {}) {
  const result = { ...settings };
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (result[key] === undefined) {
      result[key] = defaultValue;
    }
  }
  return result;
}

function shouldApplyStyling(hostname, callback) {
  const cacheKey = `styling:${hostname}`;
  if (stylingStateCache.has(cacheKey)) {
    return callback(stylingStateCache.get(cacheKey));
  }

  const normalizedHostname = normalizeHostname(hostname);

  chrome.storage.local.get(BROWSER_STORAGE_KEY, (settingsData) => {
    const settings = ensureDefaultSettings(
      settingsData[BROWSER_STORAGE_KEY] || {},
    );

    if (!settings.enableStyling) {
      const result = { shouldApply: false, reason: "globally_disabled" };
      stylingStateCache.set(cacheKey, result);
      return callback(result);
    }

    if (cssCache.size === 0) {
      preloadStyles(() => shouldApplyStyling(hostname, callback));
      return;
    }

    let hasSpecificStyle = false;

    if (
      cssCache.has(normalizedHostname) ||
      cssCache.has(`www.${normalizedHostname}`)
    ) {
      hasSpecificStyle = true;
    } else {
      for (const cachedSite of cssCache.keys()) {
        if (cachedSite.startsWith("+")) {
          const baseSite = cachedSite.slice(1);
          if (
            normalizedHostname === baseSite ||
            normalizedHostname.endsWith(`.${baseSite}`)
          ) {
            hasSpecificStyle = true;
            break;
          }
        } else if (cachedSite.startsWith("-")) {
          const baseSite = cachedSite.slice(1);
          const cachedDomain = baseSite.split(".").slice(0, -1).join(".");
          const hostParts = normalizedHostname.split(".");
          const hostDomain =
            hostParts.length > 1
              ? hostParts.slice(0, -1).join(".")
              : normalizedHostname;
          if (cachedDomain && hostDomain && hostDomain === cachedDomain) {
            hasSpecificStyle = true;
            break;
          }
        } else if (
          normalizedHostname !== cachedSite &&
          normalizedHostname.endsWith(`.${cachedSite}`) &&
          !cachedSite.startsWith("-")
        ) {
          hasSpecificStyle = true;
          break;
        }
      }
    }

    chrome.storage.local.get(
      [STYLES_MAPPING_KEY, SKIP_THEMING_KEY, SKIP_FORCE_THEMING_KEY],
      (data) => {
        if (!hasSpecificStyle) {
          const mappingData = data[STYLES_MAPPING_KEY];
          if (mappingData && mappingData.mapping) {
            for (const targetSites of Object.values(mappingData.mapping)) {
              if (targetSites.includes(normalizedHostname)) {
                hasSpecificStyle = true;
                break;
              }
            }
          }
        }

        if (hasSpecificStyle) {
          const skipStyleList = data[SKIP_THEMING_KEY] || [];
          const styleMode = settings.whitelistStyleMode || false;
          let shouldApply;
          let reason;

          if (styleMode) {
            shouldApply = skipStyleList.includes(normalizedHostname);
            reason = shouldApply ? "whitelisted" : "not_whitelisted";
          } else {
            shouldApply = !skipStyleList.includes(normalizedHostname);
            reason = shouldApply ? "not_blacklisted" : "blacklisted";
          }
          const result = { shouldApply, reason };
          stylingStateCache.set(cacheKey, result);
          return callback(result);
        }

        if (settings.forceStyling) {
          const skipForceList = data[SKIP_FORCE_THEMING_KEY] || [];
          const isWhitelistMode = settings.whitelistMode || false;
          let shouldApply;
          let reason;

          if (isWhitelistMode) {
            shouldApply = skipForceList.includes(normalizedHostname);
            reason = shouldApply
              ? "force_whitelisted"
              : "force_not_whitelisted";
          } else {
            shouldApply = !skipForceList.includes(normalizedHostname);
            reason = shouldApply
              ? "force_not_blacklisted"
              : "force_blacklisted";
          }
          const result = { shouldApply, reason };
          stylingStateCache.set(cacheKey, result);
          return callback(result);
        }

        const result = { shouldApply: false, reason: "no_styling_rules" };
        stylingStateCache.set(cacheKey, result);
        callback(result);
      },
    );
  });
}

function updateIconForTab(tabId, url) {
  const update = (tabUrl) => {
    if (!tabUrl || !tabUrl.startsWith("http")) {
      return setIcon(tabId, false);
    }
    const urlObj = new URL(tabUrl);
    const hostname = urlObj.hostname;

    shouldApplyStyling(hostname, (stylingState) => {
      setIcon(tabId, stylingState.shouldApply);
      if (logging)
        console.log(
          `Icon updated for ${hostname}: styling ${
            stylingState.shouldApply ? "ON" : "OFF"
          } (${stylingState.reason})`,
        );
    });
  };

  if (url) {
    update(url);
  } else {
    chrome.tabs.get(tabId, (tab) => {
      if (tab) update(tab.url);
    });
  }
}

function setIcon(tabId, isEnabled) {
  const iconSet = isEnabled ? ICON_ON : ICON_OFF;
  chrome.browserAction.setIcon({
    path: iconSet,
    tabId: tabId,
  });
}

function preloadStyles(callback) {
  chrome.storage.local.get(
    ["styles", BROWSER_STORAGE_KEY, STYLES_MAPPING_KEY],
    (data) => {
      const settings = ensureDefaultSettings(data[BROWSER_STORAGE_KEY] || {});

      if (
        JSON.stringify(settings) !== JSON.stringify(data[BROWSER_STORAGE_KEY])
      ) {
        if (logging)
          console.log(
            "Missing settings detected, applying defaults:",
            settings,
          );
        chrome.storage.local.set({ [BROWSER_STORAGE_KEY]: settings });
      }

      if (settings.enableStyling === false) {
        if (callback) callback();
        return;
      }

      cssCache.clear();
      if (data.styles && data.styles.website) {
        for (const [website, features] of Object.entries(data.styles.website)) {
          const websiteKey = website.replace(".css", "");
          cssCache.set(websiteKey, features);
        }
        if (logging) console.log("Styles preloaded for faster injection");
      }
      if (callback) callback();
    },
  );
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    activeTabs.set(details.tabId, details.url);
    updateIconForTab(details.tabId, details.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "contentScriptReady" && message.hostname) {
    return true;
  } else if (message.action === "enableAutoUpdate") {
    startAutoUpdate();
  } else if (message.action === "disableAutoUpdate") {
    stopAutoUpdate();
  } else if (message.action === "contentScriptReady" && sender.tab) {
    updateIconForTab(sender.tab.id, sender.tab.url);
  } else if (message.action === "reapplyStyles" && message.tabId) {
    chrome.tabs.get(message.tabId, (tab) => {
      if (tab) {
        chrome.tabs.sendMessage(
          tab.id,
          { action: "applyStyles", css: "" },
          () => {
            if (chrome.runtime.lastError) {
            }
            applyCSSToTab(tab);
          },
        );
      }
    });
  }
});

function getFeaturesForHostname(hostname, settings, callback) {
  settings = ensureDefaultSettings(settings);
  
  const normalizedHostname = normalizeHostname(hostname);
  
  if (cssCache.has(normalizedHostname)) {
    return callback(cssCache.get(normalizedHostname));
  }
  if (cssCache.has(`www.${normalizedHostname}`)) {
    return callback(cssCache.get(`www.${normalizedHostname}`));
  }

  for (const [cachedSite, features] of cssCache.entries()) {
    if (cachedSite.startsWith("+")) {
      const baseSite = cachedSite.slice(1);
      if (normalizedHostname === baseSite || normalizedHostname.endsWith(`.${baseSite}`))
        return callback(features);
    } else if (cachedSite.startsWith("-")) {
      const baseSite = cachedSite.slice(1);
      const cachedDomain = baseSite.split(".").slice(0, -1).join(".");
      const hostParts = normalizedHostname.split(".");
      const hostDomain =
        hostParts.length > 1 ? hostParts.slice(0, -1).join(".") : normalizedHostname;
      if (cachedDomain && hostDomain && hostDomain === cachedDomain)
        return callback(features);
    } else if (
      normalizedHostname !== cachedSite &&
      normalizedHostname.endsWith(`.${cachedSite}`) &&
      !cachedSite.startsWith("-")
    ) {
      return callback(features);
    }
  }

  chrome.storage.local.get(
    [STYLES_MAPPING_KEY, SKIP_FORCE_THEMING_KEY],
    (data) => {
      const mappingData = data[STYLES_MAPPING_KEY];
      if (mappingData && mappingData.mapping) {
        for (const [sourceStyle, targetSites] of Object.entries(
          mappingData.mapping,
        )) {
          if (targetSites.includes(normalizedHostname)) {
            const sourceStyleKey = sourceStyle.replace(".css", "");
            if (cssCache.has(sourceStyleKey))
              return callback(cssCache.get(sourceStyleKey));
          }
        }
      }

      if (settings.forceStyling) {
        const siteList = data[SKIP_FORCE_THEMING_KEY] || [];
        const isWhitelistMode = settings.whitelistMode || false;
        const siteInList = siteList.includes(normalizedHostname);

        if (
          (isWhitelistMode && siteInList) ||
          (!isWhitelistMode && !siteInList)
        ) {
          if (cssCache.has("example.com")) {
            return callback(cssCache.get("example.com"));
          }
        }
      }

      callback(null);
    },
  );
}

function applyCSSToTab(tab) {
  if (!tab || !tab.url || !tab.url.startsWith("http")) return;
  const url = new URL(tab.url);
  const hostname = normalizeHostname(url.hostname);

  shouldApplyStyling(hostname, (stylingState) => {
    setIcon(tab.id, stylingState.shouldApply);

    if (stylingState.reason === "globally_disabled") return;

    chrome.storage.local.get(
      [
        BROWSER_STORAGE_KEY,
        FALLBACK_BACKGROUND_KEY,
        "styles",
        STYLES_MAPPING_KEY,
      ],
      (data) => {
        const fallbackBackgroundList = data[FALLBACK_BACKGROUND_KEY] || [];
        const hasFallbackBackground = fallbackBackgroundList.includes(hostname);

        if (hasFallbackBackground) {
          let css = `html { background-color: light-dark(#fff, #111); }`;
          chrome.tabs.insertCSS(tab.id, { code: css, runAt: "document_start" });
          return;
        }

        if (stylingState.shouldApply) {
          const globalSettings = ensureDefaultSettings(
            data[BROWSER_STORAGE_KEY] || {},
          );
          getFeaturesForHostname(hostname, globalSettings, (features) => {
            if (features) {
              applyFinalCSS(tab.id, hostname, features);
            }
          });
        }
      },
    );
  });
}

function applyFinalCSS(tabId, hostname, features) {
  const normalizedHostname = normalizeHostname(hostname);
  
  chrome.storage.local.get(
    [
      BROWSER_STORAGE_KEY,
      FALLBACK_BACKGROUND_KEY,
      `transparentZenSettings.${normalizedHostname}`,
    ],
    (data) => {
      const globalSettings = ensureDefaultSettings(
        data[BROWSER_STORAGE_KEY] || {},
      );
      
      const fallbackBackgroundList = data[FALLBACK_BACKGROUND_KEY] || [];
      const hasFallbackBackground = fallbackBackgroundList.includes(normalizedHostname);
      const siteKey = `transparentZenSettings.${normalizedHostname}`;
      const featureSettings = data[siteKey] || {};
      
      let combinedCSS = "";
      let includedFeatures = 0;
      let skippedTransparency = 0;
      let skippedHover = 0;
      let skippedFooter = 0;
      let skippedDisabled = 0;
      
      for (const [feature, css] of Object.entries(features)) {
        const isTransparency = feature.toLowerCase().includes("transparency");
        const isHover = feature.toLowerCase().includes("hover");
        const isFooter = feature.toLowerCase().includes("footer");
        
        if (isTransparency && (globalSettings.disableTransparency || hasFallbackBackground)) {
          if (logging) console.log(`Skipping transparency feature ${feature}`);
          skippedTransparency++;
          continue;
        }
        
        if (isHover && globalSettings.disableHover) {
          if (logging) console.log(`Skipping hover feature ${feature}`);
          skippedHover++;
          continue;
        }
        
        if (isFooter && globalSettings.disableFooter) {
          if (logging) console.log(`Skipping footer feature ${feature}`);
          skippedFooter++;
          continue;
        }
        
        if (featureSettings[feature] === false) {
          if (logging) console.log(`Skipping feature ${feature} (disabled by site)`);
          skippedDisabled++;
          continue;
        }
        
        combinedCSS += css + "\n";
        includedFeatures++;
        if (logging) console.log(`Including feature: ${feature}`);
      }
      
      if (hasFallbackBackground) {
        if (logging) console.log("Adding fallback background");
        combinedCSS += "\nhtml { background-color: light-dark(#fff, #111); }\n";
      }
      
      if (logging) console.log(`CSS summary:\n  - Included: ${includedFeatures}\n  - Skipped transparency: ${skippedTransparency}\n  - Skipped hover: ${skippedHover}\n  - Skipped footer: ${skippedFooter}\n  - Skipped disabled: ${skippedDisabled}\n  - Fallback bg: ${hasFallbackBackground}\n  - CSS length: ${combinedCSS.length}`);
      
      if (combinedCSS.trim()) {
        chrome.tabs.sendMessage(
          tabId,
          { action: "applyStyles", css: combinedCSS },
          (response) => {
            if (chrome.runtime.lastError) {
              chrome.tabs.insertCSS(tabId, {
                code: combinedCSS,
                runAt: "document_start",
              });
            }
          },
        );
      }
    },
  );
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateIconForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateIconForTab(activeInfo.tabId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes[BROWSER_STORAGE_KEY] ||
      changes[SKIP_THEMING_KEY] ||
      changes[SKIP_FORCE_THEMING_KEY] ||
      changes[STYLES_MAPPING_KEY])
  ) {
    stylingStateCache.clear();
    if (logging)
      console.log("Cleared styling state cache due to settings change");
  }
});

let autoUpdateInterval;

function startAutoUpdate() {
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
  autoUpdateInterval = setInterval(refetchCSS, 2 * 60 * 60 * 1000);
}

function stopAutoUpdate() {
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
}

function refetchCSS() {
  chrome.storage.local.get("stylesRepositoryUrl", (repoData) => {
    const DEFAULT_REPOSITORY_URL =
      "https://sameerasw.github.io/my-internet/styles.json";
    const repositoryUrl =
      repoData.stylesRepositoryUrl || DEFAULT_REPOSITORY_URL;

    fetch(repositoryUrl, { headers: { "Cache-Control": "no-cache" } })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            `Failed to fetch styles (Status: ${response.status})`,
          );
        return response.json();
      })
      .then((styles) => {
        chrome.storage.local.get(
          [STYLES_MAPPING_KEY, BROWSER_STORAGE_KEY],
          (data) => {
            let mappingData =
              styles.mapping && Object.keys(styles.mapping).length > 0
                ? { mapping: styles.mapping }
                : data[STYLES_MAPPING_KEY] || { mapping: {} };

            let settings = data[BROWSER_STORAGE_KEY] || {};
            settings.lastFetchedTime = Date.now();

            chrome.storage.local.set(
              {
                styles,
                [STYLES_MAPPING_KEY]: mappingData,
                [BROWSER_STORAGE_KEY]: settings,
              },
              () => {
                console.info(
                  `All styles refetched and updated from ${repositoryUrl}`,
                );
                preloadStyles();
              },
            );
          },
        );
      })
      .catch((error) => console.error("Error refetching styles:", error));
  });
}

function initializeExtension() {
  chrome.storage.local.get(null, (data) => {
    const settings = ensureDefaultSettings(data[BROWSER_STORAGE_KEY] || {});
    const toSet = {};
    let needsUpdate = false;

    if (
      JSON.stringify(settings) !== JSON.stringify(data[BROWSER_STORAGE_KEY])
    ) {
      toSet[BROWSER_STORAGE_KEY] = settings;
      needsUpdate = true;
    }
    if (!data[SKIP_FORCE_THEMING_KEY]) {
      toSet[SKIP_FORCE_THEMING_KEY] = [];
      needsUpdate = true;
    }
    if (!data[SKIP_THEMING_KEY]) {
      toSet[SKIP_THEMING_KEY] = [];
      needsUpdate = true;
    }
    if (!data[FALLBACK_BACKGROUND_KEY]) {
      toSet[FALLBACK_BACKGROUND_KEY] = [];
      needsUpdate = true;
    }
    if (!data[STYLES_MAPPING_KEY]) {
      toSet[STYLES_MAPPING_KEY] = { mapping: {} };
      needsUpdate = true;
    }

    if (needsUpdate) {
      chrome.storage.local.set(toSet);
    }

    preloadStyles(() => {
      if (settings.autoUpdate) {
        startAutoUpdate();
      }
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          updateIconForTab(tab.id, tab.url);
        }
      });
    });
  });
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    chrome.tabs.get(details.tabId, (tab) => {
      if (tab) applyCSSToTab(tab);
    });
  }
});

initializeExtension();
