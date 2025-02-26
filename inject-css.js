browser.storage.local.get("transparentZenSettings").then((settings) => {
  if (settings.transparentZenSettings?.enableStyling) {
    browser.storage.local.get("styles").then((data) => {
      const currentUrl = window.location.hostname;
      const cssFileName = Object.keys(data.styles?.website || {}).find((key) =>
        currentUrl.includes(key.replace(".css", ""))
      );

      if (cssFileName) {
        const features = data.styles.website[cssFileName];
        const featureSettings = settings.transparentZenSettings.featureSettings?.[cssFileName] || {};
        
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
          console.log(`Injected custom CSS for ${currentUrl}`);
        }
      }
    });
  }
});
