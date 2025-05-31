let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let SKIP_THEMING_KEY = "skipThemingList";
let BROWSER_STORAGE_KEY = "transparentZenSettings";
let logging = true; // Enable logging for debugging

// Create a cache for pre-processed CSS to speed up repeated visits
const cssCache = new Map();
const activeTabs = new Map();
// Cache for styling state to avoid repeated storage lookups
const stylingStateCache = new Map();

// Icon states for the browser action
const ICON_ON = {
  48: "assets/images/logo_48.png",
  96: "assets/images/logo_96.png",
};
const ICON_OFF = {
  48: "assets/images/logo-off_48.png",
  96: "assets/images/logo-off_96.png",
};

// Default settings to use when values are missing
const DEFAULT_SETTINGS = {
  enableStyling: true, // Enable styling globally
  autoUpdate: true, // Auto-update styles
  forceStyling: false, // Force styling on sites without themes
  whitelistMode: false, // Use blacklist mode by default for force styling
  whitelistStyleMode: false, // Use blacklist mode by default for regular styling
  disableTransparency: false, // Don't disable transparency by default
  disableHover: false, // Don't disable hover effects by default
  disableFooter: false, // Don't disable footers by default
};

// Helper function to normalize hostnames by removing www. prefix
function normalizeHostname(hostname) {
  return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
}

// Ensure all required settings exist
function ensureDefaultSettings(settings = {}) {
  const result = { ...settings };

  // Apply default values for any missing settings
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (result[key] === undefined) {
      result[key] = defaultValue;
    }
  }

  return result;
}

// Enhanced function to determine styling state with more detailed information
async function shouldApplyStyling(hostname) {
  try {
    // Check if we already have the answer cached
    const cacheKey = `styling:${hostname}`;
    if (stylingStateCache.has(cacheKey)) {
      return stylingStateCache.get(cacheKey);
    }

    const normalizedHostname = normalizeHostname(hostname);

    // Get global settings - this is an unavoidable storage lookup
    const settingsData = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    const settings = ensureDefaultSettings(
      settingsData[BROWSER_STORAGE_KEY] || {}
    );

    // If styling is globally disabled, return detailed state
    if (!settings.enableStyling) {
      const result = {
        shouldApply: false,
        reason: "globally_disabled",
        shouldApplyMinimal: true, // Still apply background when globally disabled
      };
      stylingStateCache.set(cacheKey, result);
      return result;
    }

    // Check if we have a specific style for this site
    let hasSpecificStyle = false;

    // Check for exact match first
    if (
      cssCache.has(normalizedHostname) ||
      cssCache.has(`www.${normalizedHostname}`)
    ) {
      hasSpecificStyle = true;
    } else {
      // Check for wildcard and TLD matches
      for (const cachedSite of cssCache.keys()) {
        // Wildcard match
        if (cachedSite.startsWith("+")) {
          const baseSite = cachedSite.slice(1);
          if (
            normalizedHostname === baseSite ||
            normalizedHostname.endsWith(`.${baseSite}`)
          ) {
            hasSpecificStyle = true;
            break;
          }
        }
        // TLD suffix match
        else if (cachedSite.startsWith("-")) {
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
        }
        // Subdomain match
        else if (
          normalizedHostname !== cachedSite &&
          normalizedHostname.endsWith(`.${cachedSite}`) &&
          !cachedSite.startsWith("-")
        ) {
          hasSpecificStyle = true;
          break;
        }
      }
    }

    // If we have a specific style, check blacklist/whitelist for regular styling
    if (hasSpecificStyle) {
      // Get skip styling list - only do this lookup if we have a specific style
      const skipStyleListData = await browser.storage.local.get(
        SKIP_THEMING_KEY
      );
      const skipStyleList = skipStyleListData[SKIP_THEMING_KEY] || [];

      // In whitelist mode: only apply if site is in the list
      // In blacklist mode: apply unless site is in the list
      const styleMode = settings.whitelistStyleMode || false;

      if (styleMode) {
        // Whitelist mode
        const shouldApply = skipStyleList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "whitelisted" : "not_whitelisted",
          shouldApplyMinimal: !shouldApply, // Apply minimal when not whitelisted
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      } else {
        // Blacklist mode
        const shouldApply = !skipStyleList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "not_blacklisted" : "blacklisted",
          shouldApplyMinimal: !shouldApply, // Apply minimal when blacklisted
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      }
    }

    // If no specific style, check if we should apply forced styling
    if (settings.forceStyling) {
      // Get skip force list - only do this lookup if force styling is enabled
      const skipForceListData = await browser.storage.local.get(
        SKIP_FORCE_THEMING_KEY
      );
      const skipForceList = skipForceListData[SKIP_FORCE_THEMING_KEY] || [];
      const isWhitelistMode = settings.whitelistMode || false;

      // In whitelist mode: only apply if site is in the list
      // In blacklist mode: apply unless site is in the list
      if (isWhitelistMode) {
        const shouldApply = skipForceList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "force_whitelisted" : "force_not_whitelisted",
          shouldApplyMinimal: !shouldApply, // Apply minimal when force not whitelisted
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      } else {
        const shouldApply = !skipForceList.includes(normalizedHostname);
        const result = {
          shouldApply,
          reason: shouldApply ? "force_not_blacklisted" : "force_blacklisted",
          shouldApplyMinimal: !shouldApply, // Apply minimal when force blacklisted
        };
        stylingStateCache.set(cacheKey, result);
        return result;
      }
    }

    // No styling applies
    const result = {
      shouldApply: false,
      reason: "no_styling_rules",
      shouldApplyMinimal: false,
    };
    stylingStateCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error determining styling state:", error);
    return { shouldApply: false, reason: "error", shouldApplyMinimal: false };
  }
}

// New function to apply minimal styling (just background color)
async function applyMinimalCSS(tabId, hostname) {
  console.log(
    "DEBUG: applyMinimalCSS called for tab",
    tabId,
    "hostname",
    hostname
  );

  const backgroundCSS = `
/* ZenInternet: Minimal styling - background color when main styling is disabled/skipped */
body {
    background-color: light-dark(#fff, #111) !important;
}
`;

  try {
    // Try to send via messaging first
    console.log(`DEBUG: Sending minimal styles to tab ${tabId} via messaging`);
    await browser.tabs.sendMessage(tabId, {
      action: "applyStyles",
      css: backgroundCSS,
    });
  } catch (e) {
    // Fallback to insertCSS if messaging fails
    console.log(
      `DEBUG: Messaging failed, falling back to insertCSS: ${e.message}`
    );
    await browser.tabs.insertCSS(tabId, {
      code: backgroundCSS,
      runAt: "document_start",
    });
  }

  console.log(`DEBUG: Successfully applied minimal CSS for ${hostname}`);
}

// Update the icon based on whether styling is active for the current tab
async function updateIconForTab(tabId, url) {
  try {
    if (!url) {
      const tab = await browser.tabs.get(tabId);
      url = tab.url;
    }

    // Non-HTTP URLs don't get styling
    if (!url || !url.startsWith("http")) {
      setIcon(tabId, false);
      return;
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Determine styling state using the enhanced function
    const stylingState = await shouldApplyStyling(hostname);

    // Update the icon based on whether full styling is enabled for this site
    setIcon(tabId, stylingState.shouldApply);

    if (logging)
      console.log(
        `Icon updated for ${hostname}: styling ${
          stylingState.shouldApply ? "ON" : "OFF"
        } (${stylingState.reason})`
      );
  } catch (error) {
    console.error("Error updating icon:", error);
    setIcon(tabId, false);
  }
}

// Set the icon to either on or off state
function setIcon(tabId, isEnabled) {
  const iconSet = isEnabled ? ICON_ON : ICON_OFF;
  browser.browserAction.setIcon({
    path: iconSet,
    tabId: tabId,
  });
}

// Preload styles for faster injection
async function preloadStyles() {
  try {
    const data = await browser.storage.local.get([
      "styles",
      BROWSER_STORAGE_KEY,
    ]);

    // Ensure we have all required settings with defaults
    const settings = ensureDefaultSettings(data[BROWSER_STORAGE_KEY] || {});

    // Save the validated settings back to storage if any defaults were applied
    if (
      JSON.stringify(settings) !== JSON.stringify(data[BROWSER_STORAGE_KEY])
    ) {
      if (logging)
        console.log("Missing settings detected, applying defaults:", settings);
      await browser.storage.local.set({ [BROWSER_STORAGE_KEY]: settings });
    }

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

    // Update icon for this tab
    updateIconForTab(details.tabId, details.url);
  }
});

// Listen for content scripts announcing they're ready
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "contentScriptReady" && message.hostname) {
    try {
      // Look for cached styles for this hostname or its domain match
      const normalizedHostname = normalizeHostname(message.hostname);

      // Get settings to check if styling is enabled
      const settingsData = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      const settings = ensureDefaultSettings(
        settingsData[BROWSER_STORAGE_KEY] || {}
      );

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

  // Update the icon when the content script reports ready
  if (message.action === "contentScriptReady" && sender.tab) {
    updateIconForTab(sender.tab.id, sender.tab.url);
  }

  return false;
});

// Get appropriate styles for a hostname based on all rules
async function getStylesForHostname(hostname, settings) {
  // Ensure all required settings have defaults before proceeding
  settings = ensureDefaultSettings(settings);

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
    const settingsData = await browser.storage.local.get(BROWSER_STORAGE_KEY);

    // Ensure all required settings have defaults
    const settings = ensureDefaultSettings(
      settingsData[BROWSER_STORAGE_KEY] || {}
    );

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

    // Use the enhanced shouldApplyStyling function
    const stylingState = await shouldApplyStyling(hostname);
    console.log("DEBUG: Styling state:", stylingState);

    // Update icon based on whether full styling is applied
    setIcon(tab.id, stylingState.shouldApply);

    // If full styling should be applied, proceed with normal CSS application
    if (stylingState.shouldApply) {
      const settings = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      const globalSettings = ensureDefaultSettings(
        settings[BROWSER_STORAGE_KEY] || {}
      );

      const data = await browser.storage.local.get("styles");
      console.log(
        "DEBUG: Loaded styles count:",
        Object.keys(data.styles?.website || {}).length
      );

      // Find the best matching CSS file
      let bestMatch = null;
      let bestMatchLength = 0;
      let matchType = "none";

      for (const key of Object.keys(data.styles?.website || {})) {
        const siteName = key.replace(".css", "");
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
      } else if (
        globalSettings.forceStyling &&
        data.styles.website["example.com.css"]
      ) {
        console.log("DEBUG: Applying forced styling with example.com.css");
        await applyCSS(
          tab.id,
          hostname,
          data.styles.website["example.com.css"]
        );
        return;
      }
    }

    // If full styling is not applied but minimal styling should be applied
    if (!stylingState.shouldApply && stylingState.shouldApplyMinimal) {
      console.log(
        "DEBUG: Applying minimal styling due to:",
        stylingState.reason
      );
      await applyMinimalCSS(tab.id, hostname);
      return;
    }

    console.log(
      "DEBUG: No styling applied for:",
      hostname,
      "Reason:",
      stylingState.reason
    );
  } catch (error) {
    console.error(`DEBUG ERROR: Error applying CSS:`, error);
    setIcon(tab.id, false);
  }
}

async function applyCSS(tabId, hostname, features) {
  console.log("DEBUG: applyCSS called for tab", tabId, "hostname", hostname);

  if (!features) {
    console.log("DEBUG: No features to apply, exiting early");
    return;
  }

  console.log("DEBUG: Features count:", Object.keys(features).length);

  const settingsData = await browser.storage.local.get(BROWSER_STORAGE_KEY);

  // Ensure defaults for any missing settings
  const globalSettings = ensureDefaultSettings(
    settingsData[BROWSER_STORAGE_KEY] || {}
  );

  console.log(
    "DEBUG: Global settings in applyCSS:",
    JSON.stringify(globalSettings)
  );

  // UPDATED: Use normalized hostname for consistent settings retrieval
  const normalizedHostname = normalizeHostname(hostname);
  const siteKey = `transparentZenSettings.${normalizedHostname}`;
  const siteData = await browser.storage.local.get(siteKey);
  const featureSettings = siteData[siteKey] || {};

  console.log(
    "DEBUG: Site-specific settings from normalized key:",
    siteKey,
    JSON.stringify(featureSettings)
  );

  let combinedCSS = "";
  let includedFeatures = 0;
  let skippedTransparencyFeatures = 0;
  let skippedHoverFeatures = 0;
  let skippedFooterFeatures = 0;
  let skippedDisabledFeatures = 0;
  let totalTransparencyFeatures = 0;

  for (const [feature, css] of Object.entries(features)) {
    const isTransparencyFeature = feature
      .toLowerCase()
      .includes("transparency");
    const isHoverFeature = feature.toLowerCase().includes("hover");
    const isFooterFeature = feature.toLowerCase().includes("footer");

    // Count total transparency features
    if (isTransparencyFeature) {
      totalTransparencyFeatures++;
    }

    // Skip any transparency feature if disableTransparency is enabled globally
    if (globalSettings.disableTransparency && isTransparencyFeature) {
      console.log(`DEBUG: Skipping transparency feature: ${feature}`);
      skippedTransparencyFeatures++;
      continue;
    }

    // Skip any hover feature if disableHover is enabled globally
    if (globalSettings.disableHover && isHoverFeature) {
      console.log(`DEBUG: Skipping hover feature: ${feature}`);
      skippedHoverFeatures++;
      continue;
    }

    // Skip any footer feature if disableFooter is enabled globally
    if (globalSettings.disableFooter && isFooterFeature) {
      console.log(`DEBUG: Skipping footer feature: ${feature}`);
      skippedFooterFeatures++;
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
      // Count disabled transparency features for site-specific logic
      if (isTransparencyFeature) {
        skippedTransparencyFeatures++;
      }
    }
  }

  // Check if transparency is effectively disabled (globally or all site transparency features disabled)
  const transparencyDisabled =
    globalSettings.disableTransparency ||
    (totalTransparencyFeatures > 0 &&
      skippedTransparencyFeatures === totalTransparencyFeatures);

  // Add background color CSS if transparency is disabled
  if (transparencyDisabled) {
    const backgroundCSS = `
/* ZenInternet: Background color when transparency is disabled */
body {
    background-color: light-dark(#fff, #111) !important;
}
`;
    combinedCSS += backgroundCSS;
    console.log(
      `DEBUG: Added background color CSS due to disabled transparency`
    );
  }

  console.log(
    `DEBUG: CSS Summary - included: ${includedFeatures}, skipped transparency: ${skippedTransparencyFeatures}, skipped hover: ${skippedHoverFeatures}, skipped footer: ${skippedFooterFeatures}, skipped disabled: ${skippedDisabledFeatures}, transparency disabled: ${transparencyDisabled}`
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

  // Update the icon based on our current state
  setIcon(tabId, stylingStateCache.get(`styling:${hostname}`) || false);
}

// Also update icons when tabs are updated
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateIconForTab(tabId, tab.url);
  }
});

// Update the icon when a tab becomes active
browser.tabs.onActivated.addListener((activeInfo) => {
  updateIconForTab(activeInfo.tabId);
});

// Clear cache on settings changes
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    if (
      changes[BROWSER_STORAGE_KEY] ||
      changes[SKIP_THEMING_KEY] ||
      changes[SKIP_FORCE_THEMING_KEY]
    ) {
      // Clear the styling state cache when relevant settings change
      stylingStateCache.clear();

      if (logging)
        console.log("Cleared styling state cache due to settings change");
    }
  }
});

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
    // Get the repository URL from storage or use the default one
    const DEFAULT_REPOSITORY_URL =
      "https://sameerasw.github.io/my-internet/styles.json";
    const repoUrlData = await browser.storage.local.get("stylesRepositoryUrl");
    const repositoryUrl =
      repoUrlData.stylesRepositoryUrl || DEFAULT_REPOSITORY_URL;

    console.log("Background: Fetching styles from:", repositoryUrl);

    const response = await fetch(repositoryUrl, {
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok)
      throw new Error(`Failed to fetch styles (Status: ${response.status})`);
    const styles = await response.json();
    await browser.storage.local.set({ styles });

    // Check if we need to initialize default settings
    const settingsData = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    if (!settingsData[BROWSER_STORAGE_KEY]) {
      // Initialize default settings if none exist
      const defaultSettings = {
        enableStyling: true,
        autoUpdate: true,
        forceStyling: false,
        whitelistMode: false,
        whitelistStyleMode: false,
        lastFetchedTime: Date.now(),
      };

      // Save default settings
      await browser.storage.local.set({
        [BROWSER_STORAGE_KEY]: defaultSettings,
      });
      console.info("Initialized default settings during first fetch");
    } else {
      // Just update the lastFetchedTime
      await browser.storage.local.set({ lastFetchedTime: Date.now() });
    }

    console.info(`All styles refetched and updated from ${repositoryUrl}`);

    // Preload the new styles
    preloadStyles();
  } catch (error) {
    console.error("Error refetching styles:", error);
  }
}

// Create a directory to store CSS files
async function initializeExtension() {
  // Check and initialize default settings
  const data = await browser.storage.local.get(BROWSER_STORAGE_KEY);
  const currentSettings = data[BROWSER_STORAGE_KEY] || {};
  const validatedSettings = ensureDefaultSettings(currentSettings);

  // If we had to apply any defaults, save them
  if (JSON.stringify(validatedSettings) !== JSON.stringify(currentSettings)) {
    console.info(
      "Initializing missing settings with defaults:",
      validatedSettings
    );
    await browser.storage.local.set({
      [BROWSER_STORAGE_KEY]: validatedSettings,
    });
  }

  // Ensure empty lists exist
  const skipForceData = await browser.storage.local.get(SKIP_FORCE_THEMING_KEY);
  if (!skipForceData[SKIP_FORCE_THEMING_KEY]) {
    await browser.storage.local.set({ [SKIP_FORCE_THEMING_KEY]: [] });
  }

  const skipThemingData = await browser.storage.local.get(SKIP_THEMING_KEY);
  if (!skipThemingData[SKIP_THEMING_KEY]) {
    await browser.storage.local.set({ [SKIP_THEMING_KEY]: [] });
  }

  // Preload styles immediately
  await preloadStyles();

  // Initialize auto-update based on stored settings
  if (validatedSettings.autoUpdate) {
    startAutoUpdate();
  }

  // Update icons for all tabs on extension startup
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    updateIconForTab(tab.id, tab.url);
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
