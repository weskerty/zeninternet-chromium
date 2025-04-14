import { SKIP_FORCE_THEMING_KEY } from "./shared/constants.js";

let logging = false;

if (logging) console.log("inject-css.js script loaded");

// Run as early as possible in the document lifecycle
const implementImmediateInjection = () => {
  // Create a style element immediately to avoid any delay - do this before anything else
  const styleElement = document.createElement("style");
  styleElement.id = "zen-internet-styles";

  // Set highest priority
  styleElement.setAttribute("data-priority", "highest");

  // Add !important to all rules to override any existing styles
  styleElement.innerHTML = `
    /* Prevent FOUC - temporarily hide content until styles are applied */
    body { opacity: 0 !important; transition: opacity 0.1s ease-in !important; }
  `;

  // Insert as the first element of head if possible
  if (document.head) {
    document.head.insertBefore(styleElement, document.head.firstChild);
  } else {
    // If head isn't ready yet (very early execution), add to documentElement
    document.documentElement.appendChild(styleElement);

    // Set up mutation observer to move it to head when head becomes available
    new MutationObserver((mutations, observer) => {
      if (document.head) {
        if (styleElement.parentNode !== document.head) {
          document.head.insertBefore(styleElement, document.head.firstChild);
        }
        observer.disconnect();
      }
    }).observe(document.documentElement, { childList: true });
  }

  return styleElement;
};

// Create style element immediately
const styleElement = implementImmediateInjection();

// Function to apply styles immediately when available
function applyStyles(css) {
  if (!css) return;

  // Add the CSS
  try {
    // For immediate application, directly set textContent
    // as this is more reliably applied in early document stages
    styleElement.textContent =
      css.trim() +
      `
/* Remove FOUC prevention once styles are loaded */
body { opacity: 1 !important; }`;

    // After a very short delay (to ensure CSS application), ensure body is visible
    setTimeout(() => {
      if (document.body) {
        document.body.style.opacity = "1";
      }
    }, 10);

    if (logging) console.log("Styles applied:", css.length, "bytes");
  } catch (e) {
    console.error("Error applying styles:", e);
  }
}

// Listen for style data from background script for immediate injection
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "applyStyles" && message.css) {
    applyStyles(message.css);
    return true;
  }
});

// Send hostname to background script as early as possible
browser.runtime
  .sendMessage({
    action: "contentScriptReady",
    hostname: window.location.hostname,
    url: window.location.href,
  })
  .catch((err) => {
    if (logging) console.log("Background script not ready yet:", err);
  });

// Main function - but we don't wait for this before applying styles
// This is just a backup in case background script injection fails
(async () => {
  try {
    const settings = await browser.storage.local.get("transparentZenSettings");
    if (logging) console.log("Settings loaded", settings);

    if (!settings.transparentZenSettings?.enableStyling) {
      if (logging) console.log("Styling is disabled");
      return;
    }

    if (logging) console.log("Styling is enabled");

    // Tell background script we're ready and what page we're on
    browser.runtime.sendMessage({
      action: "contentScriptReady",
      hostname: window.location.hostname,
    });

    const data = await browser.storage.local.get("styles");
    if (!data.styles) {
      if (logging) console.log("No styles data available");
      return;
    }

    if (logging) console.log("Styles data loaded", data);

    const currentUrl = window.location.hostname;
    if (logging) console.log("Current URL hostname", currentUrl);

    // Find the best matching CSS file
    let bestMatch = null;
    let bestMatchLength = 0;

    for (const key of Object.keys(data.styles?.website || {})) {
      const siteName = key.replace(".css", "");
      if (siteName.startsWith("+")) {
        const baseSiteName = siteName.slice(1);
        if (
          currentUrl.endsWith(baseSiteName) &&
          baseSiteName.length > bestMatchLength
        ) {
          bestMatch = key;
          bestMatchLength = baseSiteName.length;
        }
      } else if (currentUrl === siteName || currentUrl === `www.${siteName}`) {
        // Exact match has priority
        bestMatch = key;
        break;
      } else if (
        currentUrl.endsWith(siteName) &&
        siteName.length > bestMatchLength
      ) {
        bestMatch = key;
        bestMatchLength = siteName.length;
      }
    }

    // If a direct match was found, use it
    if (bestMatch) {
      await injectCSS(currentUrl, data.styles.website[bestMatch]);
      return;
    }

    // If no direct match was found and force styling is enabled, check whitelist/blacklist mode
    if (settings.transparentZenSettings?.forceStyling) {
      const skipListData = await browser.storage.local.get(
        SKIP_FORCE_THEMING_KEY
      );
      const siteList = skipListData[SKIP_FORCE_THEMING_KEY] || [];
      const isWhitelistMode =
        settings.transparentZenSettings?.whitelistMode || false;
      const siteInList = siteList.includes(currentUrl);

      // In whitelist mode: apply only if site is in the list
      // In blacklist mode: apply only if site is NOT in the list
      if (
        (isWhitelistMode && siteInList) ||
        (!isWhitelistMode && !siteInList)
      ) {
        await injectCSS(currentUrl, data.styles.website["example.com.css"]);
      } else {
        if (logging)
          console.log(
            `Styling skipped due to ${
              isWhitelistMode ? "whitelist" : "blacklist"
            } mode settings`
          );
      }
    } else {
      if (logging) console.log("No CSS file found for current site");
    }
  } catch (error) {
    console.error("Error injecting CSS:", error);
  }
})();

async function injectCSS(hostname, features) {
  if (!features) return;

  const siteKey = `transparentZenSettings.${hostname}`;
  const settings = await browser.storage.local.get("transparentZenSettings");
  const globalSettings = settings.transparentZenSettings || {};
  const siteData = await browser.storage.local.get(siteKey);
  const featureSettings = siteData[siteKey] || {};

  let combinedCSS = "";
  for (const [feature, css] of Object.entries(features)) {
    // Skip any transparency feature if disableTransparency is enabled globally
    if (
      globalSettings.disableTransparency &&
      feature.toLowerCase().includes("transparency")
    ) {
      if (logging) console.log(`Skipping transparency feature: ${feature}`);
      continue;
    }

    // Apply the feature if it's not explicitly disabled
    if (featureSettings[feature] !== false) {
      combinedCSS += css + "\n";
    }
  }

  if (combinedCSS) {
    applyStyles(combinedCSS);
    if (logging) console.log(`Injected custom CSS for ${hostname}`);
  }
}
