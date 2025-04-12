let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let logging = false;

// Create a cache for pre-processed CSS to speed up repeated visits
const cssCache = new Map();
const activeTabs = new Map();

// Preload styles for faster injection
async function preloadStyles() {
  try {
    const data = await browser.storage.local.get([
      "styles",
      "transparentZenSettings",
    ]);
    const settings = data.transparentZenSettings || {};

    // No point in preloading if styling is disabled
    if (settings.enableStyling === false) return;

    // Clear the cache when reloaded to ensure fresh styles
    cssCache.clear();

    if (data.styles?.website) {
      for (const [website, features] of Object.entries(data.styles.website)) {
        // Process and store default CSS for each website (with all features enabled)
        let combinedCSS = "";
        for (const [feature, css] of Object.entries(features)) {
          combinedCSS += css + "\n";
        }
        cssCache.set(website.replace(".css", ""), combinedCSS);
      }
      if (logging) console.log("Styles preloaded for faster injection");
    }
  } catch (error) {
    console.error("Error preloading styles:", error);
  }
}

// Handle web requests - allow injecting CSS before any content is loaded
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    // Only for main frame
    // Track active navigations
    activeTabs.set(details.tabId, details.url);

    // Pre-fetch any styling needed for this URL
    prepareStylesForUrl(new URL(details.url).hostname, details.tabId);
  }
});

// Listen for content scripts announcing they're ready
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "contentScriptReady" && message.hostname) {
    try {
      // Look for cached styles for this hostname or its domain match
      const hostname = message.hostname;

      // Get settings to check if styling is enabled
      const settingsData = await browser.storage.local.get(
        "transparentZenSettings"
      );
      const settings = settingsData.transparentZenSettings || {};

      if (settings.enableStyling === false) return;

      const css = await getStylesForHostname(hostname, settings);

      // If we found matching CSS, send it immediately to the content script
      if (css) {
        browser.tabs
          .sendMessage(sender.tab.id, {
            action: "applyStyles",
            css: css,
          })
          .catch((err) => {
            if (logging) console.log("Failed to send immediate CSS:", err);
          });
      }
    } catch (error) {
      console.error("Error handling content script ready message:", error);
    }
  } else if (message.action === "enableAutoUpdate") {
    startAutoUpdate();
    return true;
  } else if (message.action === "disableAutoUpdate") {
    stopAutoUpdate();
    return true;
  }

  return false;
});

// Get appropriate styles for a hostname based on all rules
async function getStylesForHostname(hostname, settings) {
  // Check for exact matches
  if (cssCache.has(hostname)) {
    return cssCache.get(hostname);
  } else if (cssCache.has(`www.${hostname}`)) {
    return cssCache.get(`www.${hostname}`);
  } else {
    // Check for wildcard matches (+domain.com)
    for (const [cachedSite, cachedCSS] of cssCache.entries()) {
      if (cachedSite.startsWith("+")) {
        const baseSite = cachedSite.slice(1);
        if (hostname.endsWith(baseSite)) {
          return cachedCSS;
        }
      } else if (hostname.endsWith(cachedSite)) {
        return cachedCSS;
      }
    }

    // Check for forced styles
    if (settings.forceStyling) {
      const skipListData = await browser.storage.local.get(
        SKIP_FORCE_THEMING_KEY
      );
      const siteList = skipListData[SKIP_FORCE_THEMING_KEY] || [];
      const isWhitelistMode = settings.whitelistMode || false;
      const siteInList = siteList.includes(hostname);

      // In whitelist mode: apply only if site is in the list
      // In blacklist mode: apply only if site is NOT in the list
      if (
        (isWhitelistMode && siteInList) ||
        (!isWhitelistMode && !siteInList)
      ) {
        if (cssCache.has("example.com")) {
          return cssCache.get("example.com");
        } else {
          return "/* Default fallback CSS */";
        }
      }
    }
  }

  return null;
}

// Prepare styles for a URL that's about to load
async function prepareStylesForUrl(hostname, tabId) {
  try {
    const settingsData = await browser.storage.local.get(
      "transparentZenSettings"
    );
    const settings = settingsData.transparentZenSettings || {};

    if (settings.enableStyling === false) return;

    const css = await getStylesForHostname(hostname, settings);

    if (css && tabId) {
      // Store the CSS to be ready as soon as the content script connects
      activeTabs.set(tabId, {
        hostname: hostname,
        css: css,
      });
    }
  } catch (error) {
    console.error("Error preparing styles for URL:", error);
  }
}

async function applyCSSToTab(tab) {
  if (logging) console.log("applyCSSToTab called with", tab);

  try {
    const url = new URL(tab.url);
    const hostname = url.hostname;

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
    console.error(`Error applying CSS:`, error);
  }
}

async function applyCSS(tabId, hostname, features) {
  if (!features) return;

  const settingsData = await browser.storage.local.get("transparentZenSettings");
  const globalSettings = settingsData.transparentZenSettings || {};
  const siteKey = `transparentZenSettings.${hostname}`;
  const siteData = await browser.storage.local.get(siteKey);
  const featureSettings = siteData[siteKey] || {};

  let combinedCSS = "";
  for (const [feature, css] of Object.entries(features)) {
    // Skip any transparency feature if disableTransparency is enabled globally
    if (globalSettings.disableTransparency && feature.toLowerCase().includes("transparency")) {
      if (logging) console.log(`Skipping transparency feature: ${feature}`);
      continue;
    }
    
    if (featureSettings[feature] !== false) {
      combinedCSS += css + "\n";
    }
  }

  if (combinedCSS) {
    try {
      // Try to send via messaging (most reliable for instant application)
      await browser.tabs.sendMessage(tabId, {
        action: "applyStyles",
        css: combinedCSS,
      });
    } catch (e) {
      // Fallback to insertCSS if messaging fails
      await browser.tabs.insertCSS(tabId, {
        code: combinedCSS,
        runAt: "document_start",
      });
    }
    console.log(`Injected custom CSS for ${hostname}`);
  }
}

let autoUpdateInterval;

function startAutoUpdate() {
  if (logging) console.log("startAutoUpdate called");
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
  autoUpdateInterval = setInterval(refetchCSS, 2 * 60 * 60 * 1000);
}

function stopAutoUpdate() {
  if (logging) console.log("stopAutoUpdate called");
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
}

async function refetchCSS() {
  if (logging) console.log("refetchCSS called");
  try {
    const response = await fetch(
      "https://sameerasw.github.io/my-internet/styles.json",
      { headers: { "Cache-Control": "no-cache" } }
    );
    if (!response.ok) throw new Error("Failed to fetch styles.json");
    const styles = await response.json();
    await browser.storage.local.set({ styles });
    await browser.storage.local.set({ lastFetchedTime: Date.now() });
    console.info("All styles refetched and updated from GitHub.");

    // Preload the new styles
    preloadStyles();
  } catch (error) {
    console.error("Error refetching styles:", error);
  }
}

// Create a directory to store CSS files
async function initializeExtension() {
  // Preload styles immediately
  await preloadStyles();

  // Initialize auto-update based on stored settings
  const settings = await browser.storage.local.get("transparentZenSettings");
  if (settings.transparentZenSettings?.autoUpdate) {
    startAutoUpdate();
  }
}

// Listen for specific navigation events to apply CSS as early as possible
browser.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    browser.tabs
      .get(details.tabId)
      .then((tab) => {
        applyCSSToTab(tab);
      })
      .catch((err) => {
        console.error("Error getting tab info:", err);
      });
  }
});

// Application start
initializeExtension();
