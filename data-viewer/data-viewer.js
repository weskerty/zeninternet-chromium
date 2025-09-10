document.addEventListener("DOMContentLoaded", function () {
  const BROWSER_STORAGE_KEY = "transparentZenSettings";
  const SKIP_FORCE_THEMING_KEY = "skipForceThemingList";
  const SKIP_THEMING_KEY = "skipThemingList";
  const FALLBACK_BACKGROUND_KEY = "fallbackBackgroundList";
  const REPOSITORY_URL_KEY = "stylesRepositoryUrl";
  const STYLES_MAPPING_KEY = "stylesMapping";
  const DEFAULT_REPOSITORY_URL =
    "https://sameerasw.github.io/my-internet/styles.json";
  const USER_STYLES_MAPPING_KEY = "userStylesMapping";

  const globalSettingsElement = document.getElementById("global-settings-data");
  const skipListElement = document.getElementById("skip-list-data");
  const combinedWebsitesElement = document.getElementById(
    "combined-websites-data",
  );
  const deleteAllButton = document.getElementById("delete-all-data");
  const versionElement = document.getElementById("addon-version");
  const disableTransparencyToggle = document.getElementById(
    "disable-transparency",
  );
  const disableHoverToggle = document.getElementById("disable-hover");
  const disableFooterToggle = document.getElementById("disable-footer");
  const repositoryUrlInput = document.getElementById("repository-url");
  const setRepositoryUrlButton = document.getElementById("set-repository-url");
  const resetRepositoryUrlButton = document.getElementById(
    "reset-repository-url",
  );
  const repositoryUrlStatus = document.getElementById("repository-url-status");
  const exportButton = document.getElementById("export-settings");
  const importFileInput = document.getElementById("import-file");
  const importStatusElement = document.getElementById("import-status");

  loadAllData();
  displayAddonVersion();

  disableTransparencyToggle.addEventListener("change", function () {
    saveTransparencySettings(this.checked);
  });
  disableHoverToggle.addEventListener("change", function () {
    saveHoverSettings(this.checked);
  });
  disableFooterToggle.addEventListener("change", function () {
    saveFooterSettings(this.checked);
  });
  deleteAllButton.addEventListener("click", function () {
    if (
      confirm("WARNING: This will delete ALL extension data... Are you sure?")
    ) {
      deleteAllData();
    }
  });

  setRepositoryUrlButton.addEventListener("click", setRepositoryUrl);
  resetRepositoryUrlButton.addEventListener("click", resetRepositoryUrl);
  exportButton.addEventListener("click", exportSettings);
  importFileInput.addEventListener("change", importSettings);

  combinedWebsitesElement.addEventListener("change", (event) => {
    if (
      event.target.type === "checkbox" &&
      event.target.dataset.website &&
      event.target.dataset.feature
    ) {
      saveFeatureToggle(
        event.target.dataset.website,
        event.target.dataset.feature,
        event.target.checked,
      );
    }
  });

  loadRepositoryUrl();

  function loadRepositoryUrl() {
    chrome.storage.local.get(REPOSITORY_URL_KEY, (data) => {
      const repositoryUrl = data[REPOSITORY_URL_KEY] || DEFAULT_REPOSITORY_URL;
      repositoryUrlInput.value = repositoryUrl;
    });
  }

  function setRepositoryUrl() {
    const newUrl = repositoryUrlInput.value.trim();
    if (!newUrl)
      return showRepositoryUrlStatus("Repository URL cannot be empty", "error");
    try {
      new URL(newUrl);
    } catch (e) {
      return showRepositoryUrlStatus("Invalid URL format", "error");
    }
    chrome.storage.local.set({ [REPOSITORY_URL_KEY]: newUrl }, () => {
      showRepositoryUrlStatus("Repository URL saved successfully", "success");
      if (confirm("Would you like to clear existing styles data...?")) {
        clearStylesData();
      }
    });
  }

  function resetRepositoryUrl() {
    repositoryUrlInput.value = DEFAULT_REPOSITORY_URL;
    chrome.storage.local.set(
      { [REPOSITORY_URL_KEY]: DEFAULT_REPOSITORY_URL },
      () => {
        showRepositoryUrlStatus("Repository URL reset to default", "success");
        if (confirm("Would you like to clear existing styles data...?")) {
          clearStylesData();
        }
      },
    );
  }

  function clearStylesData() {
    chrome.storage.local.get(null, (allData) => {
      const dataToKeep = {};
      if (allData[BROWSER_STORAGE_KEY])
        dataToKeep[BROWSER_STORAGE_KEY] = allData[BROWSER_STORAGE_KEY];
      if (allData[REPOSITORY_URL_KEY])
        dataToKeep[REPOSITORY_URL_KEY] = allData[REPOSITORY_URL_KEY];
      if (allData[STYLES_MAPPING_KEY])
        dataToKeep[STYLES_MAPPING_KEY] = allData[STYLES_MAPPING_KEY];

      chrome.storage.local.clear(() => {
        chrome.storage.local.set(dataToKeep, () => {
          loadAllData();
          showRepositoryUrlStatus(
            "Styles data cleared successfully",
            "success",
          );
        });
      });
    });
  }

  function showRepositoryUrlStatus(message, type) {
    repositoryUrlStatus.textContent = message;
    repositoryUrlStatus.className = `repository-url-status status-${type}`;
    setTimeout(() => {
      repositoryUrlStatus.textContent = "";
      repositoryUrlStatus.className = "repository-url-status";
    }, 5000);
  }

  function deleteAllData() {
    chrome.storage.local.clear(() => {
      alert(
        "All data has been deleted successfully. The page will now reload.",
      );
      window.location.reload();
    });
  }

  function saveTransparencySettings(isDisabled) {
    chrome.storage.local.get(BROWSER_STORAGE_KEY, (data) => {
      const settings = data[BROWSER_STORAGE_KEY] || {};
      settings.disableTransparency = isDisabled;
      chrome.storage.local.set({ [BROWSER_STORAGE_KEY]: settings });
    });
  }

  function saveHoverSettings(isDisabled) {
    chrome.storage.local.get(BROWSER_STORAGE_KEY, (data) => {
      const settings = data[BROWSER_STORAGE_KEY] || {};
      settings.disableHover = isDisabled;
      chrome.storage.local.set({ [BROWSER_STORAGE_KEY]: settings });
    });
  }

  function saveFooterSettings(isDisabled) {
    chrome.storage.local.get(BROWSER_STORAGE_KEY, (data) => {
      const settings = data[BROWSER_STORAGE_KEY] || {};
      settings.disableFooter = isDisabled;
      chrome.storage.local.set({ [BROWSER_STORAGE_KEY]: settings });
    });
  }

  function saveFeatureToggle(websiteDomain, feature, isEnabled) {
    const siteKey = `${BROWSER_STORAGE_KEY}.${websiteDomain}`;
    chrome.storage.local.get(siteKey, (data) => {
      const siteSettings = data[siteKey] || {};
      siteSettings[feature] = isEnabled;
      chrome.storage.local.set({ [siteKey]: siteSettings }, () => {
        console.log(
          `Feature ${feature} for ${websiteDomain} set to ${isEnabled}`,
        );
      });
    });
  }

  function exportSettings() {
    chrome.storage.local.get(null, (allData) => {
      const settingsToBackup = {
        [BROWSER_STORAGE_KEY]: allData[BROWSER_STORAGE_KEY] || {},
        [SKIP_FORCE_THEMING_KEY]: allData[SKIP_FORCE_THEMING_KEY] || [],
        [SKIP_THEMING_KEY]: allData[SKIP_THEMING_KEY] || [],
        [FALLBACK_BACKGROUND_KEY]: allData[FALLBACK_BACKGROUND_KEY] || [],
        [REPOSITORY_URL_KEY]:
          allData[REPOSITORY_URL_KEY] || DEFAULT_REPOSITORY_URL,
      };
      const siteSpecificSettings = {};
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith(BROWSER_STORAGE_KEY + ".")) {
          siteSpecificSettings[key] = value;
        }
      }
      const userMappingData = allData[USER_STYLES_MAPPING_KEY] || {
        mapping: {},
      };
      settingsToBackup.userMappings = userMappingData;

      const manifest = chrome.runtime.getManifest();
      const exportData = {
        exportDate: new Date().toISOString(),
        addonVersion: manifest.version,
        settings: settingsToBackup,
        siteSettings: siteSpecificSettings,
      };

      const jsonData = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zen-internet-settings-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      showImportStatus("Settings exported successfully!", "success");
    });
  }

  function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        if (!importData.settings || !importData.settings[BROWSER_STORAGE_KEY]) {
          throw new Error("Invalid settings file format");
        }
        if (
          confirm(
            `Are you sure you want to import settings from ${importData.exportDate}?`,
          )
        ) {
          const importOperations = {
            [BROWSER_STORAGE_KEY]: importData.settings[BROWSER_STORAGE_KEY],
            [SKIP_FORCE_THEMING_KEY]:
              importData.settings[SKIP_FORCE_THEMING_KEY] || [],
            [SKIP_THEMING_KEY]: importData.settings[SKIP_THEMING_KEY] || [],
            [REPOSITORY_URL_KEY]:
              importData.settings[REPOSITORY_URL_KEY] || DEFAULT_REPOSITORY_URL,
          };
          if (importData.siteSettings) {
            for (const [key, value] of Object.entries(
              importData.siteSettings,
            )) {
              importOperations[key] = value;
            }
          }
          if (importData.userMappings) {
            importOperations[USER_STYLES_MAPPING_KEY] = importData.userMappings;
          }
          chrome.storage.local.set(importOperations, () => {
            showImportStatus(
              "Settings imported successfully! Reloading...",
              "success",
            );
            setTimeout(() => window.location.reload(), 1500);
          });
        } else {
          importFileInput.value = "";
          showImportStatus("Import cancelled", "error");
        }
      } catch (parseError) {
        showImportStatus(`Import failed: ${parseError.message}`, "error");
      }
    };
    reader.readAsText(file);
  }

  function showImportStatus(message, type) {
    importStatusElement.textContent = message;
    importStatusElement.className = `import-status status-${type}`;
    setTimeout(() => {
      importStatusElement.textContent = "";
      importStatusElement.className = "import-status";
    }, 5000);
  }

  function displayAddonVersion() {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `Version: ${manifest.version}`;
  }

  function loadAllData() {
    chrome.storage.local.get(null, (data) => {
      displayGlobalSettings(data);
      displaySkipLists(data);
      displayCombinedWebsiteData(data);
      displayMappingData(data);
      loadUserMappingsUI();
      setupCollapsibleSections();
    });
  }

  function displayGlobalSettings(data) {
    const settings = data[BROWSER_STORAGE_KEY] || {};
    disableTransparencyToggle.checked = settings.disableTransparency || false;
    disableHoverToggle.checked = settings.disableHover || false;
    disableFooterToggle.checked = settings.disableFooter || false;
    globalSettingsElement.innerHTML = "";
    const table = document.createElement("table");
    table.classList.add("data-table");

    // Table header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>Setting</th><th>Value</th>`;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement("tbody");

    for (const [key, value] of Object.entries(settings)) {
      // Skip lastFetchedTime as it will be formatted differently
      if (key === "lastFetchedTime") continue;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatSettingName(key)}</td>
        <td>${formatSettingValue(value)}</td>
      `;
      tbody.appendChild(row);
    }

    // Add last fetched time with formatted date if available
    if (settings.lastFetchedTime) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatSettingName("lastFetchedTime")}</td>
        <td>${new Date(settings.lastFetchedTime).toLocaleString()}</td>
      `;
      tbody.appendChild(row);
    } else {
      // Show "Never" if no lastFetchedTime is found
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatSettingName("lastFetchedTime")}</td>
        <td><span class="null-value">Never</span></td>
      `;
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    globalSettingsElement.appendChild(table);
  }

  function displaySkipLists(data) {
    const settings = data[BROWSER_STORAGE_KEY] || {};
    const skipForceList = data[SKIP_FORCE_THEMING_KEY] || [];
    const skipThemingList = data[SKIP_THEMING_KEY] || [];
    const fallbackBackgroundList = data[FALLBACK_BACKGROUND_KEY] || [];
    const isWhitelistMode = settings.whitelistMode || false;
    const isWhitelistStyleMode = settings.whitelistStyleMode || false;

    displayCombinedSkipLists(
      skipForceList,
      skipThemingList,
      fallbackBackgroundList,
      isWhitelistMode,
      isWhitelistStyleMode,
    );
  }

  function displayCombinedSkipLists(
    skipForceList,
    skipThemingList,
    fallbackBackgroundList,
    isWhitelistMode,
    isWhitelistStyleMode,
  ) {
    skipListElement.innerHTML = "";

    // Create title and description section
    const titleSection = document.createElement("div");
    titleSection.className = "list-title-section";

    const forceModeName = isWhitelistMode ? "Whitelist" : "Blacklist";
    const styleModeName = isWhitelistStyleMode ? "Whitelist" : "Blacklist";

    titleSection.innerHTML = `
      <h3>Website Lists Overview</h3>
      <div class="mode-info">
        <div><strong>Force Styling Mode:</strong> ${forceModeName} Mode (${
      isWhitelistMode
        ? "only apply to sites in the list"
        : "apply to all except sites in the list"
    })</div>
        <div><strong>General Styling Mode:</strong> ${styleModeName} Mode (${
      isWhitelistStyleMode
        ? "only apply to sites in the list"
        : "apply to all except sites in the list"
    })</div>
      </div>
    `;

    skipListElement.appendChild(titleSection);

    // Add Clear All Lists button
    if (
      skipForceList.length > 0 ||
      skipThemingList.length > 0 ||
      fallbackBackgroundList.length > 0
    ) {
      const clearAllButton = document.createElement("button");
      clearAllButton.classList.add(
        "action-button",
        "danger",
        "clear-list-button",
      );
      clearAllButton.innerHTML = '<i class="fas fa-trash"></i> Clear All Lists';
      clearAllButton.addEventListener("click", clearAllSkipLists);
      skipListElement.appendChild(clearAllButton);
    }

    // Create container for the three tables
    const tablesContainer = document.createElement("div");
    tablesContainer.className = "tables-container";

    // Create force styling list
    const forceListSection = createSingleListSection(
      skipForceList,
      isWhitelistMode,
      "Force Styling List",
      isWhitelistMode
        ? "Sites where forced styling IS applied"
        : "Sites where forced styling is NOT applied",
      SKIP_FORCE_THEMING_KEY,
    );

    // Create regular styling list
    const regularListSection = createSingleListSection(
      skipThemingList,
      isWhitelistStyleMode,
      "Regular Styling List",
      isWhitelistStyleMode
        ? "Sites where regular styling IS applied"
        : "Sites where regular styling is NOT applied",
      SKIP_THEMING_KEY,
    );

    // Create fallback background list
    const fallbackListSection = createSingleListSection(
      fallbackBackgroundList,
      false, // Fallback background is not whitelist/blacklist based
      "Fallback Background List",
      "Sites where a default background added, no transparency",
      FALLBACK_BACKGROUND_KEY,
    );

    tablesContainer.appendChild(forceListSection);
    tablesContainer.appendChild(regularListSection);
    tablesContainer.appendChild(fallbackListSection);
    skipListElement.appendChild(tablesContainer);
  }

  function createSingleListSection(
    list,
    isWhitelistMode,
    title,
    description,
    storageKey,
  ) {
    const section = document.createElement("div");
    section.className = "list-section";

    const sectionTitle = document.createElement("h4");
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);

    const sectionDescription = document.createElement("p");
    sectionDescription.className = "list-description";
    sectionDescription.textContent = description;
    section.appendChild(sectionDescription);

    if (list.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "no-data";
      emptyMessage.textContent = "No websites in this list";
      section.appendChild(emptyMessage);
      return section;
    }

    const table = document.createElement("table");
    table.classList.add("data-table");

    // Table header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>Website</th><th>Action</th>`;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement("tbody");

    for (const site of list) {
      const row = document.createElement("tr");

      // Website column
      const siteCell = document.createElement("td");
      siteCell.textContent = site;
      row.appendChild(siteCell);

      // Action column
      const actionCell = document.createElement("td");
      const removeButton = document.createElement("button");
      removeButton.className = "remove-site-button";
      removeButton.innerHTML = '<i class="fas fa-times"></i>';
      removeButton.title = "Remove from list";
      removeButton.addEventListener("click", function () {
        removeSiteFromList(site, storageKey); // This function will be converted
      });
      actionCell.appendChild(removeButton);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function removeSiteFromList(site, listKey) {
    chrome.storage.local.get(listKey, (data) => {
      const list = data[listKey] || [];
      const newList = list.filter((item) => item !== site);
      chrome.storage.local.set({ [listKey]: newList }, () => {
        loadAllData();
        console.log(`Removed ${site} from ${listKey}`);
      });
    });
  }

  function clearAllSkipLists() {
    if (confirm("Are you sure you want to clear ALL website lists?")) {
      chrome.storage.local.set(
        {
          [SKIP_FORCE_THEMING_KEY]: [],
          [SKIP_THEMING_KEY]: [],
          [FALLBACK_BACKGROUND_KEY]: [],
        },
        () => {
          loadAllData();
          console.log("All skip lists cleared");
        },
      );
    }
  }

  function displayCombinedWebsiteData(data) {
    combinedWebsitesElement.innerHTML = "";

    const styles = data.styles || {};
    const websites = styles.website || {};
    const websiteKeys = Object.keys(websites);

    // Find all site-specific settings
    const siteSettings = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(BROWSER_STORAGE_KEY + ".")) {
        const siteName = key.substring(BROWSER_STORAGE_KEY.length + 1);
        siteSettings[siteName] = value;
      }
    }

    if (websiteKeys.length === 0) {
      combinedWebsitesElement.innerHTML =
        '<div class="no-data">No websites found. Try fetching styles first.</div>';
      return;
    }

    // Create search filter
    const searchContainer = document.createElement("div");
    searchContainer.classList.add("search-container");

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search websites...";
    searchInput.classList.add("search-input");
    searchInput.addEventListener("input", function () {
      filterWebsites(this.value.toLowerCase());
    });

    const searchIcon = document.createElement("i");
    searchIcon.className = "fas fa-search search-icon";

    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(searchInput);

    combinedWebsitesElement.appendChild(searchContainer);

    // Create expand all button
    const expandAllButton = document.createElement("button");
    expandAllButton.classList.add(
      "action-button",
      "secondary",
      "view-all-button",
    );
    expandAllButton.textContent = "Expand All";
    expandAllButton.addEventListener("click", function () {
      const expanded = this.textContent === "Collapse All";
      const panels = document.querySelectorAll(".website-panel");

      panels.forEach((panel) => {
        const header = panel.querySelector(".website-header");
        const content = panel.querySelector(".website-content");

        if (expanded) {
          header.classList.remove("active");
          content.style.maxHeight = null;

          // Also collapse all CSS blocks
          content.querySelectorAll(".css-block-header").forEach((cssHeader) => {
            cssHeader.classList.remove("active");
            const cssContent = cssHeader.nextElementSibling;
            if (cssContent) cssContent.style.maxHeight = null;
          });
        } else {
          header.classList.add("active");
          content.style.maxHeight = content.scrollHeight + "px";
        }
      });

      this.textContent = expanded ? "Expand All" : "Collapse All";
    });

    combinedWebsitesElement.appendChild(expandAllButton);

    const websitesContainer = document.createElement("div");
    websitesContainer.classList.add("websites-container");
    combinedWebsitesElement.appendChild(websitesContainer);

    // Sort websites alphabetically
    websiteKeys.sort();

    // Create panels for each website
    for (const website of websiteKeys) {
      const websitePanel = document.createElement("div");
      websitePanel.classList.add("website-panel");
      websitePanel.dataset.website = website.toLowerCase();

      const header = document.createElement("div");
      header.classList.add("website-header");

      // Create website name with feature count
      const features = websites[website];
      const featureCount = Object.keys(features).length;

      // Get site settings if available
      const siteName = website.replace(".css", "");
      let domainName;
      // Declare settingsData at a higher scope so it's accessible throughout the function
      let settingsData = {};

      // Handle wildcard sites correctly
      if (siteName.startsWith("+")) {
        domainName = siteName.slice(1);
        // For wildcard sites, we need to find any matching domain in settings
        const matchingDomains = Object.keys(siteSettings).filter(
          (domain) =>
            domain === domainName || domain.endsWith(`.${domainName}`),
        );

        // Use the first matching domain's settings if any found
        const settingsKey =
          matchingDomains.length > 0 ? matchingDomains[0] : null;
        settingsData = settingsKey ? siteSettings[settingsKey] : {};
      } else {
        // For direct domains, just check the domain and www.domain
        domainName = siteName;
        settingsData =
          siteSettings[domainName] || siteSettings[`www.${domainName}`] || {};
      }

      header.innerHTML = `
        <div class="website-header-content">
          <span class="website-name">${website}</span>
          <span class="feature-count">${featureCount} features</span>
        </div>
      `;

      header.addEventListener("click", function () {
        this.classList.toggle("active");
        const content = this.nextElementSibling;
        if (content.style.maxHeight) {
          content.style.maxHeight = null;
        } else {
          content.style.maxHeight = content.scrollHeight + "px";
        }
      });

      const content = document.createElement("div");
      content.classList.add("website-content");

      // Create CSS blocks for each feature
      for (const [feature, css] of Object.entries(features)) {
        const cssBlock = document.createElement("div");
        cssBlock.classList.add("css-block");

        // Get the feature's enabled status from site settings
        const isEnabled = settingsData[feature] !== false; // true by default

        // Create the block header with feature name and toggle switch
        const cssBlockHeader = document.createElement("div");
        cssBlockHeader.classList.add("css-block-header");
        cssBlockHeader.innerHTML = `
          <span class="feature-name">${feature}</span>
          <label class="toggle-switch">
            <input type="checkbox" 
                   data-website="${domainName}" 
                   data-feature="${feature}" 
                   ${isEnabled ? "checked" : ""}>
            <span class="slider round"></span>
          </label>
        `;

        // Make the CSS block header toggleable
        cssBlockHeader.addEventListener("click", function (e) {
          // Don't expand if clicking on toggle switch
          if (
            e.target.type === "checkbox" ||
            e.target.classList.contains("slider") ||
            e.target.classList.contains("toggle-switch")
          ) {
            return;
          }

          this.classList.toggle("active");
          const cssContent = this.nextElementSibling;
          if (cssContent.style.maxHeight) {
            cssContent.style.maxHeight = null;
          } else {
            cssContent.style.maxHeight = cssContent.scrollHeight + "px";
          }
        });

        // Create the CSS content area
        const cssContent = document.createElement("div");
        cssContent.classList.add("css-content");

        const cssCode = document.createElement("pre");
        cssCode.classList.add("css-code");
        cssCode.textContent = css;
        cssContent.appendChild(cssCode);

        cssBlock.appendChild(cssBlockHeader);
        cssBlock.appendChild(cssContent);
        content.appendChild(cssBlock);
      }

      websitePanel.appendChild(header);
      websitePanel.appendChild(content);
      websitesContainer.appendChild(websitePanel);
    }

    // Filter function for search
    function filterWebsites(query) {
      const panels = websitesContainer.querySelectorAll(".website-panel");

      panels.forEach((panel) => {
        const website = panel.dataset.website;
        if (website.includes(query)) {
          panel.style.display = "";
        } else {
          panel.style.display = "none";
        }
      });
    }
  }
  function loadUserMappingsUI() {
    const userMappingsList = document.getElementById("user-mappings-list");
    const addMappingForm = document.getElementById("add-mapping-form");
    const sourceInput = document.getElementById("source-style-input");
    const targetInput = document.getElementById("target-site-input");

    chrome.storage.local.get(USER_STYLES_MAPPING_KEY, (data) => {
      let userMapping = data[USER_STYLES_MAPPING_KEY] || { mapping: {} };

      function renderUserMappings() {
        userMappingsList.innerHTML = "";
        const mapping = userMapping.mapping || {};
        if (Object.keys(mapping).length === 0) {
          userMappingsList.innerHTML =
            '<div class="no-mappings">No custom mappings added.</div>';
          return;
        }
        keys.sort();
        keys.forEach((source) => {
          mapping[source].forEach((site, idx) => {
            const item = document.createElement("div");
            item.className = "user-mapping-item";
            item.innerHTML = `<span class="source-style">${source}</span> → <span class="target-site-tag">${site}</span> <button class="remove-user-mapping" data-source="${source}" data-site="${site}"><i class="fas fa-times"></i></button>`;
            userMappingsList.appendChild(item);
          });
        });
        // Add remove event listeners
        userMappingsList
          .querySelectorAll(".remove-user-mapping")
          .forEach((btn) => {
            btn.addEventListener("click", (e) => {
              const source = btn.getAttribute("data-source");
              const site = btn.getAttribute("data-site");
              if (userMapping.mapping[source]) {
                userMapping.mapping[source] = userMapping.mapping[
                  source
                ].filter((s) => s !== site);
                if (userMapping.mapping[source].length === 0)
                  delete userMapping.mapping[source];
                chrome.storage.local.set(
                  { [USER_STYLES_MAPPING_KEY]: userMapping },
                  () => {
                    renderUserMappings();
                    loadAllData();
                  },
                );
              }
            });
          });
      }
      renderUserMappings();

      // Add mapping form handler
      addMappingForm.onsubmit = (e) => {
        e.preventDefault();
        const source = sourceInput.value.trim();
        const site = targetInput.value
          .trim()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "");
        if (!source || !site) return;
        if (!userMapping.mapping[source]) userMapping.mapping[source] = [];
        if (!userMapping.mapping[source].includes(site)) {
          userMapping.mapping[source].push(site);
          chrome.storage.local.set(
            { [USER_STYLES_MAPPING_KEY]: userMapping },
            () => {
              renderUserMappings();
              loadAllData();
            },
          );
        }
        addMappingForm.reset();
      };
    });
  }

  function displayMappingData(data) {
    const mappingData = data[STYLES_MAPPING_KEY];
    const userMappingData = data[USER_STYLES_MAPPING_KEY] || { mapping: {} };
    const mappingsContainer = document.getElementById("mappings-data");
    // Merge mappings: fetched first, then user (user can override/add)
    const merged = {};
    if (mappingData && mappingData.mapping) {
      for (const [src, targets] of Object.entries(mappingData.mapping)) {
        merged[src] = [...targets];
      }
    }
    if (userMappingData && userMappingData.mapping) {
      for (const [src, targets] of Object.entries(userMappingData.mapping)) {
        if (!merged[src]) merged[src] = [];
        for (const t of targets) {
          if (!merged[src].includes(t)) merged[src].push(t);
        }
      }
    }
    const mappingKeys = Object.keys(merged);
    if (mappingKeys.length === 0) {
      mappingsContainer.innerHTML =
        '<div class="no-mappings">No style mappings found.</div>';
      return;
    }
    mappingKeys.sort();
    const mappingsHTML = mappingKeys
      .map((sourceStyle) => {
        const fetched =
          (mappingData &&
            mappingData.mapping &&
            mappingData.mapping[sourceStyle]) ||
          [];
        const user =
          (userMappingData &&
            userMappingData.mapping &&
            userMappingData.mapping[sourceStyle]) ||
          [];
        const targetSitesHTML = merged[sourceStyle]
          .map((site) => {
            const isUser = user.includes(site);
            return `<span class="target-site-tag${
              isUser ? " user-mapping" : ""
            }">${site}${
              isUser
                ? " <i class='fas fa-user-edit' title='Custom mapping'></i>"
                : ""
            }</span>`;
          })
          .join("");
        return `
        <div class="mapping-item">
          <div class="mapping-header">
            <span class="source-style">${sourceStyle}</span>
            <span class="target-count">${merged[sourceStyle].length} mapped sites</span>
          </div>
          <div class="target-sites-list">
            ${targetSitesHTML}
          </div>
        </div>
      `;
      })
      .join("");
    mappingsContainer.innerHTML = `<div class="mappings-container">${mappingsHTML}</div>`;
  }

  function setupCollapsibleSections() {
    const collapsibleHeaders = document.querySelectorAll(".collapsible");

    collapsibleHeaders.forEach((header) => {
      header.addEventListener("click", () => {
        const targetId = header.getAttribute("data-target");
        const targetSection = document.querySelector(
          `[data-section="${targetId}"]`,
        );
        const icon = header.querySelector("i");

        if (targetSection) {
          const isCollapsed = targetSection.classList.contains("collapsed");

          if (isCollapsed) {
            // Expand
            targetSection.classList.remove("collapsed");
            header.classList.add("expanded");
            icon.className = "fas fa-chevron-up";
          } else {
            // Collapse
            targetSection.classList.add("collapsed");
            header.classList.remove("expanded");
            icon.className = "fas fa-chevron-down";
          }
        }
      });
    });
  }

  // Helper Functions
  function formatSettingName(name) {
    // Convert camelCase to Title Case with spaces
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  }

  function formatSettingValue(value) {
    if (typeof value === "boolean") {
      return value
        ? '<span class="badge enabled">Enabled</span>'
        : '<span class="badge disabled">Disabled</span>';
    } else if (value === null) {
      return '<span class="null-value">null</span>';
    } else if (typeof value === "object") {
      return '<span class="object-value">{Object}</span>';
    } else {
      return value;
    }
  }
});
