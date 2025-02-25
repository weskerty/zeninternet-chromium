new (class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  browserStorageSettings = {};
  enableStylingSwitch = document.getElementById("enable-styling");

  constructor() {
    this.loadSettings().then((settings) => {
      if (settings) {
        this.browserStorageSettings = settings;
        this.restoreSettings();
        this.bindEvents();
      }
    });
    document
      .getElementById("refetch-css")
      .addEventListener("click", this.refetchCSS.bind(this));
    document
      .getElementById("restart-background")
      .addEventListener("click", this.restartBackground);
  }

  bindEvents() {
    this.enableStylingSwitch.addEventListener("change", () => {
      this.saveSettings();
    });
  }

  restoreSettings() {
    if (this.browserStorageSettings.enableStyling !== undefined) {
      this.enableStylingSwitch.checked =
        this.browserStorageSettings.enableStyling;
    }
  }

  async loadSettings() {
    const settings = await browser.storage.local.get(this.BROWSER_STORAGE_KEY);
    console.info("Settings loaded", settings?.[this.BROWSER_STORAGE_KEY]);
    return settings?.[this.BROWSER_STORAGE_KEY] || {};
  }

  saveSettings() {
    this.browserStorageSettings.enableStyling =
      this.enableStylingSwitch.checked;

    browser.storage.local.set({
      [this.BROWSER_STORAGE_KEY]: this.browserStorageSettings,
    });
    browser.storage.sync.set({
      [this.BROWSER_STORAGE_KEY]: this.browserStorageSettings,
    });
    browser.runtime.sendMessage({ action: "updateSettings" });
    console.info("Settings saved", this.browserStorageSettings);
  }

  async refetchCSS() {
    try {
      const response = await fetch("/mapper.json", {
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch mapper.json");
      const mapping = await response.json();
      for (const [site, cssFileName] of Object.entries(mapping)) {
        const cssResponse = await fetch(
          `https://sameerasw.github.io/my-internet/${cssFileName}`,
          {
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );
        if (!cssResponse.ok) throw new Error(`Failed to fetch CSS for ${site}`);
        const cssText = await cssResponse.text();
        await browser.storage.local.set({ [cssFileName]: cssText });
        await browser.storage.sync.set({ [cssFileName]: cssText });
      }
      browser.runtime.sendMessage({ action: "updateCSS" });
      console.info("All CSS files refetched and updated from GitHub.");
    } catch (error) {
      console.error("Error refetching CSS:", error);
    }
  }

  async restartBackground() {
    browser.runtime.sendMessage({ action: "restartBackground" });
    console.info("Background script restart requested.");
  }
})();
