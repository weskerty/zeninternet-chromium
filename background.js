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
    const cssFileName = Object.keys(data.styles?.website || {}).find(
      (key) => {
        const siteName = key.replace(".css", "");
        return hostname === siteName || hostname === `www.${siteName}`;
      }
    );

    if (!cssFileName) return;

    const features = data.styles.website[cssFileName];
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
      await browser.tabs.insertCSS(tab.id, { code: combinedCSS });
      console.log(`Injected custom CSS for ${hostname}`);
    }
  } catch (error) {
    console.error(`Error applying CSS to ${hostname}:`, error);
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
