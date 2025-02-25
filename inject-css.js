browser.storage.local.get("transparentZenSettings").then((settings) => {
  if (settings.transparentZenSettings?.enableStyling) {
    browser.storage.local.get("styles").then((data) => {
      const currentUrl = window.location.hostname;
      const cssFileName = Object.keys(data.styles).find((key) =>
        currentUrl.includes(key.replace(".css", ""))
      );
      if (
        cssFileName &&
        settings.transparentZenSettings.websiteSettings?.[
          cssFileName.replace(".css", "")
        ] !== false
      ) {
        let style = document.createElement("style");
        style.textContent = data.styles[cssFileName];
        document.head.appendChild(style);
        console.log(`Injected custom CSS for ${currentUrl}`);
      }
    });
  }
});
