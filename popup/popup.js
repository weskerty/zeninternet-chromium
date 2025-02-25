new (class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  browserStorageSettings = {};
  extensionSettingsForm = document.getElementById("extension-settings");

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
      .addEventListener("click", this.refetchCSS);
    document
      .getElementById("restart-background")
      .addEventListener("click", this.restartBackground);
  }

  bindEvents() {
    this.extensionSettingsForm.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        this.saveSettings();
      });
    });
  }

  restoreSettings() {
    if (this.extensionSettingsForm?.elements) {
      for (const element of this.extensionSettingsForm.elements) {
        if (this.browserStorageSettings[element.name]) {
          element.checked = JSON.parse(
            this.browserStorageSettings[element.name]
          );
        }
      }
    }
  }

  async loadSettings() {
    const settings = await browser.storage.local.get(this.BROWSER_STORAGE_KEY);
    console.info("Settings loaded", settings?.[this.BROWSER_STORAGE_KEY]);
    return settings?.[this.BROWSER_STORAGE_KEY] || {};
  }

  saveSettings() {
    if (this.extensionSettingsForm?.elements) {
      for (const element of this.extensionSettingsForm.elements) {
        this.browserStorageSettings[element.name] = element.checked;
      }

      browser.storage.local.set({
        [this.BROWSER_STORAGE_KEY]: this.browserStorageSettings,
      });
      browser.runtime.sendMessage({ action: "updateSettings" });
      console.info("Settings saved", this.browserStorageSettings);
    }
  }

  async refetchCSS() {
    try {
      const response = await fetch(
        "https://sameerasw.github.io/my-internet/github.com.css",
        {
          headers: {
            'Cache-Control': 'no-cache'
          }
        }
      );
      if (!response.ok) throw new Error("Failed to fetch CSS");
      const cssText = await response.text();
      await browser.storage.local.set({ githubCSS: cssText });
      await browser.storage.sync.set({ githubCSS: cssText });
      browser.runtime.sendMessage({ action: "updateCSS" });
      console.info("CSS refetched and updated from GitHub." + cssText);
    } catch (error) {
      console.error("Error refetching CSS:", error);
    }
  }

  async restartBackground() {
    browser.runtime.sendMessage({ action: "restartBackground" });
    console.info("Background script restart requested.");
  }
})();