(() => {
  const button = document.getElementById("bruttInstall");
  const touch = matchMedia("(pointer: coarse)");
  const appMode = matchMedia("(display-mode: standalone)");
  let installPrompt;
  let installing = false;
  let installed = false;
  const inApp = () => appMode.matches || navigator.standalone === true;
  const update = () => {
    button.hidden = installed || inApp() || installing || !installPrompt;
  };

  window.addEventListener("beforeinstallprompt", event => {
    if (!touch.matches || installed || inApp() || typeof event.prompt !== "function") return;
    event.preventDefault();
    installPrompt = event;
    update();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    installPrompt = undefined;
    button.hidden = true;
  });
  appMode.addEventListener("change", update);

  button.addEventListener("click", async () => {
    if (installing || installed || inApp() || !installPrompt) return;
    const prompt = installPrompt;
    installPrompt = undefined;
    installing = true;
    update();
    try {
      await prompt.prompt();
    } catch {
    } finally {
      installing = false;
      update();
    }
  });

  update();
})();
