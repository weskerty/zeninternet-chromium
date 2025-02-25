browser.storage.sync.get("githubCSS").then((data) => {
    if (data.githubCSS) {
        let style = document.createElement("style");
        style.textContent = data.githubCSS;
        document.head.appendChild(style);
        console.log("Injected custom GitHub CSS.");
    }
});
