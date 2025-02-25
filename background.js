const CSS_URL_BASE = "https://sameerasw.github.io/my-internet/";

async function updateCSS(url, cssFileName) {
  try {
    let response = await fetch(url, {
      headers: {
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) throw new Error("Failed to fetch CSS");
    let cssText = await response.text();
    await browser.storage.local.set({ [cssFileName]: cssText });
    await browser.storage.sync.set({ [cssFileName]: cssText });
    console.log(`Updated CSS for ${cssFileName} from remote source.`);
  } catch (error) {
    console.error(`Error fetching CSS for ${cssFileName}:`, error);
  }
}

async function updateAllCSS(mapping) {
  for (const [site, cssFileName] of Object.entries(mapping)) {
    const url = `${CSS_URL_BASE}${cssFileName}`;
    await updateCSS(url, cssFileName);
  }
  console.log("All CSS files updated.");
}

// Fetch CSS on startup and then every hour
fetch("/mapper.json")
  .then((response) => response.json())
  .then((mapping) => updateAllCSS(mapping));

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "updateCSS") {
    fetch("/mapper.json")
      .then((response) => response.json())
      .then((mapping) => updateAllCSS(mapping));
  } else if (message.action === "restartBackground") {
    browser.runtime.reload();
  }
});
