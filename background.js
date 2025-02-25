const CSS_URL =
  "https://sameerasw.github.io/my-internet/github.com.css";

async function updateCSS() {
  try {
    let response = await fetch(CSS_URL, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) throw new Error("Failed to fetch CSS");
    let cssText = await response.text();
    await browser.storage.local.set({ githubCSS: cssText });
    await browser.storage.sync.set({ githubCSS: cssText });
    console.log("Updated GitHub CSS from remote source." + cssText);
  } catch (error) {
    console.error("Error fetching CSS:", error);
  }
}

// Fetch CSS on startup and then every hour
updateCSS();

// Listen for messages to restart the background script
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "restartBackground") {
    browser.runtime.reload();
  }
});