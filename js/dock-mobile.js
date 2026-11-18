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

  let expanded = null, closing = false, sheetMotion = null, savedPage = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

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

  function destinations(item) {
    const children = (item.items || []).filter(sub => sub.href && document.getElementById(sub.href.slice(1)));
    if (children.length) return children.map(sub => ({
      t: sub.t, href: caminhoDaSubsecao(sub.href.slice(1)), section: sub.href.slice(1)
    }));
    const id = item.href.slice(1);
    const section = SECOES.find(section => section.id === id);
    if (section && !section.sub) {
      const subs = subsOf(id).filter(sub => sub.n > 0 && sub.t);
      if (subs.length > 1) return subs.map(sub => ({
        t: sub.t, href: caminhoDaSubsecao(id, sub.go.split("|")[1]),
        section: id, sub: sub.go.split("|")[1]
      }));
    }
    return [];
  }

  function destinationLink(item, icon) {
    const link = menuLink(item, icon);
    link.dataset.menuSection = item.section;
    if (item.sub !== undefined) link.dataset.menuSub = item.sub;
    return link;
  }

  function lockPage() {
    savedPage = { y: scrollY, top: document.body.style.top };
    document.body.style.top = `-${savedPage.y}px`;
    document.documentElement.classList.add("is-locked", "dock-menu-lock");
  }

  function unlockPage() {
    if (!savedPage) return;
    const saved = savedPage;
    savedPage = null;
    document.documentElement.classList.remove("is-locked", "dock-menu-lock");
    document.body.style.top = saved.top;
    const root = document.documentElement, behavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, saved.y);
    root.style.scrollBehavior = behavior;
  }

  function toggleGroup(button) {
    const wasOpen = button.getAttribute("aria-expanded") === "true";
    if (expanded) animateGroup(expanded, false);
    expanded = wasOpen ? null : button;
    if (!expanded) return;
    animateGroup(button, true);
    // Keep the opened heading visible without moving the page behind the dialog.
    const distance = button.getBoundingClientRect().top - list.getBoundingClientRect().top;
    if (distance < 0) list.scrollTop += distance;
  }

  function animateGroup(button, open) {
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    const from = panel.hidden ? 0 : panel.getBoundingClientRect().height;
    panel.getAnimations().forEach(animation => animation.cancel());
    button.setAttribute("aria-expanded", String(open));
    panel.inert = !open;
    panel.setAttribute("aria-hidden", String(!open));
    if (reduced.matches) { panel.hidden = !open; return; }
    panel.hidden = false;
    const animation = panel.animate(
      [{ height: from + "px", opacity: open ? 0 : 1 },
        { height: open ? panel.scrollHeight + "px" : "0px", opacity: open ? 1 : 0 }],
      { duration: 180, easing: "cubic-bezier(.2, .7, .3, 1)", fill: "forwards" }
    );
    animation.finished.then(() => {
      panel.hidden = button.getAttribute("aria-expanded") !== "true";
      animation.cancel();
    }).catch(() => {});
  }

  function foldedTransform() {
    const sheet = menu.getBoundingClientRect(), target = menuAction.getBoundingClientRect();
    return `translate(${target.left + target.width / 2 - sheet.left - sheet.width / 2}px, ${target.top + target.height / 2 - sheet.top - sheet.height / 2}px) scale(${target.width / sheet.width}, ${target.height / sheet.height})`;
  }

  function closeMenu(navigate) {
    if (!menu.open || closing) return;
    closing = true;
    sheetMotion?.cancel();
    menu.classList.remove("is-opening");
    menu.classList.add("is-closing");
    menu.inert = true;
    const finish = () => {
      sheetMotion?.cancel();
      sheetMotion = null;
      menu.close();
      unlockPage();
      menu.inert = false;
      menu.classList.remove("is-closing", "is-opening");
      closing = false;
      menuAction.setAttribute("aria-expanded", "false");
      menuAction.focus({ preventScroll: true });
      if (navigate) navigate();
    };
    if (reduced.matches) return finish();
    sheetMotion = menu.animate(
      [{ transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: foldedTransform(), opacity: 0 }],
      { duration: 220, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
    );
    sheetMotion.finished.then(finish).catch(() => {});
  }

  function showMenu() {
    if (!mobile.matches || menu.open || document.documentElement.classList.contains("is-locked") ||
        document.querySelector("#age.on, .veil.on, .ia[data-state=open]")) return;
    list.replaceChildren();
    expanded = null;
    const categories = MENU.filter(item => item.href !== "#em-alta");
    if (!categories.some(item => item.href === "#como-chegar")) {
      categories.push({ href: "#como-chegar", t: "Como chegar" });
    }
    for (const [index, item] of categories.entries()) {
      const row = document.createElement("li");
      const id = item.href.slice(1), subs = destinations(item);
      const all = { ...item, href: caminhoDaSecao(id), section: id, sub: "" };
      if (subs.length) {
        const heading = document.createElement("h3");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dock-category-toggle";
        button.id = `dock-category-${index}`;
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", `dock-group-${index}`);
        const content = menuLink(item, true);
        button.append(...content.childNodes);
        heading.append(button);
        const panel = document.createElement("div");
        panel.id = `dock-group-${index}`;
        panel.className = "dock-category-panel";
        panel.setAttribute("role", "group");
        panel.setAttribute("aria-labelledby", button.id);
        panel.hidden = true;
        panel.inert = true;
        panel.setAttribute("aria-hidden", "true");
        const links = document.createElement("ul");
        for (const sub of [{ ...all, t: "Ver todos", all: true }, ...subs]) {
          const child = document.createElement("li"), link = destinationLink(sub);
          if (sub.all) link.className = "dock-menu-all";
          child.append(link);
          links.append(child);
        }
        panel.append(links);
        row.append(heading, panel);
      } else {
        const link = destinationLink(all, true);
        link.href = caminhoDaSubsecao(id);
        row.append(link);
      }
      list.append(row);
    }
    lockPage();
    menu.showModal();
    list.scrollTop = 0;
    menuAction.setAttribute("aria-expanded", "true");
    if (!reduced.matches) {
      menu.classList.add("is-opening");
      sheetMotion = menu.animate(
        [{ transform: foldedTransform(), opacity: 0 },
          { transform: "translate(0, 0) scale(1.008)", opacity: 1, offset: .86 },
          { transform: "translate(0, 0) scale(1)", opacity: 1 }],
        { duration: 240, easing: "cubic-bezier(.2, .75, .25, 1)" }
      );
      sheetMotion.finished.then(() => menu.classList.remove("is-opening")).catch(() => {});
    }
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
    if (closing) return;
    const toggle = event.target.closest(".dock-category-toggle");
    if (toggle) { toggleGroup(toggle); return; }
    if (event.target.closest("[data-menu-close]")) { closeMenu(); return; }
    const link = event.target.closest("a[data-menu-section]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    const id = link.dataset.menuSection, sub = link.dataset.menuSub;
    closeMenu(() => {
      if (sub !== undefined) aplicarFiltroSubsecao(id, sub);
      if (irParaSecao(id)) {
        select(actions[0]);
        setUrl(link.getAttribute("href"));
      }
    });
  });
  let outside = false;
  const isOutside = event => {
    const rect = menu.getBoundingClientRect();
    return event.target === menu && (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom);
  };
  menu.addEventListener("pointerdown", event => { outside = isOutside(event); });
  menu.addEventListener("click", event => { if (outside && isOutside(event)) closeMenu(); outside = false; });
  menu.addEventListener("cancel", event => { event.preventDefault(); closeMenu(); });
  menu.addEventListener("close", () => {
    if (menu.open) return;
    unlockPage();
    menuAction.setAttribute("aria-expanded", "false");
  });
  function updateLayout() {
    if (!mobile.matches && menu.open) {
      sheetMotion?.cancel();
      menu.close();
      unlockPage();
      menu.inert = false;
      menu.classList.remove("is-closing", "is-opening");
      closing = false;
    }
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
