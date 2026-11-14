(() => {
  const button = document.getElementById("bruttInstall");
  const touch = matchMedia("(pointer: coarse)");
  const appMode = matchMedia("(display-mode: standalone)");
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt;
  let installing = false;
  const inApp = () => appMode.matches || navigator.standalone === true;
  const update = () => {
    button.hidden = inApp() || (!installPrompt && !appleMobile);
  };

  window.addEventListener("beforeinstallprompt", event => {
    if (!touch.matches) return;
    event.preventDefault();
    installPrompt = event;
    update();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = undefined;
    button.hidden = true;
  });
  appMode.addEventListener("change", update);

  button.addEventListener("click", async () => {
    if (installing || inApp()) return;
    if (!installPrompt) {
      if (appleMobile) alert("No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.");
      return;
    }
    const prompt = installPrompt;
    installPrompt = undefined;
    installing = true;
    try {
      await prompt.prompt();
    } catch {
      toast("Abra o menu do navegador para instalar a Brutt.");
    } finally {
      installing = false;
      update();
    }
  });

  update();
})();
