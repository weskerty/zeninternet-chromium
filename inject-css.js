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

    let cssFileName = Object.keys(data.styles?.website || {}).find((key) => {
      const siteName = key.replace(".css", "");
      if (siteName.startsWith("+")) {
        const baseSiteName = siteName.slice(1);
        return currentUrl.endsWith(baseSiteName);
      }
      return currentUrl === siteName || currentUrl === `www.${siteName}`;
    });

    const skipListData = await browser.storage.local.get(
      SKIP_FORCE_THEMING_KEY
    );
    const skipList = skipListData[SKIP_FORCE_THEMING_KEY] || [];

    if (!cssFileName && settings.transparentZenSettings?.forceStyling) {
      if (skipList.includes(currentUrl)) {
        if (logging) console.log("Skipping forced theming for this site");
        return;
      }
      cssFileName = "example.com.css";
    }

    if (!cssFileName) {
      if (logging) console.log("No CSS file found for current site");
      return;
    }

    if (logging) console.log("CSS file found for current site", cssFileName);

    const features = data.styles.website[cssFileName];
    const siteKey = `transparentZenSettings.${currentUrl}`;
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
      if (logging) console.log(`Injected custom CSS for ${currentUrl}`);
    }
  } catch (error) {
    console.error("Error injecting CSS:", error);
  }
})();
