let logging = false;
let SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
let SKIP_THEMING_KEY = "skipThemingList";
let FALLBACK_BACKGROUND_KEY = "fallbackBackgroundList";
let STYLES_MAPPING_KEY = "stylesMapping";
const USER_STYLES_MAPPING_KEY = "userStylesMapping";

const DEFAULT_SETTINGS = {
  enableStyling: true,
  autoUpdate: true,
  forceStyling: false,
  whitelistMode: false,
  whitelistStyleMode: false,
  disableTransparency: false,
  disableHover: false,
  disableFooter: false,
  fallbackBackgroundList: [],
};

function ensureDefaultSettings(settings = {}) {
  const result = { ...settings };
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (result[key] === undefined) {
      result[key] = defaultValue;
    }
  }
  return result;
}

function normalizeHostname(hostname) {
  return hostname.startsWith("www.") ? hostname.substring(4) : hostname;
}

const $ = (selector) => document.getElementById(selector);

new (class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  globalSettings = {};
  siteSettings = {};
  enableStylingSwitch = $("enable-styling");
  whitelistStylingModeSwitch = $("whitelist-style-mode");
  whitelistStylingModeLabel = $("whitelist-style-mode-label");
  skipThemingSwitch = $("skip-theming");
  siteStyleToggleLabel = $("site-style-toggle-label");
  skipThemingList = [];
  refetchCSSButton = $("refetch-css");
  websitesList = $("websites-list");
  currentSiteFeatures = $("current-site-toggles");
  currentSiteHostname = "";
  normalizedCurrentSiteHostname = "";
  autoUpdateSwitch = $("auto-update");
  lastFetchedTime = $("last-fetched-time");
  forceStylingSwitch = $("force-styling");
  whitelistModeSwitch = $("whitelist-mode");
  whitelistModeLabel = $("whitelist-mode-label");
  skipForceThemingSwitch = $("skip-force-theming");
  siteToggleLabel = $("site-toggle-label");
  skipForceThemingList = [];
  reloadButton = $("reload");
  modeIndicator = $("mode-indicator");
  whatsNewButton = $("whats-new");
  howToUseButton = $("how-to-use");
  fallbackBackgroundSwitch = $("fallback-background");
  fallbackBackgroundList = [];

  constructor() {
    this.loadSettings(() => {
      this.loadSkipForceThemingList(() => {
        this.loadSkipThemingList(() => {
          this.loadFallbackBackgroundList(() => {
            this.getCurrentTabInfo(() => {
              this.restoreSettings();
              this.bindAllEvents();
              // This feature is not needed.
              // this.initializeThemeRequestOverlay();
            });
          });
        });
      });
    });

    this.checkWelcomeScreen();
    this.refetchCSSButton.addEventListener("click", this.refetchCSS.bind(this));
    this.autoUpdateSwitch.addEventListener(
      "change",
      this.saveSettings.bind(this),
    );
    this.forceStylingSwitch.addEventListener(
      "change",
      this.saveSettings.bind(this),
    );
    this.reloadButton.addEventListener("click", this.reloadPage.bind(this));
    document
      .getElementById("toggle-features")
      ?.addEventListener("click", this.toggleFeatures.bind(this));
    document
      .getElementById("toggle-forcing")
      ?.addEventListener("click", this.toggleForcing.bind(this));
    this.whitelistModeSwitch.addEventListener(
      "change",
      this.handleWhitelistModeChange.bind(this),
    );
    this.whitelistStylingModeSwitch.addEventListener(
      "change",
      this.handleWhitelistStyleModeChange.bind(this),
    );
    this.whatsNewButton.addEventListener("click", this.openWhatsNew.bind(this));
    this.howToUseButton.addEventListener("click", this.openHowToUse.bind(this));
    document.getElementById("view-data")?.addEventListener("click", () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL("data-viewer/data-viewer.html"),
      });
    });
    // This feature is not needed.
    // document.getElementById("bug-report-link")?.addEventListener("click", (e) => {
    //   e.preventDefault();
    //   this.showBugReportOverlay();
    // });
    this.setupAutoUpdate();
    this.displayLastFetchedTime();
    this.displayAddonVersion();
  }

  getCurrentTabInfo(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error getting current tab:",
          chrome.runtime.lastError.message,
        );
      } else if (tabs.length > 0 && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          this.currentSiteHostname = url.hostname;
          this.normalizedCurrentSiteHostname = normalizeHostname(
            this.currentSiteHostname,
          );
          const siteDomainElement = document.getElementById("site-domain");
          if (siteDomainElement) {
            const displayDomain = normalizeHostname(this.currentSiteHostname);
            siteDomainElement.textContent = displayDomain;
            siteDomainElement.title = displayDomain;
          }
        } catch (error) {
          console.error("Error parsing current tab URL:", error);
        }
      }
      if (callback) callback();
    });
  }

  bindAllEvents() {
    if (logging) console.log("bindAllEvents called");
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
    this.skipForceThemingSwitch.addEventListener("change", () =>
      this.saveSkipForceThemingList(),
    );
    this.skipThemingSwitch.addEventListener("change", () =>
      this.saveSkipThemingList(),
    );
    this.fallbackBackgroundSwitch.addEventListener("change", () =>
      this.saveFallbackBackgroundList(),
    );
    this.reloadButton.addEventListener("click", this.reloadPage.bind(this));
    document
      .getElementById("toggle-faq")
      ?.addEventListener("click", this.toggleFAQ.bind(this));
    document
      .getElementById("faq-content")
      ?.addEventListener("click", this.handleFAQClick.bind(this));
  }

  restoreSettings() {
    if (logging) console.log("restoreSettings called");
    this.enableStylingSwitch.checked =
      this.globalSettings.enableStyling ?? true;
    this.autoUpdateSwitch.checked = this.globalSettings.autoUpdate ?? false;
    this.forceStylingSwitch.checked = this.globalSettings.forceStyling ?? false;
    this.whitelistModeSwitch.checked =
      this.globalSettings.whitelistMode ?? false;
    this.whitelistStylingModeSwitch.checked =
      this.globalSettings.whitelistStyleMode ?? false;
    this.updateModeLabels();
    this.skipForceThemingSwitch.checked = this.skipForceThemingList.includes(
      normalizeHostname(this.currentSiteHostname),
    );
    this.skipThemingSwitch.checked = this.skipThemingList.includes(
      normalizeHostname(this.currentSiteHostname),
    );
    this.fallbackBackgroundSwitch.checked =
      this.fallbackBackgroundList.includes(
        normalizeHostname(this.currentSiteHostname),
      );
    this.loadCurrentSiteFeatures();
  }

  loadSettings(callback) {
    if (logging) console.log("loadSettings called");
    chrome.storage.local.get(this.BROWSER_STORAGE_KEY, (globalData) => {
      this.globalSettings = ensureDefaultSettings(
        globalData[this.BROWSER_STORAGE_KEY] || {},
      );
      if (
        JSON.stringify(this.globalSettings) !==
        JSON.stringify(globalData[this.BROWSER_STORAGE_KEY])
      ) {
        chrome.storage.local.set({
          [this.BROWSER_STORAGE_KEY]: this.globalSettings,
        });
      }

      if (this.currentSiteHostname) {
        const normalizedSiteKey = `${this.BROWSER_STORAGE_KEY}.${this.normalizedCurrentSiteHostname}`;
        chrome.storage.local.get(normalizedSiteKey, (siteData) => {
          this.siteSettings = siteData[normalizedSiteKey] || {};
          this.loadCurrentSiteFeatures(callback);
        });
      } else {
        if (callback) callback();
      }
    });
  }

  saveSettings() {
    if (logging) console.log("saveSettings called");
    this.globalSettings.enableStyling = this.enableStylingSwitch.checked;
    this.globalSettings.autoUpdate = this.autoUpdateSwitch.checked;
    this.globalSettings.forceStyling = this.forceStylingSwitch.checked;
    this.globalSettings.whitelistMode = this.whitelistModeSwitch.checked;
    this.globalSettings.whitelistStyleMode =
      this.whitelistStylingModeSwitch.checked;

    chrome.storage.local.set(
      { [this.BROWSER_STORAGE_KEY]: this.globalSettings },
      () => {
        if (logging) console.log("Global settings saved");
        this.updateActiveTabStyling();
      },
    );

    if (this.currentSiteHostname) {
      const siteKey = `${this.BROWSER_STORAGE_KEY}.${this.normalizedCurrentSiteHostname}`;
      const featureSettings = {};
      this.currentSiteFeatures
        .querySelectorAll("input[type=checkbox]")
        .forEach((checkbox) => {
          const [, feature] = checkbox.name.split("|");
          featureSettings[feature] = checkbox.checked;
        });
      this.siteSettings = featureSettings;
      chrome.storage.local.set({ [siteKey]: featureSettings }, () => {
        if (logging)
          console.log("Site settings saved to normalized key:", siteKey);
        this.updateActiveTabStyling();
      });
    }
  }

  loadSkipForceThemingList(callback) {
    chrome.storage.local.get(SKIP_FORCE_THEMING_KEY, (data) => {
      this.skipForceThemingList = data[SKIP_FORCE_THEMING_KEY] || [];
      if (!data[SKIP_FORCE_THEMING_KEY]) {
        chrome.storage.local.set({ [SKIP_FORCE_THEMING_KEY]: [] }, callback);
      } else {
        if (callback) callback();
      }
    });
  }

  loadSkipThemingList(callback) {
    chrome.storage.local.get(SKIP_THEMING_KEY, (data) => {
      this.skipThemingList = data[SKIP_THEMING_KEY] || [];
      if (!data[SKIP_THEMING_KEY]) {
        chrome.storage.local.set({ [SKIP_THEMING_KEY]: [] }, callback);
      } else {
        if (callback) callback();
      }
    });
  }

  loadFallbackBackgroundList(callback) {
    chrome.storage.local.get(FALLBACK_BACKGROUND_KEY, (data) => {
      this.fallbackBackgroundList = data[FALLBACK_BACKGROUND_KEY] || [];
      if (!data[FALLBACK_BACKGROUND_KEY]) {
        chrome.storage.local.set({ [FALLBACK_BACKGROUND_KEY]: [] }, callback);
      } else {
        if (callback) callback();
      }
    });
  }

  saveSkipForceThemingList() {
    const isChecked = this.skipForceThemingSwitch.checked;
    const index = this.skipForceThemingList.indexOf(
      normalizeHostname(this.currentSiteHostname),
    );
    if (isChecked && index === -1) {
      this.skipForceThemingList.push(
        normalizeHostname(this.currentSiteHostname),
      );
    } else if (!isChecked && index !== -1) {
      this.skipForceThemingList.splice(index, 1);
    }
    chrome.storage.local.set(
      { [SKIP_FORCE_THEMING_KEY]: this.skipForceThemingList },
      () => {
        this.updateActiveTabStyling();
      },
    );
  }

  saveSkipThemingList() {
    const isChecked = this.skipThemingSwitch.checked;
    const index = this.skipThemingList.indexOf(
      normalizeHostname(this.currentSiteHostname),
    );
    if (isChecked && index === -1) {
      this.skipThemingList.push(normalizeHostname(this.currentSiteHostname));
    } else if (!isChecked && index !== -1) {
      this.skipThemingList.splice(index, 1);
    }
    chrome.storage.local.set(
      { [SKIP_THEMING_KEY]: this.skipThemingList },
      () => {
        this.updateActiveTabStyling();
      },
    );
  }

  saveFallbackBackgroundList() {
    const isChecked = this.fallbackBackgroundSwitch.checked;
    const index = this.fallbackBackgroundList.indexOf(
      normalizeHostname(this.currentSiteHostname),
    );
    if (isChecked && index === -1) {
      this.fallbackBackgroundList.push(
        normalizeHostname(this.currentSiteHostname),
      );
    } else if (!isChecked && index !== -1) {
      this.fallbackBackgroundList.splice(index, 1);
    }
    chrome.storage.local.set(
      { [FALLBACK_BACKGROUND_KEY]: this.fallbackBackgroundList },
      () => {
        this.updateActiveTabStyling();
      },
    );
  }

  initializeThemeRequestOverlay() {
    const overlay = $("theme-request-overlay");
    const cancelBtn = $("cancel-request");
    const submitBtn = $("submit-request");
    const forcingToggle = $("forcing-toggle");
    const accountToggle = $("account-toggle");

    // Handle custom toggle clicks
    this.setupCustomToggle(forcingToggle);
    this.setupCustomToggle(accountToggle);

    // Handle cancel button
    cancelBtn.addEventListener("click", () => {
      this.hideThemeRequestOverlay();
    });

    // Handle submit button
    submitBtn.addEventListener("click", () => {
      this.submitThemeRequest();
    });

    // Close overlay when clicking outside
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.hideThemeRequestOverlay();
      }
    });
  }

  setupCustomToggle(toggleElement) {
    const options = toggleElement.querySelectorAll(".toggle-option");

    options.forEach((option) => {
      option.addEventListener("click", () => {
        // Remove active class from all options
        options.forEach((opt) => opt.classList.remove("active"));
        // Add active class to clicked option
        option.classList.add("active");
      });
    });
  }

  showThemeRequestOverlay() {
    const overlay = $("theme-request-overlay");
    overlay.classList.remove("hidden");

    // Reset toggles to default states
    const forcingToggle = $("forcing-toggle");
    const accountToggle = $("account-toggle");

    // Reset forcing toggle to "Off" (middle position)
    forcingToggle
      .querySelectorAll(".toggle-option")
      .forEach((opt) => opt.classList.remove("active"));
    forcingToggle.querySelector('[data-value="off"]').classList.add("active");

    // Reset account toggle to "Unset" (middle position)
    accountToggle
      .querySelectorAll(".toggle-option")
      .forEach((opt) => opt.classList.remove("active"));
    accountToggle.querySelector('[data-value="unset"]').classList.add("active");
  }

  hideThemeRequestOverlay() {
    const overlay = $("theme-request-overlay");
    overlay.classList.add("hidden");
  }

  getToggleValue(toggleId) {
    const toggle = $(toggleId);
    const activeOption = toggle.querySelector(".toggle-option.active");
    return activeOption ? activeOption.getAttribute("data-value") : "unset";
  }

  async submitThemeRequest() {
    const forcingValue = this.getToggleValue("forcing-toggle");
    const accountValue = this.getToggleValue("account-toggle");
    const submitBtn = $("submit-request");
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    submitBtn.disabled = true;
    try {
      const existingIssue = await this.checkExistingIssue(
        this.currentSiteHostname,
      );
      if (existingIssue) {
        this.showExistingIssueScreen(existingIssue, forcingValue, accountValue);
        return;
      }
      this.createNewIssue(forcingValue, accountValue);
    } catch (error) {
      console.warn(
        "Failed to check existing issues, proceeding anyway:",
        error,
      );
      this.createNewIssue(forcingValue, accountValue);
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }

  async checkExistingIssue(hostname) {
    const owner = "sameerasw";
    const repo = "my-internet";
    const searchTerm = hostname;
    const query = encodeURIComponent(
      `${searchTerm} repo:${owner}/${repo} in:title type:issue state:open`,
    );
    const url = `https://api.github.com/search/issues?q=${query}`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) {
      if (response.status === 403) {
        console.warn(
          "GitHub API rate limit exceeded, skipping duplicate check",
        );
        return null;
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const data = await response.json();
    const matchingIssues = data.items.filter(
      (issue) =>
        issue.title.toLowerCase().includes(hostname.toLowerCase()) ||
        issue.title.toLowerCase().includes("[theme]"),
    );
    return matchingIssues.length > 0 ? matchingIssues[0] : null;
  }

  showExistingIssueScreen(existingIssue, forcingValue, accountValue) {
    const prompt = document.querySelector(".theme-request-prompt");
    this.pendingRequestData = { forcingValue, accountValue };
    const createdDate = new Date(existingIssue.created_at).toLocaleDateString();
    const issueState = existingIssue.state === "open" ? "Open" : "Closed";
    const stateClass =
      existingIssue.state === "open" ? "status-open" : "status-closed";

    prompt.innerHTML = `
      <h3>Existing Request Found</h3>
      <div class="existing-issue-info">
        <p>An existing theme request was found for <strong>${
          this.currentSiteHostname
        }</strong></p>

        <div class="issue-details">
          <div class="issue-header">
            <h4 class="issue-title">${existingIssue.title}</h4>
            <span class="issue-state ${stateClass}">${issueState}</span>
          </div>

          <div class="issue-meta">
            <div class="issue-meta-item">
              <i class="fas fa-calendar-alt"></i>
              <span>Created: ${createdDate}</span>
            </div>
            <div class="issue-meta-item">
              <i class="fas fa-comments"></i>
              <span>${existingIssue.comments} comments</span>
            </div>
            ${
              existingIssue.assignee
                ? `
              <div class="issue-meta-item">
                <i class="fas fa-user"></i>
                <span>Assigned to ${existingIssue.assignee.login}</span>
              </div>
            `
                : ""
            }
          </div>

          ${
            existingIssue.body
              ? `
            <div class="issue-body">
              <p><strong>Description:</strong></p>
              <p class="issue-description">${this.truncateText(
                existingIssue.body,
                200,
              )}</p>
            </div>
          `
              : ""
          }
        </div>

        <div class="existing-issue-actions">
          <button id="view-existing-issue" class="action-button secondary">
            <i class="fas fa-external-link-alt"></i> View Existing Request
          </button>
        </div>
      </div>

      <div class="prompt-actions">
        <button id="submit-anyway" class="action-button secondary">
          Submit Anyway
        </button>
        <button id="close-request" class="action-button primary">
          Close
        </button>
      </div>
    `;

    // Bind new event listeners
    document
      .getElementById("view-existing-issue")
      .addEventListener("click", () =>
        window.open(existingIssue.html_url, "_blank"),
      );
    document
      .getElementById("submit-anyway")
      .addEventListener("click", () =>
        this.createNewIssue(
          this.pendingRequestData.forcingValue,
          this.pendingRequestData.accountValue,
        ),
      );
    document
      .getElementById("close-request")
      .addEventListener("click", () => this.hideThemeRequestOverlay());
  }

  createNewIssue(forcingValue, accountValue) {
    let issueBody = `Please add a theme for ${this.currentSiteHostname}\n\n`;
    if (forcingValue === "yes") issueBody += "**Tried forcing:** YES\n";
    else if (forcingValue === "no") issueBody += "**Tried forcing:** NO\n";
    else issueBody += "**Tried forcing:** Not specified\n";
    if (accountValue === "yes") issueBody += "**Requires account:** YES\n";
    else if (accountValue === "no") issueBody += "**Requires account:** NO\n";
    else issueBody += "**Requires account:** Not specified\n";
    issueBody +=
      "\n---\n\n*This request was generated automatically from the Zen Internet extension.*";
    const issueUrl = `https://github.com/sameerasw/my-internet/issues/new?template=website-theme-request.md&title=[THEME] ${
      this.currentSiteHostname
    }&body=${encodeURIComponent(issueBody)}`;
    window.open(issueUrl, "_blank");
    this.hideThemeRequestOverlay();
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  loadCurrentSiteFeatures(callback) {
    if (logging) console.log("loadCurrentSiteFeatures called");
    this.currentSiteFeatures.innerHTML = ""; // Clear previous features

    const storageKeys = [
      "styles",
      STYLES_MAPPING_KEY,
      USER_STYLES_MAPPING_KEY,
      `${this.BROWSER_STORAGE_KEY}.${this.normalizedCurrentSiteHostname}`,
    ];

    chrome.storage.local.get(storageKeys, (data) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error loading data for features:",
          chrome.runtime.lastError.message,
        );
        this.currentSiteFeatures.innerHTML =
          "<div class='feature-toggle'>Error loading features data.</div>";
        if (callback) callback();
        return;
      }

      const styles =
        data.styles && data.styles.website ? data.styles.website : {};
      this.siteSettings =
        data[
          `${this.BROWSER_STORAGE_KEY}.${this.normalizedCurrentSiteHostname}`
        ] || {};

      let currentSiteKey = Object.keys(styles).find((site) =>
        this.isCurrentSite(site.replace(".css", "")),
      );
      let isMappedStyle = false;
      let mappedSourceStyle = null;

      if (!currentSiteKey) {
        const mergedMapping = { ...(data[STYLES_MAPPING_KEY]?.mapping || {}) };
        if (data[USER_STYLES_MAPPING_KEY]?.mapping) {
          for (const [src, targets] of Object.entries(
            data[USER_STYLES_MAPPING_KEY].mapping,
          )) {
            if (!mergedMapping[src]) mergedMapping[src] = [];
            for (const t of targets) {
              if (!mergedMapping[src].includes(t)) mergedMapping[src].push(t);
            }
          }
        }
        for (const [sourceStyle, targetSites] of Object.entries(
          mergedMapping,
        )) {
          if (targetSites.includes(this.normalizedCurrentSiteHostname)) {
            currentSiteKey = sourceStyle;
            isMappedStyle = true;
            mappedSourceStyle = sourceStyle;
            break;
          }
        }
      }

      const hasExampleSite = "example.com.css" in styles;
      const hasNoStyles = Object.keys(styles).length === 0;
      const hasSpecificTheme =
        currentSiteKey &&
        (currentSiteKey !== "example.com.css" || isMappedStyle);
      const isMappedToExample =
        isMappedStyle && mappedSourceStyle === "example.com.css";

      if (isMappedStyle && mappedSourceStyle) {
        const sourceWebsite = mappedSourceStyle.replace(".css", "");
        const mappedIndicator = document.createElement("div");
        mappedIndicator.className = "mapped-theme-indicator";
        mappedIndicator.innerHTML = `<span class="mapped-badge"><i class="fas fa-link"></i> Mapped from ${sourceWebsite}</span>`;
        this.currentSiteFeatures.insertBefore(
          mappedIndicator,
          this.currentSiteFeatures.firstChild,
        );
      }

      const featuresList = $("current-site-toggles");
      const actionsContainer = $("current-site-actions");

      if (hasSpecificTheme) {
        featuresList.classList.add("collapsed");
        if (actionsContainer) actionsContainer.classList.add("collapsed");
        const skipForceThemingContainer =
          this.skipForceThemingSwitch.closest(".toggle-container");
        if (skipForceThemingContainer)
          skipForceThemingContainer.style.display = "none";
        const skipThemingContainer =
          this.skipThemingSwitch.closest(".toggle-container");
        if (skipThemingContainer) skipThemingContainer.style.display = "flex";
        const toggleButtonIcon = document.querySelector("#toggle-features i");
        if (toggleButtonIcon)
          toggleButtonIcon.className = "fas fa-chevron-down";
      } else {
        const skipForceThemingContainer =
          this.skipForceThemingSwitch.closest(".toggle-container");
        if (skipForceThemingContainer)
          skipForceThemingContainer.style.display = "flex";
        const skipThemingContainer =
          this.skipThemingSwitch.closest(".toggle-container");
        if (skipThemingContainer) skipThemingContainer.style.display = "none";
        featuresList.classList.remove("collapsed");
        if (actionsContainer) actionsContainer.classList.remove("collapsed");
        const toggleButtonIcon = document.querySelector("#toggle-features i");
        if (toggleButtonIcon) toggleButtonIcon.className = "fas fa-chevron-up";
      }

      const forcingContent = $("forcing-content");
      const toggleForcingButton = $("toggle-forcing");
      if (toggleForcingButton) {
        if (hasSpecificTheme) {
          forcingContent.classList.add("collapsed");
          const icon = toggleForcingButton.querySelector("i");
          if (icon) icon.className = "fas fa-chevron-down";
        } else {
          forcingContent.classList.remove("collapsed");
          const icon = toggleForcingButton.querySelector("i");
          if (icon) icon.className = "fas fa-chevron-up";
        }
      }

      if (!isMappedToExample) {
        if (!currentSiteKey && this.globalSettings.forceStyling) {
          currentSiteKey = "example.com.css";
        }
        if (
          (!currentSiteKey || currentSiteKey === "example.com.css") &&
          hasExampleSite
        ) {
          // "Request Theme" button logic would go here, which you don't need.
        } else if (hasNoStyles) {
          const fetchFirstMessage = document.createElement("div");
          fetchFirstMessage.className = "toggle-container";
          fetchFirstMessage.innerHTML = `<div class="actions secondary"><span class="toggle-label warning">Please fetch styles first using the "Refetch latest styles" button</span></div>`;
          this.currentSiteFeatures.appendChild(fetchFirstMessage);
        }
      }

      if (!currentSiteKey || !styles[currentSiteKey]) {
        if (callback) callback();
        return;
      }

      const features = styles[currentSiteKey];

      if (currentSiteKey === "example.com.css" && !isMappedToExample) {
        const noThemeMessage = document.createElement("div");
        noThemeMessage.className = "toggle-container";
        noThemeMessage.innerHTML = `<div class="actions secondary"><span class="toggle-label warning">No specific theme found for this website. Using default styling.</span></div>`;
        this.currentSiteFeatures.appendChild(noThemeMessage);
      }

      const isTransparencyDisabled =
        this.globalSettings.disableTransparency === true;
      const isHoverDisabled = this.globalSettings.disableHover === true;
      const isFooterDisabled = this.globalSettings.disableFooter === true;

      for (const [feature, css] of Object.entries(features)) {
        let displayFeatureName = feature.includes("-")
          ? feature.split("-")[1]
          : feature;
        let featureCaption = null;
        if (displayFeatureName.includes("$")) {
          const parts = displayFeatureName.split("$");
          displayFeatureName = parts[0].trim();
          featureCaption = parts.slice(1).join("$").trim();
        }

        const isChecked = this.siteSettings[feature] ?? true;
        const isTransparencyFeature = feature
          .toLowerCase()
          .includes("transparency");
        const isHoverFeature = feature.toLowerCase().includes("hover");
        const isFooterFeature = feature.toLowerCase().includes("footer");
        const isOverridden =
          (isTransparencyDisabled && isTransparencyFeature) ||
          (isHoverDisabled && isHoverFeature) ||
          (isFooterDisabled && isFooterFeature);

        const featureToggle = document.createElement("div");
        featureToggle.className = "feature-toggle";

        const featureRow = document.createElement("div");
        featureRow.className = "feature-toggle-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "feature-name feature-title-ellipsis";
        nameSpan.innerHTML =
          displayFeatureName +
          (isOverridden
            ? ' <span class="overridden-label">[overridden]</span>'
            : "");
        if (featureCaption) {
          nameSpan.title = featureCaption;
          nameSpan.classList.add("feature-has-tooltip");
        }
        featureRow.appendChild(nameSpan);

        const toggleLabel = document.createElement("label");
        toggleLabel.className = `toggle-switch${
          isOverridden ? " disabled-toggle" : ""
        }`;
        toggleLabel.innerHTML = `<input type="checkbox" name="${currentSiteKey}|${feature}" ${
          isChecked ? "checked" : ""
        } ${isOverridden ? "disabled" : ""}><span class="slider round"></span>`;
        featureRow.appendChild(toggleLabel);

        if (isOverridden) {
          featureRow.classList.add("overridden-feature");
        }

        featureToggle.appendChild(featureRow);
        this.currentSiteFeatures.appendChild(featureToggle);
      }

      if (callback) callback();
    });
  }

  isCurrentSite(siteName) {
    if (logging) console.log("isCurrentSite called with", siteName);
    if (!this.normalizedCurrentSiteHostname) return false;
    const normalizedSiteName = normalizeHostname(siteName);
    if (this.normalizedCurrentSiteHostname === normalizedSiteName) return true;
    if (siteName.startsWith("+")) {
      const baseSiteName = normalizeHostname(siteName.slice(1));
      return (
        this.normalizedCurrentSiteHostname === baseSiteName ||
        this.normalizedCurrentSiteHostname.endsWith(`.${baseSiteName}`)
      );
    }
    if (siteName.startsWith("-")) {
      const baseSiteName = siteName.slice(1);
      const cachedDomain = baseSiteName.split(".").slice(0, -1).join(".");
      const hostParts = this.normalizedCurrentSiteHostname.split(".");
      const hostDomain =
        hostParts.length > 1
          ? hostParts.slice(0, -1).join(".")
          : this.normalizedCurrentSiteHostname;
      return cachedDomain && hostDomain && hostDomain === cachedDomain;
    }
    return false;
  }

  refetchCSS() {
    if (logging) console.log("refetchCSS called");
    this.refetchCSSButton.textContent = "Fetching...";
    chrome.storage.local.get("stylesRepositoryUrl", (repoUrlData) => {
      const DEFAULT_REPOSITORY_URL =
        "https://sameerasw.github.io/my-internet/styles.json";
      const repositoryUrl =
        repoUrlData.stylesRepositoryUrl || DEFAULT_REPOSITORY_URL;
      fetch(repositoryUrl, { headers: { "Cache-Control": "no-cache" } })
        .then((response) => {
          if (!response.ok)
            throw new Error(
              `Failed to fetch styles (Status: ${response.status})`,
            );
          return response.json();
        })
        .then((styles) => {
          chrome.storage.local.get(
            [this.BROWSER_STORAGE_KEY, STYLES_MAPPING_KEY],
            (data) => {
              const hasNewMappings =
                styles.mapping && Object.keys(styles.mapping).length > 0;
              const mappingData = hasNewMappings
                ? { mapping: styles.mapping }
                : data[STYLES_MAPPING_KEY] || { mapping: {} };

              let currentSettings = data[this.BROWSER_STORAGE_KEY] || {};
              currentSettings = ensureDefaultSettings(currentSettings);
              currentSettings.lastFetchedTime = Date.now();

              chrome.storage.local.set(
                {
                  styles,
                  [STYLES_MAPPING_KEY]: mappingData,
                  [this.BROWSER_STORAGE_KEY]: currentSettings,
                },
                () => {
                  this.globalSettings = currentSettings;
                  this.loadCurrentSiteFeatures();
                  this.updateActiveTabStyling();
                  this.refetchCSSButton.textContent = "Done!";
                  setTimeout(() => {
                    this.refetchCSSButton.textContent = "Refetch latest styles";
                  }, 2000);
                  this.displayLastFetchedTime();
                },
              );
            },
          );
        })
        .catch((error) => {
          this.refetchCSSButton.textContent = "Error!";
          setTimeout(() => {
            this.refetchCSSButton.textContent = "Refetch latest styles";
          }, 2000);
          console.error("Error refetching styles:", error);
          alert(`Error fetching styles: ${error.message}`);
        });
    });
  }

  updateActiveTabStyling() {
    if (logging) console.log("updateActiveTabStyling called");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        // The logic to apply CSS is now in the background script.
        // We just need to send a message to it to re-evaluate.
        chrome.runtime.sendMessage({
          action: "reapplyStyles",
          tabId: tabs[0].id,
        });
      }
    });
  }

  async applyCSSToTab(tab) {
    if (logging) console.log("applyCSSToTab called with", tab);
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const normalizedHostname = normalizeHostname(hostname);

    if (logging)
      console.log(
        "Applying CSS to tab with hostname:",
        normalizedHostname,
        "(original:",
        hostname,
        ")",
      );

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
        const normalizedSiteName = normalizeHostname(siteName);

        // Exact match has highest priority
        if (normalizedHostname === normalizedSiteName) {
          bestMatch = site;
          if (logging) console.log("Popup: Found exact match:", site);
          break;
        }

        // Then check wildcard matches
        if (siteName.startsWith("+")) {
          const baseSiteName = siteName.slice(1);
          const normalizedBaseSiteName = normalizeHostname(baseSiteName);
          // Ensure we're matching with proper domain boundary
          if (
            (normalizedHostname === normalizedBaseSiteName ||
              normalizedHostname.endsWith(`.${normalizedBaseSiteName}`)) &&
            normalizedBaseSiteName.length > bestMatchLength
          ) {
            bestMatch = site;
            bestMatchLength = normalizedBaseSiteName.length;
            if (logging) console.log("Popup: Found wildcard match:", site);
          }
        }
        // Check TLD suffix matches (-domain.com)
        else if (siteName.startsWith("-")) {
          const baseSiteName = siteName.slice(1);

          // Extract domain name without the TLD
          // For site name: Use everything before the last dot(s)
          const cachedDomain = baseSiteName.split(".").slice(0, -1).join(".");

          // For hostname: Similarly extract the domain without the TLD
          const hostParts = hostname.split(".");
          const hostDomain =
            hostParts.length > 1 ? hostParts.slice(0, -1).join(".") : hostname;

          if (logging)
            console.log(
              `Popup comparing domains - cached: ${cachedDomain}, host: ${hostDomain}`,
            );

          // Match if the domain part (without TLD) matches
          if (cachedDomain && hostDomain && hostDomain === cachedDomain) {
            // Use this match if it's better than what we have
            if (cachedDomain.length > bestMatchLength) {
              bestMatch = site;
              bestMatchLength = cachedDomain.length;
              if (logging) console.log("Popup: Found TLD suffix match:", site);
            }
          }
        }
        // Last, check subdomain matches with proper domain boundary
        else if (
          normalizedHostname !== normalizedSiteName &&
          normalizedHostname.endsWith(`.${normalizedSiteName}`) &&
          normalizedSiteName.length > bestMatchLength
        ) {
          bestMatch = site;
          bestMatchLength = normalizedSiteName.length;
          if (logging) console.log("Popup: Found subdomain match:", site);
        }
      }

      // If we found a direct match, use it
      if (bestMatch) {
        const features = styles[bestMatch];
        // UPDATED: Use normalized hostname for settings storage/retrieval
        const normalizedSiteStorageKey = `${this.BROWSER_STORAGE_KEY}.${normalizedHostname}`;
        const siteData = await browser.storage.local.get(
          normalizedSiteStorageKey,
        );
        const featureSettings = siteData[normalizedSiteStorageKey] || {};

        if (logging)
          console.log(
            "Using settings from:",
            normalizedSiteStorageKey,
            "for match:",
            bestMatch,
          );

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
      } else {
        // Check for mapped styles if no direct match found
        const mappingData = await browser.storage.local.get(STYLES_MAPPING_KEY);
        const userMappingData = await browser.storage.local.get(
          USER_STYLES_MAPPING_KEY,
        );
        // Merge mappings: user mappings take precedence/addition
        const mergedMapping = {
          ...(mappingData[STYLES_MAPPING_KEY]?.mapping || {}),
        };
        if (userMappingData[USER_STYLES_MAPPING_KEY]?.mapping) {
          for (const [src, targets] of Object.entries(
            userMappingData[USER_STYLES_MAPPING_KEY].mapping,
          )) {
            if (!mergedMapping[src]) mergedMapping[src] = [];
            for (const t of targets) {
              if (!mergedMapping[src].includes(t)) mergedMapping[src].push(t);
            }
          }
        }
        for (const [sourceStyle, targetSites] of Object.entries(
          mergedMapping,
        )) {
          if (targetSites.includes(normalizedHostname)) {
            // Get the CSS for the source style
            if (styles[sourceStyle]) {
              console.log(
                `Popup: Found mapped style (user or repo): ${sourceStyle} for ${normalizedHostname}`,
              );
              const features = styles[sourceStyle];
              const normalizedSiteStorageKey = `${this.BROWSER_STORAGE_KEY}.${normalizedHostname}`;
              const siteData = await browser.storage.local.get(
                normalizedSiteStorageKey,
              );
              const featureSettings = siteData[normalizedSiteStorageKey] || {};

              let combinedCSS = "";
              for (const [feature, css] of Object.entries(features)) {
                if (featureSettings[feature] !== false) {
                  combinedCSS += css + "\n";
                }
              }

              if (combinedCSS) {
                await browser.tabs.insertCSS(tab.id, { code: combinedCSS });
                console.info(
                  `Applied mapped CSS from ${sourceStyle} to ${hostname}`,
                );
                return; // Exit early since we found and applied a mapped style
              }
            }
            break;
          }
        }

        // If no mapped style found, check for forced styling
        if (this.globalSettings.forceStyling) {
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
      }
    } catch (error) {
      console.error(`Error applying CSS to ${hostname}:`, error);
    }
  }

  shouldApplyCSS(hostname) {
    if (logging) console.log("shouldApplyCSS called with", hostname);
    // Use default if not explicitly set
    return this.globalSettings.enableStyling !== false;
  }

  displayAddonVersion() {
    const manifest = chrome.runtime.getManifest();
    $("addon-version").textContent = `v${manifest.version}`;
  }

  setupAutoUpdate() {
    chrome.runtime.sendMessage({
      action: this.autoUpdateSwitch.checked
        ? "enableAutoUpdate"
        : "disableAutoUpdate",
    });
  }

  displayLastFetchedTime() {
    chrome.storage.local.get(this.BROWSER_STORAGE_KEY, (result) => {
      const settings = result[this.BROWSER_STORAGE_KEY] || {};
      if (settings.lastFetchedTime) {
        $("last-fetched-time").textContent = `Last fetched: ${new Date(
          settings.lastFetchedTime,
        ).toLocaleString()}`;
      } else {
        $("last-fetched-time").textContent = "Last fetched: Never";
      }
    });
  }

  reloadPage() {
    chrome.tabs.reload();
  }

  handleMiddleClick(event) {
    if (event.button === 1) {
      if (confirm("Are you sure you want to clear all settings?")) {
        chrome.storage.local.clear(() => {
          alert("All settings have been cleared.");
          window.location.reload();
        });
      }
    }
  }

  handleWhitelistModeChange() {
    this.updateModeLabels();
    this.saveSettings();
  }

  handleWhitelistStyleModeChange() {
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
      this.whitelistModeLabel.textContent = "Forced Whitelist Mode";
      this.siteToggleLabel.textContent = "Enable forcing for this Site";
    } else {
      this.whitelistModeLabel.textContent = "Forced Blacklist Mode";
      this.siteToggleLabel.textContent = "Skip forcing for this Site";
    }

    if (this.whitelistStylingModeSwitch.checked) {
      this.whitelistStylingModeLabel.textContent = "Whitelist Mode";
      this.siteStyleToggleLabel.textContent = "Enable for this Site";
    } else {
      this.whitelistStylingModeLabel.textContent = "Blacklist Mode";
      this.siteStyleToggleLabel.textContent = "Skip Styling for this Site";
    }
  }

  // Open the What's New page
  openWhatsNew() {
    browser.tabs.create({
      url: "https://addons.mozilla.org/en-US/firefox/addon/zen-internet/versions/",
    });
  }

  // Open the How to Use guide
  openHowToUse() {
    browser.tabs.create({
      url: "https://www.sameerasw.com/zen",
    });
  }

  // Toggle features section visibility
  toggleFeatures() {
    const featuresList = $("current-site-toggles");
    const actionsContainer = $("current-site-actions");
    const toggleButton = $("toggle-features");

    featuresList.classList.toggle("collapsed");
    if (actionsContainer) {
      actionsContainer.classList.toggle(
        "collapsed",
        featuresList.classList.contains("collapsed"),
      );
    }

    // Update the icon
    const icon = toggleButton.querySelector("i");
    if (featuresList.classList.contains("collapsed")) {
      icon.className = "fas fa-chevron-down";
    } else {
      icon.className = "fas fa-chevron-up";
    }
  }

  // Toggle forcing section visibility
  toggleForcing() {
    const forcingContent = $("forcing-content");
    const toggleButton = $("toggle-forcing");

    forcingContent.classList.toggle("collapsed");

    // Update the icon
    const icon = toggleButton.querySelector("i");
    if (forcingContent.classList.contains("collapsed")) {
      icon.className = "fas fa-chevron-down";
    } else {
      icon.className = "fas fa-chevron-up";
    }
  }

  // Toggle FAQ section visibility
  toggleFAQ() {
    const faqContent = $("faq-content");
    const toggleButton = $("toggle-faq");

    faqContent.classList.toggle("collapsed");

    // Update the icon
    const icon = toggleButton.querySelector("i");
    if (faqContent.classList.contains("collapsed")) {
      icon.className = "fas fa-chevron-down";
    } else {
      icon.className = "fas fa-chevron-up";
    }
  }

  // Handle FAQ item clicks (only one open at a time)
  handleFAQClick(event) {
    // Find the closest FAQ item container
    const faqItem = event.target.closest(".faq-item");
    if (!faqItem) return;

    const question = faqItem.querySelector(".faq-question");
    const answer = faqItem.querySelector(".faq-answer");

    if (!question || !answer) return;

    const isCurrentlyActive = question.classList.contains("active");

    // Close all FAQ items
    document.querySelectorAll(".faq-question").forEach((q) => {
      q.classList.remove("active");
      const a = q.nextElementSibling;
      if (a) a.classList.remove("active");
    });

    // If the clicked item wasn't active, open it
    if (!isCurrentlyActive) {
      question.classList.add("active");
      answer.classList.add("active");
    }
  }

  // Show bug report overlay
  showBugReportOverlay() {
    const overlay = $("bug-report-overlay");
    overlay.classList.remove("hidden");

    // Reset all bug option selections
    document.querySelectorAll(".bug-option").forEach((option) => {
      option.classList.remove("selected");
    });

    // Reset submit button
    const submitBtn = $("submit-bug-report");
    submitBtn.disabled = true;

    // Setup bug option event listeners
    document.querySelectorAll(".bug-option").forEach((option) => {
      option.addEventListener("click", () => {
        // Remove selected class from all options
        document.querySelectorAll(".bug-option").forEach((opt) => {
          opt.classList.remove("selected");
        });

        // Add selected class to clicked option
        option.classList.add("selected");

        // Enable submit button
        submitBtn.disabled = false;
      });
    });

    // Cancel button event listener
    document
      .getElementById("cancel-bug-report")
      .addEventListener("click", () => {
        this.hideBugReportOverlay();
      });

    // Submit button event listener
    submitBtn.addEventListener("click", () => {
      this.submitBugReport();
    });

    // Close overlay when clicking outside
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.hideBugReportOverlay();
      }
    });
  }

  // Hide bug report overlay
  hideBugReportOverlay() {
    const overlay = $("bug-report-overlay");
    overlay.classList.add("hidden");
  }

  // Submit bug report
  async submitBugReport() {
    const selectedOption = document.querySelector(".bug-option.selected");
    if (!selectedOption) return;

    const bugType = selectedOption.getAttribute("data-type");
    const submitBtn = $("submit-bug-report");

    // Show loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;

    try {
      // Collect relevant data based on bug type
      const bugData = await this.collectDataForBugType(bugType);

      // Get repository information
      const repoInfo = this.getRepositoryForBugType(bugType);

      // Create issue body
      const issueBody = this.createBugReportBodyForType(bugType, bugData);

      // Create GitHub issue URL with proper template
      let issueUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/new`;

      // Add template parameter if available
      if (repoInfo.template) {
        issueUrl += `?template=${repoInfo.template}.md`;
      }

      // Add title and body parameters
      const urlParams = new URLSearchParams();
      urlParams.append("title", repoInfo.title);
      urlParams.append("body", issueBody);

      // Combine URL with parameters
      const separator = repoInfo.template ? "&" : "?";
      issueUrl += separator + urlParams.toString();

      // Open the URL
      browser.tabs.create({ url: issueUrl });

      // Hide overlay
      this.hideBugReportOverlay();
    } catch (error) {
      console.error("Error submitting bug report:", error);
      alert("Failed to create bug report. Please try again.");
    } finally {
      // Restore button state
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }

  // Get repository information based on bug type
  getRepositoryForBugType(bugType) {
    const repos = {
      1: {
        owner: "sameerasw",
        repo: "my-internet",
        title: "[BUG] Website Theme Issue",
        template: "bug_report",
      },
      2: {
        owner: "sameerasw",
        repo: "zeninternet",
        title: "[BUG] Extension Issue",
        template: "bug_report",
      },
      3: {
        owner: "sameerasw",
        repo: "my-internet",
        title: "[TRANSPARENCY] Browser Transparency Issue",
        template: "bug_report",
      },
      4: {
        owner: "sameerasw",
        repo: "zeninternet",
        title: "[FEATURE] Feature Request",
        template: "bug_report",
      },
      5: {
        owner: "sameerasw",
        repo: "my-internet",
        title: "[OTHER] General Issue",
      },
    };

    return repos[bugType] || repos["5"];
  }

  // Collect data based on bug type
  async collectDataForBugType(bugType) {
    try {
      const allData = await browser.storage.local.get(null);
      const manifest = browser.runtime.getManifest();
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const currentTab = tabs[0];

      // Base data for all types
      const baseData = {
        reportDate: new Date().toISOString(),
        addonVersion: manifest.version,
        currentTabUrl: currentTab ? currentTab.url : "N/A",
        currentTabHostname: currentTab
          ? new URL(currentTab.url).hostname
          : "N/A",
        browserInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      };

      // Global settings
      const globalSettings = allData[this.BROWSER_STORAGE_KEY] || {};
      const skipForceList = allData[SKIP_FORCE_THEMING_KEY] || [];
      const skipThemingList = allData[SKIP_THEMING_KEY] || [];
      const fallbackBackgroundList = allData[FALLBACK_BACKGROUND_KEY] || [];

      switch (bugType) {
        case "1": // Current website's theme - include site-specific settings
          const currentHostname = currentTab
            ? normalizeHostname(new URL(currentTab.url).hostname)
            : null;
          const siteSettings = currentHostname
            ? allData[`${this.BROWSER_STORAGE_KEY}.${currentHostname}`] || {}
            : {};

          return {
            ...baseData,
            settings: {
              globalSettings,
              skipForceList,
              skipThemingList,
              fallbackBackgroundList,
              currentSiteSettings: siteSettings,
            },
          };

        case "2": // Extension issue - global settings only
        case "3": // Transparency issue - global settings only
        case "5": // Other - global settings only
          return {
            ...baseData,
            settings: {
              globalSettings,
              skipForceList,
              skipThemingList,
              fallbackBackgroundList,
            },
          };

        case "4": // Feature request - no settings data
          return baseData;

        default:
          return baseData;
      }
    } catch (error) {
      console.error("Error collecting bug data:", error);
      return { error: "Failed to collect data: " + error.message };
    }
  }

  // Create bug report body for specific type
  createBugReportBodyForType(bugType, data) {
    const typeDescriptions = {
      1: "Website Theme Issue",
      2: "Extension Issue",
      3: "Browser Transparency Issue",
      4: "Feature Request",
      5: "Other Issue",
    };

    const description = typeDescriptions[bugType] || "General Issue";
    const currentUrl =
      data.currentTabUrl && data.currentTabUrl !== "N/A"
        ? data.currentTabUrl
        : "";

    let body = `## Describe the ${
      bugType === "4" ? "feature request" : "bug"
    }\n`;
    body += `<!-- Please provide a clear description of ${
      bugType === "4"
        ? "the feature you'd like to see"
        : "the issue you're experiencing"
    } -->\n\n`;

    if (bugType !== "4") {
      body += `## Steps to reproduce\n`;
      body += `Steps to reproduce the behavior:\n1. \n2. \n3. \n\n`;

      body += `## Expected behavior\n`;
      body += `<!-- What you expected to happen -->\n\n`;

      body += `## Actual behavior\n`;
      body += `<!-- What actually happened -->\n\n`;
    } else {
      body += `## Feature Description\n`;
      body += `<!-- Describe the feature you'd like to see -->\n\n`;

      body += `## Use Case\n`;
      body += `<!-- Why would this feature be useful? -->\n\n`;
    }

    // Add settings data if available
    if (data.settings && bugType !== "4") {
      body += `## ZenInternet Settings Data\n`;
      body += `*This data was automatically collected to help with debugging.*\n\n`;
      body += `<details>\n<summary>Click to expand settings data</summary>\n\n`;
      body += `\`\`\`json\n${JSON.stringify(
        data,
        null,
        2,
      )}\n\`\`\`\n\n</details>\n\n`;
    }

    body += `## Browser Information\n`;
    body += `- **Zen Browser Version:** <!-- Please specify your Zen browser version -->\n`;
    body += `- **Platform:** ${
      data.browserInfo?.platform || "<!-- Your OS -->"
    }\n`;
    body += `- **Extension Version:** ${data.addonVersion}\n\n`;

    if (currentUrl && bugType === "1") {
      body += `## Website\n`;
      body += `Current website: ${currentUrl}\n\n`;
    }

    body += `## Additional context\n`;
    body += `<!-- Add any other relevant information here -->\n`;

    return body;
  }

  // Collect all extension data for bug report (legacy method - still used by export)
  async collectBugReportData() {
    try {
      // Get all storage data
      const allData = await browser.storage.local.get(null);

      // Get addon version
      const manifest = browser.runtime.getManifest();

      // Get current tab info
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const currentTab = tabs[0];

      // Extract the same data structure as the export function, but exclude site-specific settings
      const fallbackBackgroundList = allData[FALLBACK_BACKGROUND_KEY] || [];

      const settingsToInclude = {
        [this.BROWSER_STORAGE_KEY]: allData[this.BROWSER_STORAGE_KEY] || {},
        [SKIP_FORCE_THEMING_KEY]: allData[SKIP_FORCE_THEMING_KEY] || [],
        [SKIP_THEMING_KEY]: allData[SKIP_THEMING_KEY] || [],
        [FALLBACK_BACKGROUND_KEY]: fallbackBackgroundList,
        stylesRepositoryUrl:
          allData.stylesRepositoryUrl ||
          "https://sameerasw.github.io/my-internet/styles.json",
      };

      // Remove fallbackBackgroundList from global settings if it exists there
      if (settingsToInclude[this.BROWSER_STORAGE_KEY].fallbackBackgroundList) {
        delete settingsToInclude[this.BROWSER_STORAGE_KEY]
          .fallbackBackgroundList;
      }

      // Get styles count for context (but don't include the actual styles data)
      const stylesData = allData.styles || {};
      const websiteStylesCount = Object.keys(stylesData.website || {}).length;

      // Count site-specific settings without including them
      let siteSettingsCount = 0;
      for (const key of Object.keys(allData)) {
        if (key.startsWith(this.BROWSER_STORAGE_KEY + ".")) {
          siteSettingsCount++;
        }
      }

      return {
        reportDate: new Date().toISOString(),
        addonVersion: manifest.version,
        currentTabUrl: currentTab ? currentTab.url : "N/A",
        currentTabHostname: currentTab
          ? new URL(currentTab.url).hostname
          : "N/A",
        browserInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
        extensionData: {
          settings: settingsToInclude,
          siteSettingsCount: siteSettingsCount, // Just the count, not the actual data
          stylesCount: websiteStylesCount,
          hasStyles: websiteStylesCount > 0,
        },
      };
    } catch (error) {
      console.error("Error collecting bug report data:", error);
      // Return minimal data if collection fails
      const manifest = browser.runtime.getManifest();
      return {
        reportDate: new Date().toISOString(),
        addonVersion: manifest.version,
        error: "Failed to collect full data: " + error.message,
      };
    }
  }

  // Create formatted issue body for bug report
  createBugReportBody(jsonData, currentUrl) {
    return `## Describe the bug
<!-- A clear and concise description of what the bug is. -->

## Steps to reproduce
Steps to reproduce the behavior:
1.
2.
3.

## Expected behavior
<!-- A clear and concise description of what you expected to happen. -->

## Actual behavior
<!-- Describe what actually happened. -->

## ZenInternet Backup JSON (Auto-Generated)
*This data was automatically collected to help with debugging.*

<details>
<summary>Click to expand JSON data</summary>

\`\`\`json
${jsonData}
\`\`\`

</details>

## Zen Browser Version
<!-- Please specify the version of the Zen browser you are using -->

## Platform
<!-- What platform are you using? (e.g., Windows, macOS, Linux, Android, iOS, etc.) -->

## Website (if applicable)
${
  currentUrl
    ? `Current tab: ${currentUrl}`
    : "<!-- If this bug relates to a specific website, please provide its URL -->"
}

## Additional context
<!-- Add any other context about the problem here. -->`;
  }

  // Add welcome screen check method
  checkWelcomeScreen() {
    // The `checkAndShowWelcome` function is now global in `welcome.js` and handles its own logic.
    // We just need to call it.
    if (window.checkAndShowWelcome) {
      window.checkAndShowWelcome().then((shouldShow) => {
        if (shouldShow) {
          const container = document.querySelector(".container");
          if (container) {
            container.style.opacity = "0.3";
            container.style.pointerEvents = "none";
          }
          const checkWelcomeComplete = setInterval(() => {
            const welcomeOverlay = $("welcome-overlay");
            if (
              !welcomeOverlay ||
              welcomeOverlay.classList.contains("hidden")
            ) {
              clearInterval(checkWelcomeComplete);
              if (container) {
                container.style.opacity = "1";
                container.style.pointerEvents = "auto";
              }
              this.loadSettings(() => {
                this.restoreSettings();
                this.updateModeLabels();
              });
            }
          }, 100);
        }
      });
    }
  }
})();
