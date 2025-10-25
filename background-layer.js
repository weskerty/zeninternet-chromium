(function () {
  const BG_KEY = "backgroundImageUrl";
  const STYLE_ID = "zen-background-layer";

  const ANIMATED_CSS = `
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 120%;
  height: 120%;
  background: radial-gradient(circle at 50% 50%, rgba(0, 59, 8, 1) 0%, transparent 60%),
              radial-gradient(circle at 80% 70%, rgba(51, 135, 156, 1) 0%, transparent 50%),
              radial-gradient(circle at 50% 50%, rgba(241, 48, 125, 0.69) 0%, transparent 60%);
  background-size: 200% 200%;
  filter: blur(90px);
  animation: zen-fog-drift 25s ease-in-out infinite;
  z-index: -9999;
  pointer-events: none;
  opacity: 0.6;
}

@keyframes zen-fog-drift {
  0% {
    transform: translate(-5%, -5%);
    background-position: 0% 0%, 100% 100%, 50% 50%;
  }
  25% {
    transform: translate(5%, -5%);
    background-position: 50% 30%, 70% 80%, 40% 60%;
  }
  50% {
    transform: translate(5%, 5%);
    background-position: 100% 100%, 0% 0%, 30% 70%;
  }
  75% {
    transform: translate(-5%, 5%);
    background-position: 60% 90%, 30% 20%, 70% 40%;
  }
  100% {
    transform: translate(-5%, -5%);
    background-position: 0% 0%, 100% 100%, 50% 50%;
  }
}
`;

  const IMAGE_CSS = (url) => `
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url('${url}');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -9999;
  pointer-events: none;
}
`;

  function apply(url) {
    let s = document.getElementById(STYLE_ID);
    if (!s) {
      s = document.createElement("style");
      s.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(s);
    }
    s.textContent = url ? IMAGE_CSS(url) : ANIMATED_CSS;
  }

  chrome.storage.local.get(BG_KEY, (d) => {
    apply(d[BG_KEY] || "");
  });

  chrome.storage.onChanged.addListener((ch, a) => {
    if (a === "local" && ch[BG_KEY]) {
      apply(ch[BG_KEY].newValue || "");
    }
  });
})();
