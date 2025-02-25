new(class ExtensionPopup {
  BROWSER_STORAGE_KEY = "transparentZenSettings";
  browserStorageSettings = {};
  enableStylingSwitch = document.getElementById("enable-styling");
  refetchCSSButton = document.getElementById("refetch-css");
  websitesList = document.getElementById("websites-list");
  currentSiteHostname = "";
  
  constructor() {
    this.loadSettings().then((settings) => {
      if (settings) {
        this.browserStorageSettings = settings;
        this.getCurrentTabInfo().then(() => {
          this.restoreSettings();
          this.bindEvents();
        });
      }
    });
    this.refetchCSSButton.addEventListener("click", this.refetchCSS.bind(this));

    this.setupContentScriptInjection();
  }
  
  async getCurrentTabInfo() {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
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
    this.enableStylingSwitch.addEventListener("change", () => {
      this.saveSettings();
      this.updateActiveTabStyling();
    });
    
    this.websitesList.addEventListener("change", (event) => {
      this.saveSettings();
      // Update styling immediately when a checkbox changes
      if (event.target.type === 'checkbox') {
        this.updateActiveTabStyling();
      }
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
      // Get the styles from storage that were fetched using refetchCSS
      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles || {};
      
      this.websitesList.innerHTML = "";
      
      // Use the keys from styles object
      const websites = Object.keys(styles);
      
      if (websites.length === 0) {
        const listItem = document.createElement("li");
        listItem.textContent = "No styles available. Click 'Refetch latest styles' to update.";
        this.websitesList.appendChild(listItem);
        return;
      }
      
      // Create array to hold all website items
      const websiteItems = [];
      let currentSiteItem = null;
      
      for (const site of websites) {
        // Remove the .css extension if present
        const displayName = site.replace(/\.css$/, "");
        
        const isChecked =
          this.browserStorageSettings.websiteSettings?.[displayName] ?? true;
        
        const listItem = document.createElement("li");
        
        // Check if this site matches the current site
        const isCurrent = this.isCurrentSite(displayName);
        if (isCurrent) {
          listItem.classList.add("current-site");
          currentSiteItem = listItem; // Store the current site item separately
        }
        
        listItem.innerHTML = `
          <label>
            <input type="checkbox" name="${displayName}" ${isChecked ? "checked" : ""}>
            ${displayName}
            ${isCurrent ? '<span class="current-badge">Current</span>' : ''}
          </label>
        `;
        
        // Add to array if not current site
        if (!isCurrent) {
          websiteItems.push(listItem);
        }
      }
      
      // Add current site at the top if it exists
      if (currentSiteItem) {
        this.websitesList.appendChild(currentSiteItem);
      }
      
      // Add all other sites
      websiteItems.forEach(item => {
        this.websitesList.appendChild(item);
      });
    } catch (error) {
      console.error("Error loading websites list:", error);
      this.websitesList.innerHTML = "<li>Error loading websites list. Please try refetching styles.</li>";
    }
  }
  
  isCurrentSite(siteName) {
    if (!this.currentSiteHostname) return false;
    
    // Direct match
    if (this.currentSiteHostname === siteName) return true;

    if (this.currentSiteHostname.startsWith("www.")) {
      const nonWww = this.currentSiteHostname.replace("www.", "");
      if (nonWww === siteName) return true;
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
      
      // Reload the websites list after fetching new styles
      this.loadWebsitesList();
      
      // Update styling on the active tab
      this.updateActiveTabStyling();
      
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
  
  setupContentScriptInjection() {
    // Listen for tab updates to apply CSS when needed
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        this.applyCSSToTab(tab);
      }
    });
    
    // Also handle tabs that are already open when the extension starts
    this.updateAllTabs();
  }
  
  async updateAllTabs() {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      this.applyCSSToTab(tab);
    }
  }
  
  async updateActiveTabStyling() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      this.applyCSSToTab(tabs[0]);
    }
  }
  
  async applyCSSToTab(tab) {
    const url = new URL(tab.url);
    const hostname = url.hostname;
    
    // First remove any existing CSS
    try {
      await browser.tabs.removeCSS(tab.id, { 
        code: "/* Placeholder for removing CSS */" 
      });
    } catch (error) {
      // Ignore errors as the tab might not have any CSS injected
    }
    
    // Check if we should apply CSS to this site
    if (!this.shouldApplyCSS(hostname)) {
      return;
    }
    
    try {
      // Get the styles from storage
      const stylesData = await browser.storage.local.get("styles");
      const styles = stylesData.styles || {};
      
      // Find matching CSS for this hostname
      let cssToApply = null;
      
      // Check for direct match (with .css extension)
      if (styles[hostname + '.css']) {
        cssToApply = styles[hostname + '.css'];
      } 
      // Check for domain matches (e.g. youtube.com matches m.youtube.com)
      else {
        for (const site of Object.keys(styles)) {
          const siteName = site.replace(/\.css$/, "");
          if (hostname.includes(siteName)) {
            cssToApply = styles[site];
            break;
          }
        }
      }
      
      if (cssToApply) {
        await browser.tabs.insertCSS(tab.id, { code: cssToApply });
        console.info(`Applied CSS to ${hostname}`);
      }
    } catch (error) {
      console.error(`Error applying CSS to ${hostname}:`, error);
    }
  }
  
  shouldApplyCSS(hostname) {
    // Global enable/disable switch
    if (!this.browserStorageSettings.enableStyling) {
      return false;
    }
    
    // Check website-specific settings
    const websiteSettings = this.browserStorageSettings.websiteSettings || {};
    
    // First check for exact hostname match
    if (websiteSettings[hostname] !== undefined) {
      return websiteSettings[hostname];
    }
    
    // Then check for domain matches (e.g. youtube.com matches m.youtube.com)
    for (const site in websiteSettings) {
      if (hostname.includes(site)) {
        return websiteSettings[site];
      }
    }
    
    // Default to enabled if no specific setting found
    return true;
  }
})();