(function () {
  const B2="zeninternet-base-bg";
  const B1=`body::before{content:'';position:fixed;top:50%;left:50%;width:500px;height:500px;transform:translate(-50%,-50%);filter:blur(50px);background-image:url(''),linear-gradient(#4ddc9e3b,#061733,#340a20);background-size:cover;background-position:center;background-repeat:no-repeat;animation:r1 10s cubic-bezier(0.8,0.2,0.2,0.8) alternate infinite;border-radius:30% 70% 70% 30%/30% 30% 70% 70%;z-index:-1;pointer-events:none}@keyframes r1{0%{transform:translate(-50%,-50%) rotate(0deg)}100%{transform:translate(-50%,-50%) rotate(360deg)}}`;
  const stylesheetId = "zeninternet-custom-styles";

  function B3(){
    let s=document.getElementById(B2);
    if(!s){
      s=document.createElement("style");
      s.id=B2;
      s.type="text/css";
      s.textContent=B1;
      (document.head||document.documentElement).insertBefore(s,document.head?.firstChild||document.documentElement.firstChild);
    }
    return s;
  }
  function getStylesheet() {
    let stylesheet = document.getElementById(stylesheetId);
    if (!stylesheet) {
      stylesheet = document.createElement("style");
      stylesheet.id = stylesheetId;
      stylesheet.type = "text/css";
      (document.head || document.documentElement).appendChild(stylesheet);
    }
    return stylesheet;
  }

  function updateStyles(css) {
    B3();
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

  B3();
  announceReady();
})();
