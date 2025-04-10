let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let logging = false;

async function applyCSSToTab(tab) {
  if (logging) console.log("applyCSSToTab called with", tab);
  // Apply CSS to the specified tab
  const url = new URL(tab.url);
  const hostname = url.hostname;

  try {
    const settings = await browser.storage.local.get("transparentZenSettings");
    const globalSettings = settings.transparentZenSettings || {};
    if (globalSettings.enableStyling === false) return;

    const data = await browser.storage.local.get("styles");
    const skipListData = await browser.storage.local.get(
      SKIP_FORCE_THEMING_KEY
    );
    const siteList = skipListData[SKIP_FORCE_THEMING_KEY] || [];
    const isWhitelistMode = globalSettings.whitelistMode || false;

    // Find the best matching CSS file
    let bestMatch = null;
    let bestMatchLength = 0;

    for (const key of Object.keys(data.styles?.website || {})) {
      const siteName = key.replace(".css", "");
      if (siteName.startsWith("+")) {
        const baseSiteName = siteName.slice(1);
        if (
          hostname.endsWith(baseSiteName) &&
          baseSiteName.length > bestMatchLength
        ) {
          bestMatch = key;
          bestMatchLength = baseSiteName.length;
        }
      } else if (hostname === siteName || hostname === `www.${siteName}`) {
        // Exact match has priority
        bestMatch = key;
        break;
      } else if (
        hostname.endsWith(siteName) &&
        siteName.length > bestMatchLength
      ) {
        bestMatch = key;
        bestMatchLength = siteName.length;
      }
    }

    // If we found a direct match, use it
    if (bestMatch) {
      await applyCSS(tab.id, hostname, data.styles.website[bestMatch]);
      return;
    }

    // Otherwise, check if we should apply forced styling
    if (globalSettings.forceStyling) {
      const siteInList = siteList.includes(hostname);

      // In whitelist mode: apply only if site is in the list
      // In blacklist mode: apply only if site is NOT in the list
      if (
        (isWhitelistMode && siteInList) ||
        (!isWhitelistMode && !siteInList)
      ) {
        await applyCSS(
          tab.id,
          hostname,
          data.styles.website["example.com.css"]
        );
      }
    }
  } catch (error) {
    console.error(`Error applying CSS to ${hostname}:`, error);
  }
}

async function applyCSS(tabId, hostname, features) {
  if (!features) return;

  const siteKey = `transparentZenSettings.${hostname}`;
  const siteData = await browser.storage.local.get(siteKey);
  const featureSettings = siteData[siteKey] || {};

  let combinedCSS = "";
  for (const [feature, css] of Object.entries(features)) {
    if (featureSettings[feature] !== false) {
      combinedCSS += css + "\n";
    }
  }

  if (combinedCSS) {
    await browser.tabs.insertCSS(tabId, { code: combinedCSS });
    console.log(`Injected custom CSS for ${hostname}`);
  }
}

let autoUpdateInterval;

function startAutoUpdate() {
  if (logging) console.log("startAutoUpdate called");
  // Start the auto-update interval
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
  autoUpdateInterval = setInterval(refetchCSS, 2 * 60 * 60 * 1000);
}

function stopAutoUpdate() {
  if (logging) console.log("stopAutoUpdate called");
  // Stop the auto-update interval
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
}

async function refetchCSS() {
  if (logging) console.log("refetchCSS called");
  // Refetch CSS styles from the remote server
  try {
    const response = await fetch(
      "https://sameerasw.github.io/my-internet/styles.json",
      {
        headers: { "Cache-Control": "no-cache" },
      }
    );
    if (!response.ok) throw new Error("Failed to fetch styles.json");
    const styles = await response.json();
    await browser.storage.local.set({ styles });
    await browser.storage.local.set({ lastFetchedTime: Date.now() });
    console.info("All styles refetched and updated from GitHub.");
  } catch (error) {
    console.error("Error refetching styles:", error);
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (logging) console.log("onMessage received", message);
  // Handle messages for enabling/disabling auto-update
  if (message.action === "enableAutoUpdate") {
    startAutoUpdate();
  } else if (message.action === "disableAutoUpdate") {
    stopAutoUpdate();
  }
});

// Initialize auto-update based on stored settings
browser.storage.local.get("transparentZenSettings").then((settings) => {
  if (logging) console.log("Initial settings loaded", settings);
  if (settings.transparentZenSettings?.autoUpdate) {
    startAutoUpdate();
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // if (logging) console.log("onUpdated called with", tabId, changeInfo, tab);
  // Apply CSS when a tab is updated
  if (changeInfo.status === "complete" || changeInfo.status === "loading") {
    applyCSSToTab(tab);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (logging) console.log("onActivated called with", activeInfo);
  // Apply CSS when a tab is activated
  const tab = await browser.tabs.get(activeInfo.tabId);
  applyCSSToTab(tab);
});
