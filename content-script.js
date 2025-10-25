(function () {
  const stylesheetId = "zeninternet-custom-styles";

  // Create or get our stylesheet element
  function getStylesheet() {
    let stylesheet = document.getElementById(stylesheetId);
    if (!stylesheet) {
      stylesheet = document.createElement("style");
      stylesheet.id = stylesheetId;
      stylesheet.type = "text/css";
      // Use document.head if available, otherwise fallback to document.documentElement
      (document.head || document.documentElement).appendChild(stylesheet);
    }
    return stylesheet;
  }

  // Update our stylesheet content
  function updateStyles(css) {
    const stylesheet = getStylesheet();
    stylesheet.textContent = css || "";
    console.log("ZenInternet: Styles were " + (css ? "updated" : "removed"));
  }

  // Announce content script is ready and provide current hostname
  function announceReady() {
    try {
      chrome.runtime.sendMessage(
        {
          action: "contentScriptReady",
          hostname: window.location.hostname,
        },
        (response) => {
          // The callback is fired when the background script responds.
          // We need to check chrome.runtime.lastError in case the background is not ready.
          if (chrome.runtime.lastError) {
            console.log(
              "ZenInternet: Could not announce ready state: " +
                chrome.runtime.lastError.message,
            );
          }
        },
      );
    } catch (e) {
      // Fail silently
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "applyStyles") {
      updateStyles(message.css);
      // Send a response back to the sender
      sendResponse({ success: true });
    }
    // Return true if you intend to send a response asynchronously (not needed here, but good practice)
    return false;
  });

  // Announce content script is ready on load
  announceReady();
})();
