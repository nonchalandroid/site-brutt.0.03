(() => {
  const dock = document.getElementById("bruttDock");
  const menu = document.getElementById("dockMenu");
  if (!menu.showModal) return;
  const mobile = matchMedia("(max-width: 640px)");
  const search = document.getElementById("q");
  const cart = document.getElementById("cartBtn");
  const count = document.getElementById("cartN");
  const badge = dock.querySelector(".dock-badge");
  const actions = [...dock.querySelectorAll("[data-dock]")];
  const cartAction = dock.querySelector('[data-dock="carrinho"]');
  const menuAction = dock.querySelector('[data-dock="menu"]');
  const list = menu.querySelector(".dock-menu-links");

  function select(action) {
    dock.querySelector("[aria-current]")?.removeAttribute("aria-current");
    action.setAttribute("aria-current", "true");
    dock.style.setProperty("--dock-active", actions.indexOf(action));
  }

  function updateCount() {
    badge.textContent = count.textContent;
    badge.hidden = count.hidden || !count.textContent;
    cartAction.setAttribute("aria-label", badge.hidden ? "Carrinho" : `Carrinho, ${badge.textContent} ${badge.textContent === "1" ? "item" : "itens"}`);
  }

  function addMenuLink(item, sub = false) {
    const row = document.createElement("li");
    if (sub) row.className = "dock-sub";
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.t;
    row.append(link);
    list.append(row);
  }

  function showMenu() {
    list.replaceChildren();
    for (const item of MENU) {
      addMenuLink(item);
      for (const sub of item.items || []) {
        if (sub.href !== item.href || sub.t !== item.t) addMenuLink(sub, true);
      }
    }
    if (!MENU.some(item => item.href === "#como-chegar")) addMenuLink({ href: "#como-chegar", t: "Como chegar" });
    menu.showModal();
    menu.scrollTop = 0;
    menuAction.setAttribute("aria-expanded", "true");
  }

  dock.addEventListener("click", event => {
    const action = event.target.closest("[data-dock]");
    if (!action) return;
    select(action);
    switch (action.dataset.dock) {
      case "buscar": search.focus(); break;
      case "ia": document.getElementById("iaOrb")?.click(); break;
      case "carrinho": cart.click(); break;
      case "menu": showMenu(); break;
    }
  });
  menu.addEventListener("click", event => {
    if (event.target.closest("a")) menu.close();
  });
  menu.addEventListener("close", () => {
    menuAction.setAttribute("aria-expanded", "false");
  });
  function updateLayout() {
    if (!mobile.matches && menu.open) menu.close();
    dock.hidden = !mobile.matches;
    document.documentElement.classList.toggle("dock-mobile", mobile.matches);
  }
  new MutationObserver(updateCount).observe(count, {
    attributes: true, attributeFilter: ["hidden"], childList: true, characterData: true, subtree: true
  });
  mobile.addEventListener("change", updateLayout);
  updateCount();
  updateLayout();
})();
