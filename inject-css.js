import { SKIP_FORCE_THEMING_KEY } from "./shared/constants.js";

let logging = false;

if (logging) console.log("inject-css.js script loaded");

(async () => {
  try {
    const settings = await browser.storage.local.get("transparentZenSettings");
    if (logging) console.log("Settings loaded", settings);

    if (!settings.transparentZenSettings?.enableStyling) {
      if (logging) console.log("Styling is disabled");
      return;
    }

    if (logging) console.log("Styling is enabled");
    const data = await browser.storage.local.get("styles");
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
  const siteData = await browser.storage.local.get(siteKey);
  const featureSettings = siteData[siteKey] || {};

  let combinedCSS = "";
  for (const [feature, css] of Object.entries(features)) {
    if (featureSettings[feature] !== false) {
      combinedCSS += css + "\n";
    }
  }

  if (combinedCSS) {
    const style = document.createElement("style");
    style.textContent = combinedCSS;
    document.head.appendChild(style);
    if (logging) console.log(`Injected custom CSS for ${hostname}`);
  }
}
