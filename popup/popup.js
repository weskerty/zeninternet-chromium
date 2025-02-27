let logging = true;

new (class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  browserStorageSettings = {};
  enableStylingSwitch = document.getElementById("enable-styling");
  refetchCSSButton = document.getElementById("refetch-css");
  websitesList = document.getElementById("websites-list");
  currentSiteFeatures = document.getElementById("current-site-toggles");
  currentSiteHostname = "";
  autoUpdateSwitch = document.getElementById("auto-update");
  lastFetchedTime = document.getElementById("last-fetched-time");

  constructor() {
    if (logging) console.log("Initializing ExtensionPopup");
    // Load settings and initialize the popup
    this.loadSettings().then((settings) => {
      if (settings) {
        this.browserStorageSettings = settings;
        this.getCurrentTabInfo().then(() => {
          this.restoreSettings();
          this.bindEvents();
        });
      }
    });

    // Bind event listeners
    this.refetchCSSButton.addEventListener("click", this.refetchCSS.bind(this));
    document.getElementById("toggle-websites").addEventListener("click", () => {
      this.websitesList.classList.toggle("collapsed");
    });

    this.autoUpdateSwitch.addEventListener(
      "change",
      this.saveSettings.bind(this)
    );

    // Setup auto-update and display last fetched time
    this.setupAutoUpdate();
    this.displayLastFetchedTime();
    this.setupContentScriptInjection();
    this.displayAddonVersion();
  }

  async getCurrentTabInfo() {
    if (logging) console.log("getCurrentTabInfo called");
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0) {
        const url = new URL(tabs[0].url);
        this.currentSiteHostname = url.hostname;
        console.info("Current site hostname:", this.currentSiteHostname);
      }
    } catch (error) {
      console.error("Error getting current tab info:", error);
    }
  }

  bindEvents() {
    if (logging) console.log("bindEvents called");
    // Bind event listeners for settings changes
    this.enableStylingSwitch.addEventListener("change", () => {
      this.saveSettings();
      this.updateActiveTabStyling();
    });

    this.currentSiteFeatures.addEventListener("change", (event) => {
      if (event.target.type === "checkbox") {
        this.saveSettings();
        this.updateActiveTabStyling();
      }
    });
  }

  restoreSettings() {
    if (logging) console.log("restoreSettings called");
    // Restore settings from storage
    if (this.browserStorageSettings.enableStyling !== undefined) {
      this.enableStylingSwitch.checked =
        this.browserStorageSettings.enableStyling;
    }
    if (this.browserStorageSettings.autoUpdate !== undefined) {
      this.autoUpdateSwitch.checked = this.browserStorageSettings.autoUpdate;
    }
    this.loadCurrentSiteFeatures();
    this.loadWebsitesList();
  }

  async loadSettings() {
    if (logging) console.log("loadSettings called");
    // Load settings from browser storage
    const settings = await browser.storage.local.get(this.BROWSER_STORAGE_KEY);
    console.info("Settings loaded", settings?.[this.BROWSER_STORAGE_KEY]);
    return settings?.[this.BROWSER_STORAGE_KEY] || {};
  }

  saveSettings() {
    if (logging) console.log("saveSettings called");
    // Save settings to browser storage
    this.browserStorageSettings.enableStyling =
      this.enableStylingSwitch.checked;
    this.browserStorageSettings.autoUpdate = this.autoUpdateSwitch.checked;

    const featureSettings = {};
    this.currentSiteFeatures
      .querySelectorAll("input[type=checkbox]")
      .forEach((checkbox) => {
        const [site, feature] = checkbox.name.split("|");
        if (!featureSettings[site]) {
          featureSettings[site] = {};
        }
        featureSettings[site][feature] = checkbox.checked;
      });

    this.browserStorageSettings.featureSettings = featureSettings;

    browser.storage.local.set({
      [this.BROWSER_STORAGE_KEY]: this.browserStorageSettings,
    });

    console.info("Settings saved", this.browserStorageSettings);
  }

  async loadCurrentSiteFeatures() {
    if (logging) console.log("loadCurrentSiteFeatures called");
    // Load features for the current site
    try {
      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles?.website || {};

      this.currentSiteFeatures.innerHTML = "";

      const currentSiteKey = Object.keys(styles).find((site) =>
        this.isCurrentSite(site.replace(".css", ""))
      );

      if (!currentSiteKey) {
        const requestThemeButton = document.createElement("button");
        requestThemeButton.className = "action-button primary";
        requestThemeButton.innerHTML = `Request Theme for ${this.currentSiteHostname}`;
        requestThemeButton.addEventListener("click", () => {
          const issueUrl = `https://github.com/sameerasw/my-internet/issues/new?template=website-theme-request.md&title=[THEME] ${this.currentSiteHostname}&body=Please add a theme for ${this.currentSiteHostname}`;
          window.open(issueUrl, "_blank");
        });

        this.currentSiteFeatures.appendChild(requestThemeButton);
        return;
      }

      const features = styles[currentSiteKey];
      for (const [feature, css] of Object.entries(features)) {
        const displayFeatureName = feature.includes("-")
          ? feature.split("-")[1]
          : feature;
        const isChecked =
          this.browserStorageSettings.featureSettings?.[currentSiteKey]?.[
            feature
          ] ?? true;

        const featureToggle = document.createElement("div");
        featureToggle.className = "feature-toggle";
        featureToggle.innerHTML = `
          <span class="feature-name">${displayFeatureName}</span>
          <label class="toggle-switch">
            <input type="checkbox" name="${currentSiteKey}|${feature}" ${
          isChecked ? "checked" : ""
        }>
            <span class="slider round"></span>
          </label>
        `;

        this.currentSiteFeatures.appendChild(featureToggle);
      }
    } catch (error) {
      console.error("Error loading current site features:", error);
      this.currentSiteFeatures.innerHTML =
        "<div class='feature-toggle'>Error loading features.</div>";
    }
  }

  async loadWebsitesList() {
    if (logging) console.log("loadWebsitesList called");
    // Load the list of websites with available styles
    try {
      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles?.website || {};

      this.websitesList.innerHTML = "";

      const websites = Object.keys(styles);

      if (websites.length === 0) {
        const listItem = document.createElement("li");
        listItem.textContent =
          "No styles available. Click 'Refetch latest styles' to update.";
        this.websitesList.appendChild(listItem);
        return;
      }

      for (const site of websites) {
        const displayName = site.replace(/\.css$/, "");
        const listItem = document.createElement("li");
        listItem.textContent = displayName;
        this.websitesList.appendChild(listItem);
      }
    } catch (error) {
      console.error("Error loading websites list:", error);
      this.websitesList.innerHTML =
        "<li>Error loading websites list. Please try refetching styles.</li>";
    }
  }

  isCurrentSite(siteName) {
    if (logging) console.log("isCurrentSite called with", siteName);
    // Check if the given site name matches the current site hostname
    if (!this.currentSiteHostname) return false;
    if (this.currentSiteHostname === siteName) return true;
    if (this.currentSiteHostname === `www.${siteName}`) return true;
    return false;
  }

  async refetchCSS() {
    if (logging) console.log("refetchCSS called");
    // Refetch CSS styles from the remote server
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
      await browser.storage.local.set({ lastFetchedTime: Date.now() });

      this.loadCurrentSiteFeatures();
      this.loadWebsitesList();
      this.updateActiveTabStyling();

      this.refetchCSSButton.textContent = "Done!";
      setTimeout(() => {
        this.refetchCSSButton.textContent = "Refetch latest styles";
      }, 2000);
      console.info("All styles refetched and updated from GitHub." + styles);
      this.displayLastFetchedTime();
    } catch (error) {
      this.refetchCSSButton.textContent = "Error!";
      setTimeout(() => {
        this.refetchCSSButton.textContent = "Refetch latest styles";
      }, 2000);
      console.error("Error refetching styles:", error);
    }
  }

  setupContentScriptInjection() {
    if (logging) console.log("setupContentScriptInjection called");
    // Setup content script injection for tab updates
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete") {
        this.applyCSSToTab(tab);
      }
    });
    this.updateAllTabs();
  }

  async updateAllTabs() {
    if (logging) console.log("updateAllTabs called");
    // Update CSS for all open tabs
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      this.applyCSSToTab(tab);
    }
  }

  async updateActiveTabStyling() {
    if (logging) console.log("updateActiveTabStyling called");
    // Update CSS for the active tab
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length > 0) {
      this.applyCSSToTab(tabs[0]);
    }
  }

  async applyCSSToTab(tab) {
    if (logging) console.log("applyCSSToTab called with", tab);
    // Apply CSS to the specified tab
    const url = new URL(tab.url);
    const hostname = url.hostname;

    try {
      await browser.tabs.removeCSS(tab.id, {
        code: "/* Placeholder for removing CSS */",
      });
    } catch (error) {}

    if (!this.shouldApplyCSS(hostname)) return;

    try {
      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles?.website || {};

      let siteKey = null;
      for (const site of Object.keys(styles)) {
        const siteName = site.replace(/\.css$/, "");
        if (hostname === siteName || hostname === `www.${siteName}`) {
          siteKey = site;
          break;
        }
      }

      if (siteKey && styles[siteKey]) {
        const features = styles[siteKey];
        const featureSettings =
          this.browserStorageSettings.featureSettings?.[siteKey] || {};

        let combinedCSS = "";
        for (const [feature, css] of Object.entries(features)) {
          if (featureSettings[feature] !== false) {
            combinedCSS += css + "\n";
          }
        }

        if (combinedCSS) {
          await browser.tabs.insertCSS(tab.id, { code: combinedCSS });
          console.info(`Applied CSS to ${hostname}`);
        }
      }
    } catch (error) {
      console.error(`Error applying CSS to ${hostname}:`, error);
    }
  }

  shouldApplyCSS(hostname) {
    if (logging) console.log("shouldApplyCSS called with", hostname);
    // Check if CSS should be applied to the given hostname
    return this.browserStorageSettings.enableStyling !== false;
  }

  async displayAddonVersion() {
    if (logging) console.log("displayAddonVersion called");
    // Display the add-on version in the popup
    const manifest = browser.runtime.getManifest();
    const version = manifest.version;
    document.getElementById(
      "addon-version"
    ).textContent = `Version: ${version}`;
  }

  setupAutoUpdate() {
    if (logging) console.log("setupAutoUpdate called");
    // Setup auto-update based on the switch state
    if (this.autoUpdateSwitch.checked) {
      browser.runtime.sendMessage({ action: "enableAutoUpdate" });
    } else {
      browser.runtime.sendMessage({ action: "disableAutoUpdate" });
    }
  }

  displayLastFetchedTime() {
    if (logging) console.log("displayLastFetchedTime called");
    // Display the last fetched time for styles
    browser.storage.local.get("lastFetchedTime").then((result) => {
      if (result.lastFetchedTime) {
        this.lastFetchedTime.textContent = `Last fetched: ${new Date(
          result.lastFetchedTime
        ).toLocaleString()}`;
      }
    });
  }
})();
