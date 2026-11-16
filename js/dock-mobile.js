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
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

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

  function menuLink(item, icon) {
    const link = document.createElement("a");
    link.href = item.href;
    if (icon) {
      const graphic = document.createElement("span");
      graphic.className = "dock-category-icon";
      graphic.setAttribute("aria-hidden", "true");
      graphic.innerHTML = ic(menuIcon(item));
      link.append(graphic);
    }
    link.append(document.createTextNode(item.t));
    return link;
  }

  function showMenu() {
    list.replaceChildren();
    const categories = MENU.filter(item => item.href !== "#em-alta");
    if (!categories.some(item => item.href === "#como-chegar")) {
      categories.push({ href: "#como-chegar", t: "Como chegar" });
    }
    const subcategories = document.createElement("div");
    subcategories.className = "dock-sub-links";
    for (const item of categories) {
      const row = document.createElement("li");
      row.append(menuLink(item, true));
      list.append(row);
      for (const sub of item.items || []) {
        if (sub.href !== item.href || sub.t !== item.t) subcategories.append(menuLink(sub));
      }
    }
    if (subcategories.childElementCount) {
      const row = document.createElement("li");
      row.className = "dock-subcategories";
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Subcategorias";
      details.append(summary, subcategories);
      row.append(details);
      list.append(row);
    }
    menu.showModal();
    list.scrollTop = 0;
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
  async function closeMenu(destination) {
    if (!menu.open || menu.hasAttribute("data-closing")) return;
    menu.setAttribute("data-closing", "");
    if (!reduceMotion.matches && menu.animate) {
      const exit = menu.animate([
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(36px)", opacity: 0 }
      ], { duration: 200, easing: "ease-in", fill: "forwards" });
      await exit.finished.catch(() => {});
      exit.cancel();
    }
    if (!menu.open) return;
    menu.close();
    if (destination) irParaSecao(destination);
  }
  menu.addEventListener("submit", event => {
    event.preventDefault();
    closeMenu();
  });
  menu.addEventListener("cancel", event => {
    event.preventDefault();
    closeMenu();
  });
  menu.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(link.hash.slice(1));
      return;
    }
    if (event.target !== menu) return;
    const { left, right, top, bottom } = menu.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) closeMenu();
  });
  menu.addEventListener("close", () => {
    menu.removeAttribute("data-closing");
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
