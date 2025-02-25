new (class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  browserStorageSettings = {};
  enableStylingSwitch = document.getElementById("enable-styling");
  refetchCSSButton = document.getElementById("refetch-css");
  websitesList = document.getElementById("websites-list");

  constructor() {
    this.loadSettings().then((settings) => {
      if (settings) {
        this.browserStorageSettings = settings;
        this.restoreSettings();
        this.bindEvents();
      }
    });
    this.refetchCSSButton.addEventListener("click", this.refetchCSS.bind(this));
    document
      .getElementById("restart-background")
      .addEventListener("click", this.restartBackground);
  }

  bindEvents() {
    this.enableStylingSwitch.addEventListener("change", () => {
      this.saveSettings();
    });
    this.websitesList.addEventListener("change", () => {
      this.saveSettings();
    });
  }

  restoreSettings() {
    if (this.browserStorageSettings.enableStyling !== undefined) {
      this.enableStylingSwitch.checked =
        this.browserStorageSettings.enableStyling;
    }
    this.loadWebsitesList();
  }

  async loadSettings() {
    const settings = await browser.storage.local.get(this.BROWSER_STORAGE_KEY);
    console.info("Settings loaded", settings?.[this.BROWSER_STORAGE_KEY]);
    return settings?.[this.BROWSER_STORAGE_KEY] || {};
  }

  saveSettings() {
    this.browserStorageSettings.enableStyling =
      this.enableStylingSwitch.checked;

    const websiteSettings = {};
    this.websitesList
      .querySelectorAll("input[type=checkbox]")
      .forEach((checkbox) => {
        websiteSettings[checkbox.name] = checkbox.checked;
      });
    this.browserStorageSettings.websiteSettings = websiteSettings;

    browser.storage.local.set({
      [this.BROWSER_STORAGE_KEY]: this.browserStorageSettings,
    });
    console.info("Settings saved", this.browserStorageSettings);
  }

  async loadWebsitesList() {
    try {
      const response = await fetch("/mapper.json", {
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch mapper.json");
      const mapping = await response.json();
      this.websitesList.innerHTML = "";
      for (const site of Object.keys(mapping)) {
        const isChecked =
          this.browserStorageSettings.websiteSettings?.[site] ?? true;
        const listItem = document.createElement("li");
        listItem.innerHTML = `
          <label>
            <input type="checkbox" name="${site}" ${isChecked ? "checked" : ""}>
            ${site}
          </label>
        `;
        this.websitesList.appendChild(listItem);
      }
    } catch (error) {
      console.error("Error loading websites list:", error);
    }
  }

  async refetchCSS() {
    this.refetchCSSButton.textContent = "Fetching...";
    try {
      const response = await fetch(
        "https://sameerasw.github.io/my-internet/styles.json",
        {
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch styles.json");
      const styles = await response.json();
      await browser.storage.local.set({ styles });
      this.refetchCSSButton.textContent = "Done!";
      setTimeout(() => {
        this.refetchCSSButton.textContent = "Refetch latest styles";
      }, 2000);
      console.info("All styles refetched and updated from GitHub.");
    } catch (error) {
      this.refetchCSSButton.textContent = "Error!";
      setTimeout(() => {
        this.refetchCSSButton.textContent = "Refetch latest styles";
      }, 2000);
      console.error("Error refetching styles:", error);
    }
  }

  async restartBackground() {
    browser.runtime.reload();
    console.info("Background script restart requested.");
  }
})();
