let logging = false;
let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";

new (class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  globalSettings = {};
  siteSettings = {};
  enableStylingSwitch = document.getElementById("enable-styling");
  refetchCSSButton = document.getElementById("refetch-css");
  websitesList = document.getElementById("websites-list");
  currentSiteFeatures = document.getElementById("current-site-toggles");
  currentSiteHostname = "";
  autoUpdateSwitch = document.getElementById("auto-update");
  lastFetchedTime = document.getElementById("last-fetched-time");
  forceStylingSwitch = document.getElementById("force-styling");
  whitelistModeSwitch = document.getElementById("whitelist-mode");
  whitelistModeLabel = document.getElementById("whitelist-mode-label");
  skipForceThemingSwitch = document.getElementById("skip-force-theming");
  siteToggleLabel = document.getElementById("site-toggle-label");
  skipForceThemingList = [];
  reloadButton = document.getElementById("reload");
  modeIndicator = document.getElementById("mode-indicator");

  constructor() {
    if (logging) console.log("Initializing ExtensionPopup");
    // Load settings and initialize the popup
    this.loadSettings().then(() => {
      this.loadSkipForceThemingList().then(() => {
        this.getCurrentTabInfo().then(() => {
          this.restoreSettings();
          this.bindEvents();
        });
      });
    });

    // Bind event listeners
    this.refetchCSSButton.addEventListener("click", this.refetchCSS.bind(this));
    this.refetchCSSButton.addEventListener(
      "auxclick",
      this.handleMiddleClick.bind(this)
    );
    this.autoUpdateSwitch.addEventListener(
      "change",
      this.saveSettings.bind(this)
    );
    this.forceStylingSwitch.addEventListener(
      "change",
      this.saveSettings.bind(this)
    );
    this.reloadButton.addEventListener("click", this.reloadPage.bind(this));

    this.whitelistModeSwitch.addEventListener(
      "change",
      this.handleWhitelistModeChange.bind(this)
    );

    // Add event listener for the data viewer button
    document.getElementById("view-data")?.addEventListener("click", () => {
      browser.tabs.create({
        url: browser.runtime.getURL("data-viewer/data-viewer.html"),
      });
    });

    // Setup auto-update and display last fetched time
    this.setupAutoUpdate();
    this.displayLastFetchedTime();
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

    this.skipForceThemingSwitch.addEventListener("change", () => {
      this.saveSkipForceThemingList();
    });

    this.reloadButton.addEventListener("click", this.reloadPage.bind(this));
  }

  restoreSettings() {
    if (logging) console.log("restoreSettings called");
    // Restore global settings
    this.enableStylingSwitch.checked =
      this.globalSettings.enableStyling ?? true;
    this.autoUpdateSwitch.checked = this.globalSettings.autoUpdate ?? false;
    this.forceStylingSwitch.checked = this.globalSettings.forceStyling ?? false;
    this.whitelistModeSwitch.checked =
      this.globalSettings.whitelistMode ?? false;

    this.updateModeLabels();

    // In whitelist mode, checked means "include this site"
    // In blacklist mode, checked means "skip this site"
    const isInList = this.skipForceThemingList.includes(
      this.currentSiteHostname
    );
    this.skipForceThemingSwitch.checked = isInList;

    this.loadCurrentSiteFeatures();
  }

  async loadSettings() {
    if (logging) console.log("loadSettings called");
    // Load global settings
    const globalData = await browser.storage.local.get(
      this.BROWSER_STORAGE_KEY
    );
    this.globalSettings = globalData[this.BROWSER_STORAGE_KEY] || {
      enableStyling: true,
      autoUpdate: false,
      lastFetchedTime: null,
      forceStyling: false,
    };

    // Load site-specific settings if on a specific site
    if (this.currentSiteHostname) {
      const siteKey = `${this.BROWSER_STORAGE_KEY}.${this.currentSiteHostname}`;
      const siteData = await browser.storage.local.get(siteKey);
      this.siteSettings = siteData[siteKey] || {};
      await this.loadCurrentSiteFeatures();
    }
  }

  saveSettings() {
    if (logging) console.log("saveSettings called");
    // Save global settings
    this.globalSettings.enableStyling = this.enableStylingSwitch.checked;
    this.globalSettings.autoUpdate = this.autoUpdateSwitch.checked;
    this.globalSettings.forceStyling = this.forceStylingSwitch.checked;
    this.globalSettings.whitelistMode = this.whitelistModeSwitch.checked;

    browser.storage.local
      .set({
        [this.BROWSER_STORAGE_KEY]: this.globalSettings,
      })
      .then(() => {
        if (logging) console.log("Global settings saved");
        this.updateActiveTabStyling();
      });

    // Save site-specific settings
    if (this.currentSiteHostname) {
      const siteKey = `${this.BROWSER_STORAGE_KEY}.${this.currentSiteHostname}`;
      const featureSettings = {};

      this.currentSiteFeatures
        .querySelectorAll("input[type=checkbox]")
        .forEach((checkbox) => {
          const [, feature] = checkbox.name.split("|");
          featureSettings[feature] = checkbox.checked;
        });

      this.siteSettings = featureSettings;
      browser.storage.local
        .set({
          [siteKey]: featureSettings,
        })
        .then(() => {
          if (logging) console.log("Site settings saved");
          this.updateActiveTabStyling();
        });
    }

    console.info("Settings saved", {
      global: this.globalSettings,
      site: this.siteSettings,
    });
  }

  async loadSkipForceThemingList() {
    const data = await browser.storage.local.get(SKIP_FORCE_THEMING_KEY);
    this.skipForceThemingList = data[SKIP_FORCE_THEMING_KEY] || [];
  }

  saveSkipForceThemingList() {
    const isChecked = this.skipForceThemingSwitch.checked;
    const index = this.skipForceThemingList.indexOf(this.currentSiteHostname);

    if (isChecked && index === -1) {
      // Add to the list (whitelist: include, blacklist: skip)
      this.skipForceThemingList.push(this.currentSiteHostname);
    } else if (!isChecked && index !== -1) {
      // Remove from the list (whitelist: exclude, blacklist: include)
      this.skipForceThemingList.splice(index, 1);
    }

    browser.storage.local
      .set({
        [SKIP_FORCE_THEMING_KEY]: this.skipForceThemingList,
      })
      .then(() => {
        this.updateActiveTabStyling();
      });
  }

  async loadCurrentSiteFeatures() {
    if (logging) console.log("loadCurrentSiteFeatures called");
    try {
      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles?.website || {};

      this.currentSiteFeatures.innerHTML = "";

      let currentSiteKey = Object.keys(styles).find((site) =>
        this.isCurrentSite(site.replace(".css", ""))
      );

      if (!currentSiteKey && this.globalSettings.forceStyling) {
        currentSiteKey = Object.keys(styles).find(
          (site) => site === "example.com.css"
        );
      }

      if (!currentSiteKey || currentSiteKey === "example.com.css") {
        const requestThemeButton = document.createElement("button");
        requestThemeButton.className = "action-button primary";
        requestThemeButton.innerHTML = `Request Theme for ${this.currentSiteHostname}`;
        requestThemeButton.addEventListener("click", () => {
          const issueUrl = `https://github.com/sameerasw/my-internet/issues/new?template=website-theme-request.md&title=[THEME] ${this.currentSiteHostname}&body=Please add a theme for ${this.currentSiteHostname}`;
          window.open(issueUrl, "_blank");
        });

        this.currentSiteFeatures.appendChild(requestThemeButton);
      }

      if (!currentSiteKey) {
        return;
      }

      // Load site-specific settings before creating toggles
      const siteKey = `${this.BROWSER_STORAGE_KEY}.${this.currentSiteHostname}`;
      const siteData = await browser.storage.local.get(siteKey);
      this.siteSettings = siteData[siteKey] || {};

      const features = styles[currentSiteKey];

      if (!currentSiteKey || currentSiteKey === "example.com.css") {
        const skipForceThemingToggle = document.createElement("div");
        skipForceThemingToggle.className = "toggle-container";
        skipForceThemingToggle.innerHTML = `
        <div class="actions secondary">
          <span class="toggle-label warning">No themes found for this website ;(</span>
        </div>
        `;

        this.currentSiteFeatures.appendChild(skipForceThemingToggle);
      }
      for (const [feature, css] of Object.entries(features)) {
        const displayFeatureName = feature.includes("-")
          ? feature.split("-")[1]
          : feature;

        const isChecked = this.siteSettings[feature] ?? true;

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

  isCurrentSite(siteName) {
    if (logging) console.log("isCurrentSite called with", siteName);
    if (!this.currentSiteHostname) return false;
    if (siteName.startsWith("+")) {
      const baseSiteName = siteName.slice(1);
      return this.currentSiteHostname.endsWith(baseSiteName);
    }
    if (this.currentSiteHostname === siteName) return true;
    if (this.currentSiteHostname === `www.${siteName}`) return true;
    return false;
  }

  async refetchCSS() {
    if (logging) console.log("refetchCSS called");
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
      // this.loadWebsitesList();
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

  async updateActiveTabStyling() {
    if (logging) console.log("updateActiveTabStyling called");
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
    const url = new URL(tab.url);
    const hostname = url.hostname;

    try {
      // Try to remove any existing CSS first
      try {
        await browser.tabs.removeCSS(tab.id, {
          code: "/* Placeholder for removing CSS */",
        });
      } catch (error) {
        // Ignore errors as they may occur if no CSS was previously applied
      }

      if (!this.shouldApplyCSS(hostname)) return;

      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles?.website || {};

      // First try to find a direct match for a CSS file
      let bestMatch = null;
      let bestMatchLength = 0;

      for (const site of Object.keys(styles)) {
        const siteName = site.replace(/\.css$/, "");
        if (siteName.startsWith("+")) {
          const baseSiteName = siteName.slice(1);
          if (
            hostname.endsWith(baseSiteName) &&
            baseSiteName.length > bestMatchLength
          ) {
            bestMatch = site;
            bestMatchLength = baseSiteName.length;
          }
        } else if (hostname === siteName || hostname === `www.${siteName}`) {
          // Exact match has priority
          bestMatch = site;
          break;
        } else if (
          hostname.endsWith(siteName) &&
          siteName.length > bestMatchLength
        ) {
          bestMatch = site;
          bestMatchLength = siteName.length;
        }
      }

      // If we found a direct match, use it
      if (bestMatch) {
        const features = styles[bestMatch];
        const siteStorageKey = `${this.BROWSER_STORAGE_KEY}.${hostname}`;
        const siteData = await browser.storage.local.get(siteStorageKey);
        const featureSettings = siteData[siteStorageKey] || {};

        let combinedCSS = "";
        for (const [feature, css] of Object.entries(features)) {
          if (featureSettings[feature] !== false) {
            combinedCSS += css + "\n";
          }
        }

        if (combinedCSS) {
          await browser.tabs.insertCSS(tab.id, { code: combinedCSS });
          console.info(`Applied CSS to ${hostname} (direct match)`);
        }
      } else if (this.globalSettings.forceStyling) {
        // Otherwise check for forced styling
        const isInList = this.skipForceThemingList.includes(hostname);
        const isWhitelistMode = this.globalSettings.whitelistMode;

        // Determine if we should apply forced styling
        const shouldApplyForcedStyling =
          (isWhitelistMode && isInList) || (!isWhitelistMode && !isInList);

        if (shouldApplyForcedStyling && styles["example.com.css"]) {
          const features = styles["example.com.css"];
          const siteStorageKey = `${this.BROWSER_STORAGE_KEY}.${hostname}`;
          const siteData = await browser.storage.local.get(siteStorageKey);
          const featureSettings = siteData[siteStorageKey] || {};

          let combinedCSS = "";
          for (const [feature, css] of Object.entries(features)) {
            if (featureSettings[feature] !== false) {
              combinedCSS += css + "\n";
            }
          }

          if (combinedCSS) {
            await browser.tabs.insertCSS(tab.id, { code: combinedCSS });
            console.info(`Applied forced CSS to ${hostname}`);
          }
        } else {
          console.info(`Skipping forced styling for ${hostname}`);
        }
      }
    } catch (error) {
      console.error(`Error applying CSS to ${hostname}:`, error);
    }
  }

  shouldApplyCSS(hostname) {
    if (logging) console.log("shouldApplyCSS called with", hostname);
    return this.globalSettings.enableStyling !== false;
  }

  async displayAddonVersion() {
    if (logging) console.log("displayAddonVersion called");
    const manifest = browser.runtime.getManifest();
    const version = manifest.version;
    document.getElementById(
      "addon-version"
    ).textContent = `Version: ${version}`;
  }

  setupAutoUpdate() {
    if (logging) console.log("setupAutoUpdate called");
    if (this.autoUpdateSwitch.checked) {
      browser.runtime.sendMessage({ action: "enableAutoUpdate" });
    } else {
      browser.runtime.sendMessage({ action: "disableAutoUpdate" });
    }
  }

  displayLastFetchedTime() {
    if (logging) console.log("displayLastFetchedTime called");
    browser.storage.local.get("lastFetchedTime").then((result) => {
      if (result.lastFetchedTime) {
        this.lastFetchedTime.textContent = `Last fetched: ${new Date(
          result.lastFetchedTime
        ).toLocaleString()}`;
      }
    });
  }

  reloadPage() {
    if (logging) console.log("reloadPage called");
    browser.tabs.reload();
  }

  handleMiddleClick(event) {
    if (event.button === 1) {
      // Middle click
      if (confirm("Are you sure you want to clear all settings?")) {
        browser.storage.local.clear().then(() => {
          alert("All settings have been cleared.");
          location.reload(); // Reload the popup to reflect changes
        });
      }
    }
  }

  handleWhitelistModeChange() {
    this.updateModeLabels();
    this.saveSettings();
  }

  updateModeIndicator() {
    if (this.whitelistModeSwitch.checked) {
      this.modeIndicator.textContent =
        "In Whitelist Mode (apply only to listed sites)";
    } else {
      this.modeIndicator.textContent =
        "In Blacklist Mode (apply to all except listed sites)";
    }
  }

  updateSiteToggleLabel() {
    // Update the label based on the current mode
    if (this.whitelistModeSwitch.checked) {
      this.siteToggleLabel.textContent = "Enable for this Site";
    } else {
      this.siteToggleLabel.textContent = "Skip Forcing for this Site";
    }
  }

  updateModeLabels() {
    if (this.whitelistModeSwitch.checked) {
      this.whitelistModeLabel.textContent = "Whitelist Mode";
      this.siteToggleLabel.textContent = "Enable for this Site";
    } else {
      this.whitelistModeLabel.textContent = "Blacklist Mode";
      this.siteToggleLabel.textContent = "Skip Forcing for this Site";
    }
  }
})();
