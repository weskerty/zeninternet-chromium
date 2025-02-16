new class ExtensionPopup {
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
  }

  bindEvents() {
    this.extensionSettingsForm.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        this.saveSettings();
      })
    });
  }

  restoreSettings() {
    if (this.extensionSettingsForm?.elements) {
      for (const element of this.extensionSettingsForm.elements) {
        if (this.browserStorageSettings[element.name]) {
          element.checked = JSON.parse(this.browserStorageSettings[element.name]);
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

      browser.storage.local.set({[this.BROWSER_STORAGE_KEY]: this.browserStorageSettings});
      browser.runtime.sendMessage({ action: "updateSettings" });
      console.info("Settings saved", this.browserStorageSettings);
    }
  }
}