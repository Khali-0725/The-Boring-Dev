/* Sidebar — recents list, per-chat rename/delete menu, clear-all, and drawer toggle. */

import { state, saveStore, STORE_KEY } from "./state.js";
import { dom } from "./dom.js";
import { openChat, newChat, deleteChat, titleFor } from "./chat.js";

/* ----- floating rename/delete popup (single shared node) ----- */
let menuChatId = null;
const chatMenu = document.createElement("div");
chatMenu.className = "chat-menu";
chatMenu.hidden = true;
chatMenu.style.display = "none";
chatMenu.innerHTML =
  '<button type="button" data-act="rename"><span class="material-symbols-outlined" style="font-size:16px;">edit</span>Rename</button>' +
  '<button type="button" data-act="delete" class="danger"><span class="material-symbols-outlined" style="font-size:16px;">delete</span>Delete</button>';
document.body.appendChild(chatMenu);

function openChatMenu(btn, id) {
  menuChatId = id;
  chatMenu.hidden = false;
  chatMenu.style.display = "flex";
  const r = btn.getBoundingClientRect();
  let left = r.right - (chatMenu.offsetWidth || 150);
  if (left < 8) left = 8;
  chatMenu.style.left = left + "px";
  chatMenu.style.top = (r.bottom + 6) + "px";
}
function closeChatMenu() {
  chatMenu.hidden = true;
  chatMenu.style.display = "none";
  menuChatId = null;
}
chatMenu.addEventListener("click", function (e) {
  const b = e.target.closest("button");
  if (!b) return;
  const act = b.getAttribute("data-act");
  const id = menuChatId;
  closeChatMenu();
  if (act === "rename") renameChat(id);
  else if (act === "delete") confirmDeleteChat(id);
});
document.addEventListener("click", function (e) {
  if (chatMenu.hidden) return;
  if (e.target.closest(".chat-menu") || e.target.closest(".recent-menu")) return;
  closeChatMenu();
});

function renameChat(id) {
  const c = state.chats.find((x) => x.id === id);
  if (!c) return;
  const next = window.prompt("Rename chat", c.title || "");
  if (next === null) return;
  const t = next.trim();
  c.title = t || titleFor(c);
  c.named = !!t;
  saveStore();
  renderRecents();
}
function confirmDeleteChat(id) {
  const c = state.chats.find((x) => x.id === id);
  const name = c && c.title ? c.title : "this chat";
  if (window.confirm('Delete "' + name + '"?\nThis can\'t be undone.')) deleteChat(id);
}

/* ----- recents list ----- */
export function renderRecents() {
  dom.recentsEl.innerHTML = "";
  const withMsgs = state.chats.filter((c) => c.messages.length > 0);
  if (!withMsgs.length) {
    const p = document.createElement("p");
    p.className = "recents-empty";
    p.textContent = "No chats yet.";
    dom.recentsEl.appendChild(p);
    return;
  }
  withMsgs.forEach(function (c) {
    const row = document.createElement("div");
    row.className = "recent" + (c.id === state.activeId ? " active" : "");

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.style.fontSize = "18px";
    icon.textContent = "chat_bubble";

    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = c.title || "New chat";

    const menu = document.createElement("button");
    menu.className = "recent-menu";
    menu.type = "button";
    menu.setAttribute("aria-label", "Chat options");
    menu.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">more_horiz</span>';

    row.appendChild(icon);
    row.appendChild(title);
    row.appendChild(menu);
    row.addEventListener("click", function (e) {
      if (e.target.closest(".recent-menu")) return;
      openChat(c.id);
      closeSidebarMobile();
    });
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!chatMenu.hidden && menuChatId === c.id) closeChatMenu();
      else openChatMenu(menu, c.id);
    });
    dom.recentsEl.appendChild(row);
  });
}

/* ----- drawer (mobile) ----- */
export function openSidebar() {
  dom.sidebar.classList.add("open");
  dom.backdrop.hidden = false;
  dom.menuBtn.setAttribute("aria-expanded", "true");
}
export function closeSidebarMobile() {
  dom.sidebar.classList.remove("open");
  dom.backdrop.hidden = true;
  dom.menuBtn.setAttribute("aria-expanded", "false");
}

/* ----- wire the static sidebar controls ----- */
export function initSidebar() {
  dom.menuBtn.addEventListener("click", function () {
    if (dom.sidebar.classList.contains("open")) closeSidebarMobile();
    else openSidebar();
  });
  dom.backdrop.addEventListener("click", closeSidebarMobile);
  dom.newChatBtn.addEventListener("click", newChat);

  if (dom.clearBtn) {
    dom.clearBtn.addEventListener("click", function () {
      if (!window.confirm("Are you sure?\nThis will delete ALL chats saved on this device. This can't be undone.")) return;
      state.chats = [];
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      closeChatMenu();
      newChat();
    });
  }
}
