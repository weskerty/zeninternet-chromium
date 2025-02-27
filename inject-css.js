let logging = true;

if (logging) console.log("inject-css.js script loaded");

browser.storage.local.get("transparentZenSettings").then((settings) => {
  if (logging) console.log("Settings loaded", settings);

  if (settings.transparentZenSettings?.enableStyling) {
    if (logging) console.log("Styling is enabled");

    browser.storage.local.get("styles").then((data) => {
      if (logging) console.log("Styles data loaded", data);

      const currentUrl = window.location.hostname;
      if (logging) console.log("Current URL hostname", currentUrl);

      const cssFileName = Object.keys(data.styles?.website || {}).find(
        (key) => {
          const siteName = key.replace(".css", "");
          return currentUrl === siteName || currentUrl === `www.${siteName}`;
        }
      );

      if (cssFileName) {
        if (logging)
          console.log("CSS file found for current site", cssFileName);

        const features = data.styles.website[cssFileName];
        const featureSettings =
          settings.transparentZenSettings.featureSettings?.[cssFileName] || {};

        let combinedCSS = "";
        for (const [feature, css] of Object.entries(features)) {
          if (featureSettings[feature] !== false) {
            combinedCSS += css + "\n";
          }
        }

        if (combinedCSS) {
          let style = document.createElement("style");
          style.textContent = combinedCSS;
          document.head.appendChild(style);
          if (logging) console.log(`Injected custom CSS for ${currentUrl}`);
        }
      } else {
        if (logging) console.log("No CSS file found for current site");
      }
    });
  } else {
    if (logging) console.log("Styling is disabled");
  }
});
