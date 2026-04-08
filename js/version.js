// Fonte unica da versao exibida no app.
const APP_VERSION = "v2.0.1";

window.APP_VERSION = APP_VERSION;

function applyAppVersion() {
  const targets = document.querySelectorAll("[data-app-version]");
  targets.forEach((el) => {
    el.textContent = APP_VERSION;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyAppVersion);
} else {
  applyAppVersion();
}
