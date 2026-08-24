/* Shared, mutable app state + the device-local chat store. */

export const STORE_KEY = "bd-chats";

export const state = {
  started: false,
  history: [],       // active conversation: [{role, content}] (points at active chat's messages)
  pendingImage: null, // data-URL of an attached image, or null
  chats: [],          // [{id, title, messages, updatedAt, named?}]
  activeId: null,
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    state.chats = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.chats)) state.chats = [];
  } catch (e) {
    state.chats = [];
  }
}

export function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.chats));
  } catch (e) {}
}

export function activeChat() {
  return state.chats.find((c) => c.id === state.activeId) || null;
}
