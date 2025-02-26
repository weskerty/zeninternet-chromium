function applyCSSToTab(tab) {
  const url = new URL(tab.url);
  const hostname = url.hostname;

  browser.storage.local.get("transparentZenSettings").then((settings) => {
    if (settings.transparentZenSettings?.enableStyling) {
      browser.storage.local.get("styles").then((data) => {
        const cssFileName = Object.keys(data.styles?.website || {}).find(
          (key) => {
            const siteName = key.replace(".css", "");
            return hostname === siteName || hostname === `www.${siteName}`;
          }
        );

        if (cssFileName) {
          const features = data.styles.website[cssFileName];
          const featureSettings =
            settings.transparentZenSettings.featureSettings?.[cssFileName] ||
            {};

          let combinedCSS = "";
          for (const [feature, css] of Object.entries(features)) {
            if (featureSettings[feature] !== false) {
              combinedCSS += css + "\n";
            }
          }

          if (combinedCSS) {
            browser.tabs
              .insertCSS(tab.id, { code: combinedCSS })
              .then(() => {
                console.log(`Injected custom CSS for ${hostname}`);
              })
              .catch((error) => {
                console.error(`Error applying CSS to ${hostname}:`, error);
              });
          }
        }
      });
    }
  });
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    applyCSSToTab(tab);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browser.tabs.get(activeInfo.tabId);
  applyCSSToTab(tab);
});
