// ==========================================================
// chat.js — Widget chat khách ↔ nhân viên (kiểu TikTok Shop).
// Realtime bằng cách poll json-server mỗi 2.5s (chạy được 2 tab).
// ==========================================================
import { getUser } from "./storage.js";
import {
  getConversationByCustomer, createConversation, updateConversation,
  getMessages, createMessage, getSettings,
} from "./api.js";

const POLL_MS = 2500;
let convo = null;
let lastCount = 0;
let pollTimer = null;
let user = null;
let shopName = "Lá & Sỏi";

export async function initCustomerChat() {
  user = await getUser();
  // Chỉ hiện cho khách hàng (role user). Admin/staff dùng trang riêng.
  if (!user || user.role !== "user") return;

  try { const s = await getSettings(); if (s?.shopName) shopName = s.shopName; } catch {}

  buildWidget();
}

function buildWidget() {
  if (document.getElementById("staffChatWidget")) return;
  const wrap = document.createElement("div");
  wrap.id = "staffChatWidget";
  wrap.innerHTML = `
    <button class="chat-fab" id="chatFab" aria-label="Nhắn tin với nhân viên">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <span class="chat-fab__label">Nhắn shop</span>
      <span class="chat-fab__badge" id="chatFabBadge" hidden>0</span>
    </button>
    <div class="chat-panel" id="scPanel" hidden>
      <div class="chat-panel__head">
        <div>
          <strong>${escapeHtml(shopName)}</strong>
          <small>Nhân viên thường trả lời trong vài phút</small>
        </div>
        <button class="chat-panel__close" id="scClose" aria-label="Đóng">×</button>
      </div>
      <div class="chat-panel__body" id="scBody"></div>
      <form class="chat-panel__input" id="scForm">
        <input type="text" id="scInput" placeholder="Nhập tin nhắn..." autocomplete="off" maxlength="500">
        <button type="submit" aria-label="Gửi">➤</button>
      </form>
    </div>`;
  document.body.appendChild(wrap);

  document.getElementById("chatFab").addEventListener("click", togglePanel);
  document.getElementById("scClose").addEventListener("click", closePanel);
  document.getElementById("scForm").addEventListener("submit", onSend);

  // Poll nền để cập nhật badge (kể cả khi panel đóng)
  startPolling();
}

async function ensureConversation() {
  if (convo) return convo;
  convo = await getConversationByCustomer(user.id).catch(() => null);
  if (!convo) {
    convo = await createConversation({
      customerId: String(user.id),
      customerName: user.name,
      staffId: "",
      lastMessage: "",
      lastRole: "",
      unreadForStaff: 0,
      unreadForCustomer: 0,
      updatedAt: new Date().toISOString(),
    });
  }
  return convo;
}

async function togglePanel() {
  const panel = document.getElementById("scPanel");
  if (panel.hidden) {
    panel.hidden = false;
    await ensureConversation();
    await loadMessages(true);
    // đánh dấu đã đọc cho khách
    if (convo) { try { await updateConversation(convo.id, { unreadForCustomer: 0 }); } catch {} }
    updateBadge(0);
    document.getElementById("scInput").focus();
  } else {
    closePanel();
  }
}

function closePanel() { document.getElementById("scPanel").hidden = true; }

async function loadMessages(scroll = false) {
  if (!convo) return;
  const msgs = (await getMessages(convo.id).catch(() => []))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  lastCount = msgs.length;
  const body = document.getElementById("scBody");
  if (!msgs.length) {
    body.innerHTML = `<div class="chat-empty">👋 Chào bạn! Nhân viên shop có thể giúp gì cho bạn?</div>`;
    return;
  }
  body.innerHTML = msgs.map((m) => {
    const mine = m.fromRole === "user";
    return `<div class="chat-msg ${mine ? "chat-msg--me" : "chat-msg--them"}">
      ${!mine ? `<span class="chat-msg__who">${escapeHtml(m.fromName || "Nhân viên")}</span>` : ""}
      <div class="chat-msg__bubble">${escapeHtml(m.text)}</div>
      <time>${new Date(m.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
    </div>`;
  }).join("");
  if (scroll) body.scrollTop = body.scrollHeight;
}

async function onSend(e) {
  e.preventDefault();
  const input = document.getElementById("scInput");
  const text = input.value.trim();
  if (!text) return;
  try {
    const c = await ensureConversation();
    if (!c || !c.id) { console.error("[chat] Không có conversation để gửi"); return; }
    input.value = "";
    await createMessage({
      conversationId: c.id,
      customerId: String(user.id),
      fromRole: "user",
      fromName: user.name,
      text,
      createdAt: new Date().toISOString(),
    });
    await updateConversation(c.id, {
      lastMessage: text, lastRole: "user",
      unreadForStaff: (c.unreadForStaff || 0) + 1,
      updatedAt: new Date().toISOString(),
    });
    c.unreadForStaff = (c.unreadForStaff || 0) + 1;
    await loadMessages(true);
  } catch (err) {
    console.error("[chat] Gửi tin nhắn lỗi:", err);
    input.value = text; // trả lại text để gửi lại
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!user || document.hidden) return; // tab đang ẩn thì thôi hỏi máy chủ; quay lại tab là lần sau tự cập nhật
    try {
      const c = await getConversationByCustomer(user.id).catch(() => null);
      if (!c) return;
      convo = { ...c };
      const panelOpen = !document.getElementById("scPanel").hidden;
      if (panelOpen) {
        const msgs = await getMessages(convo.id).catch(() => []);
        if (msgs.length !== lastCount) {
          await loadMessages(true);
          if (convo.unreadForCustomer) { try { await updateConversation(convo.id, { unreadForCustomer: 0 }); } catch {} }
          updateBadge(0);
        }
      } else {
        updateBadge(convo.unreadForCustomer || 0);
      }
    } catch {}
  }, POLL_MS);
}

function updateBadge(n) {
  const badge = document.getElementById("chatFabBadge");
  if (!badge) return;
  badge.hidden = !n;
  badge.textContent = n;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
