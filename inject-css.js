browser.storage.sync.get("transparentZenSettings").then((settings) => {
  if (settings.transparentZenSettings?.enableStyling) {
    fetch(browser.runtime.getURL("mapper.json"))
      .then((response) => response.json())
      .then((mapping) => {
        const currentUrl = window.location.hostname;
        const matchedKey = Object.keys(mapping).find((key) =>
          currentUrl.includes(key)
        );
        const cssFileName = mapping[matchedKey];
        if (
          cssFileName &&
          settings.transparentZenSettings.websiteSettings?.[matchedKey] !==
            false
        ) {
          browser.storage.sync.get(cssFileName).then((data) => {
            if (data[cssFileName]) {
              let style = document.createElement("style");
              style.textContent = data[cssFileName];
              document.head.appendChild(style);
              console.log(`Injected custom CSS for ${currentUrl}`);
            }
          });
        }
      });
  }
});
