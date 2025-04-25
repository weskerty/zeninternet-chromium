let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let logging = true; // Enable logging for debugging

// Create a cache for pre-processed CSS to speed up repeated visits
const cssCache = new Map();
const activeTabs = new Map();

// Helper function to normalize hostnames by removing www. prefix
function normalizeHostname(hostname) {
  return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
}

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
    const url = new URL(details.url);
    const normalizedHostname = normalizeHostname(url.hostname);
    prepareStylesForUrl(normalizedHostname, details.tabId);
  }
});

// Listen for content scripts announcing they're ready
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "contentScriptReady" && message.hostname) {
    try {
      // Look for cached styles for this hostname or its domain match
      const normalizedHostname = normalizeHostname(message.hostname);

      // Get settings to check if styling is enabled
      const settingsData = await browser.storage.local.get(
        "transparentZenSettings"
      );
      const settings = settingsData.transparentZenSettings || {};

      if (settings.enableStyling === false) return;

      const css = await getStylesForHostname(normalizedHostname, settings);

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
  console.log("DEBUG: Finding styles for hostname:", hostname);

  // Check for exact matches first (highest priority)
  if (cssCache.has(hostname)) {
    console.log("DEBUG: Found exact hostname match in cache");
    return cssCache.get(hostname);
  } else if (cssCache.has(`www.${hostname}`)) {
    console.log("DEBUG: Found www prefix match in cache");
    return cssCache.get(`www.${hostname}`);
  } else {
    // Check for wildcard matches (+domain.com) and suffix matches (-domain.com)
    for (const [cachedSite, cachedCSS] of cssCache.entries()) {
      // Handle wildcard domain prefix matches (+example.com)
      if (cachedSite.startsWith("+")) {
        const baseSite = cachedSite.slice(1);
        // Ensure we're matching with proper domain boundary (dot or exact match)
        if (hostname === baseSite || hostname.endsWith(`.${baseSite}`)) {
          console.log(
            `DEBUG: Found wildcard match: ${cachedSite} for ${hostname}`
          );
          return cachedCSS;
        }
      }
      // Handle TLD suffix matches (-domain.com)
      else if (cachedSite.startsWith("-")) {
        const baseSite = cachedSite.slice(1);

        // Extract domain name without the TLD
        // For cached site: Use everything before the last dot(s)
        const cachedDomain = baseSite.split(".").slice(0, -1).join(".");

        // For hostname: Similarly extract the domain without the TLD
        const hostParts = hostname.split(".");
        const hostDomain =
          hostParts.length > 1 ? hostParts.slice(0, -1).join(".") : hostname;

        console.log(
          `DEBUG: Comparing domains - cached: ${cachedDomain}, host: ${hostDomain}`
        );

        if (cachedDomain && hostDomain && hostDomain === cachedDomain) {
          console.log(
            `DEBUG: Found TLD suffix match: ${cachedSite} for ${hostname}`
          );
          return cachedCSS;
        }
      }
      // Regular subdomain handling (exact match already checked above)
      else if (
        cachedSite !== hostname &&
        cachedSite !== `www.${hostname}` &&
        hostname.endsWith(`.${cachedSite}`) &&
        !cachedSite.startsWith("-")
      ) {
        // Only match subdomains, not partial domain names
        console.log(
          `DEBUG: Found subdomain match: ${cachedSite} for ${hostname}`
        );
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
  console.log("DEBUG: applyCSSToTab called for tab", tab.id, "URL:", tab.url);

  try {
    const url = new URL(tab.url);
    const originalHostname = url.hostname;
    const hostname = normalizeHostname(originalHostname);
    console.log(
      "DEBUG: Processing hostname:",
      hostname,
      "(original:",
      originalHostname,
      ")"
    );

    const settings = await browser.storage.local.get("transparentZenSettings");
    const globalSettings = settings.transparentZenSettings || {};
    console.log("DEBUG: Global settings:", JSON.stringify(globalSettings));

    if (globalSettings.enableStyling === false) {
      console.log("DEBUG: Styling is globally disabled, exiting early");
      return;
    }

    const data = await browser.storage.local.get("styles");
    console.log(
      "DEBUG: Loaded styles count:",
      Object.keys(data.styles?.website || {}).length
    );

    const skipListData = await browser.storage.local.get(
      SKIP_FORCE_THEMING_KEY
    );
    const siteList = skipListData[SKIP_FORCE_THEMING_KEY] || [];
    console.log("DEBUG: Skip/Whitelist contains", siteList.length, "sites");
    console.log("DEBUG: Current site in list:", siteList.includes(hostname));

    const isWhitelistMode = globalSettings.whitelistMode || false;
    console.log("DEBUG: Using whitelist mode:", isWhitelistMode);

    // Find the best matching CSS file
    let bestMatch = null;
    let bestMatchLength = 0;
    let matchType = "none";

    for (const key of Object.keys(data.styles?.website || {})) {
      const siteName = key.replace(".css", "");

      // For site names in the styles list, also normalize by removing www. if present
      const normalizedSiteName = normalizeHostname(siteName);

      // Exact match has highest priority - compare normalized hostnames
      if (hostname === normalizedSiteName) {
        bestMatch = key;
        matchType = "exact";
        console.log("DEBUG: Found exact match:", key);
        break;
      }

      // Then check wildcard matches
      if (siteName.startsWith("+")) {
        const baseSite = siteName.slice(1);
        // Ensure we're matching with proper domain boundary
        if (
          (hostname === baseSite || hostname.endsWith(`.${baseSite}`)) &&
          baseSite.length > bestMatchLength
        ) {
          bestMatch = key;
          bestMatchLength = baseSite.length;
          matchType = "wildcard";
          console.log(
            "DEBUG: Found wildcard match:",
            key,
            "with length",
            baseSite.length
          );
        }
      }
      // Check TLD suffix matches (-domain.com) - fixed implementation
      else if (siteName.startsWith("-")) {
        const baseSite = siteName.slice(1);

        // Extract domain name without the TLD
        // For cached site: Use everything before the last dot(s)
        const cachedDomain = baseSite.split(".").slice(0, -1).join(".");

        // For hostname: Similarly extract the domain without the TLD
        const hostParts = hostname.split(".");
        const hostDomain =
          hostParts.length > 1 ? hostParts.slice(0, -1).join(".") : hostname;

        console.log(
          `DEBUG: Comparing domains - cached: ${cachedDomain}, host: ${hostDomain}`
        );

        // Match if the domain part (without TLD) matches
        if (cachedDomain && hostDomain && hostDomain === cachedDomain) {
          // Only update if it's a better match (longer domain name part)
          if (cachedDomain.length > bestMatchLength) {
            bestMatch = key;
            bestMatchLength = cachedDomain.length;
            matchType = "suffix";
            console.log(
              "DEBUG: Found TLD suffix match:",
              key,
              "for",
              hostname,
              "with domain part:",
              cachedDomain
            );
          }
        }
      }
      // Last, check subdomain matches with proper domain boundary
      else if (
        hostname !== normalizedSiteName &&
        hostname.endsWith(`.${normalizedSiteName}`) &&
        !siteName.startsWith("-") &&
        normalizedSiteName.length > bestMatchLength
      ) {
        bestMatch = key;
        bestMatchLength = normalizedSiteName.length;
        matchType = "subdomain";
        console.log(
          "DEBUG: Found domain suffix match:",
          key,
          "with length",
          normalizedSiteName.length
        );
      }
    }

    // If we found a direct match, use it
    if (bestMatch) {
      console.log("DEBUG: Using match:", bestMatch, "of type:", matchType);
      await applyCSS(tab.id, hostname, data.styles.website[bestMatch]);
      return;
    } else {
      console.log("DEBUG: No direct style match found for:", hostname);
    }

    // Otherwise, check if we should apply forced styling
    console.log("DEBUG: Force styling enabled:", globalSettings.forceStyling);
    if (globalSettings.forceStyling) {
      const siteInList = siteList.includes(hostname);
      console.log("DEBUG: Site in list:", siteInList);

      // In whitelist mode: apply only if site is in the list
      // In blacklist mode: apply only if site is NOT in the list
      const shouldApplyForcedStyling =
        (isWhitelistMode && siteInList) || (!isWhitelistMode && !siteInList);
      console.log(
        "DEBUG: Should apply forced styling:",
        shouldApplyForcedStyling,
        "(Whitelist mode:",
        isWhitelistMode,
        ", Site in list:",
        siteInList,
        ")"
      );

      if (shouldApplyForcedStyling) {
        if (data.styles.website["example.com.css"]) {
          console.log("DEBUG: Applying forced styling with example.com.css");
          await applyCSS(
            tab.id,
            hostname,
            data.styles.website["example.com.css"]
          );
        } else {
          console.log("DEBUG: example.com.css not found in styles");
        }
      } else {
        console.log("DEBUG: Skipping forced styling due to site list rules");
      }
    } else {
      console.log("DEBUG: Force styling is disabled, no styles applied");
    }
  } catch (error) {
    console.error(`DEBUG ERROR: Error applying CSS:`, error);
  }
}

async function applyCSS(tabId, hostname, features) {
  console.log("DEBUG: applyCSS called for tab", tabId, "hostname", hostname);

  if (!features) {
    console.log("DEBUG: No features to apply, exiting early");
    return;
  }

  console.log("DEBUG: Features count:", Object.keys(features).length);

  const settingsData = await browser.storage.local.get(
    "transparentZenSettings"
  );
  const globalSettings = settingsData.transparentZenSettings || {};
  console.log(
    "DEBUG: Global settings in applyCSS:",
    JSON.stringify(globalSettings)
  );

  const siteKey = `transparentZenSettings.${hostname}`;
  const siteData = await browser.storage.local.get(siteKey);
  const featureSettings = siteData[siteKey] || {};
  console.log(
    "DEBUG: Site-specific settings:",
    JSON.stringify(featureSettings)
  );

  let combinedCSS = "";
  let includedFeatures = 0;
  let skippedTransparencyFeatures = 0;
  let skippedDisabledFeatures = 0;

  for (const [feature, css] of Object.entries(features)) {
    const isTransparencyFeature = feature
      .toLowerCase()
      .includes("transparency");
    // Skip any transparency feature if disableTransparency is enabled globally
    if (globalSettings.disableTransparency && isTransparencyFeature) {
      console.log(`DEBUG: Skipping transparency feature: ${feature}`);
      skippedTransparencyFeatures++;
      continue;
    }

    const isFeatureEnabled = featureSettings[feature] !== false;
    if (isFeatureEnabled) {
      combinedCSS += css + "\n";
      includedFeatures++;
      console.log(`DEBUG: Including feature: ${feature}`);
    } else {
      console.log(`DEBUG: Feature disabled in site settings: ${feature}`);
      skippedDisabledFeatures++;
    }
  }

  console.log(
    `DEBUG: CSS Summary - included: ${includedFeatures}, skipped transparency: ${skippedTransparencyFeatures}, skipped disabled: ${skippedDisabledFeatures}`
  );

  if (combinedCSS) {
    try {
      // Try to send via messaging (most reliable for instant application)
      console.log(
        `DEBUG: Sending styles to tab ${tabId} via messaging (${combinedCSS.length} bytes)`
      );
      await browser.tabs.sendMessage(tabId, {
        action: "applyStyles",
        css: combinedCSS,
      });
    } catch (e) {
      // Fallback to insertCSS if messaging fails
      console.log(
        `DEBUG: Messaging failed, falling back to insertCSS: ${e.message}`
      );
      await browser.tabs.insertCSS(tabId, {
        code: combinedCSS,
        runAt: "document_start",
      });
    }
    console.log(`DEBUG: Successfully injected custom CSS for ${hostname}`);
  } else {
    console.log(`DEBUG: No CSS to inject after filtering features`);
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
    const styles = await browser.storage.local.set({ styles });
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
