// ==========================================================
// notify.js — Trung tâm thông báo.
//  (1) notifyUser(): tạo thông báo WEB (chuông) + gửi EMAIL cùng lúc.
//  (2) notifyAllCustomers(): phát cho toàn bộ khách (dùng cho SALE).
//  (3) initNotificationCenter(): dựng chuông 🔔 trên header cho khách,
//      poll định kỳ, badge số chưa đọc, dropdown danh sách, đánh dấu đã đọc.
// ==========================================================
import { getUser } from "./storage.js";
import {
  createNotification, getNotifications, updateNotification, getUsers,
} from "./api.js";
import { sendEmail } from "./email.js";

const POLL_MS = 10000;
let pollTimer = null;
let me = null;
let notifs = [];

// ---------- Phát thông báo ----------

// Tạo 1 thông báo web + (tuỳ chọn) gửi email cho 1 user.
export async function notifyUser({ userId, email = null, title, body = "", type = "general", link = "", sendMail = true }) {
  const results = {};
  try {
    results.notification = await createNotification({
      userId: String(userId),
      title,
      body,
      type,
      link,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) { console.warn("[notify] tạo thông báo web lỗi:", err?.message); }

  if (sendMail && email) {
    try {
      results.mail = await sendEmail({
        to: email, toUserId: userId,
        subject: title,
        body: body || title,
        type,
      });
    } catch (err) { console.warn("[notify] gửi email lỗi:", err?.message); }
  }
  return results;
}

// Phát cho toàn bộ khách hàng (role user). Dùng khi có SALE.
export async function notifyAllCustomers({ title, body = "", type = "sale", link = "", sendMail = true }) {
  const users = await getUsers().catch(() => []);
  const customers = users.filter((u) => u.role === "user" && u.email);
  let count = 0;
  for (const u of customers) {
    await notifyUser({ userId: u.id, email: u.email, title, body, type, link, sendMail });
    count++;
  }
  return count;
}

// ---------- Chuông thông báo trên header ----------

export async function initNotificationCenter() {
  me = await getUser();
  if (!me || me.role !== "user") return; // chỉ khách mới có chuông

  const actions = document.querySelector(".header-actions");
  if (!actions || document.getElementById("notifBell")) return;

  const wrap = document.createElement("div");
  wrap.className = "notif";
  wrap.innerHTML = `
    <button class="notif__bell" id="notifBell" type="button" aria-label="Thông báo" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      <span class="notif__badge" id="notifBadge" hidden>0</span>
    </button>
    <div class="notif__panel" id="notifPanel" hidden>
      <div class="notif__head">
        <strong>Thông báo</strong>
        <button class="notif__readall" id="notifReadAll" type="button">Đánh dấu đã đọc</button>
      </div>
      <div class="notif__list" id="notifList"></div>
    </div>`;
  // Chèn trước vùng tài khoản để nằm cạnh giỏ hàng
  const account = actions.querySelector("[data-account]");
  if (account) actions.insertBefore(wrap, account);
  else actions.appendChild(wrap);

  document.getElementById("notifBell").addEventListener("click", togglePanel);
  document.getElementById("notifReadAll").addEventListener("click", markAllRead);
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("notifPanel");
    if (!panel || panel.hidden) return;
    if (!e.target.closest(".notif")) panel.hidden = true;
  });

  await refresh();
  startPolling();
}

async function refresh() {
  notifs = (await getNotifications(me.id).catch(() => []))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderList();
  updateBadge();
}

function updateBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const unread = notifs.filter((n) => !n.read).length;
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? "9+" : String(unread);
}

function renderList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  if (!notifs.length) {
    list.innerHTML = `<p class="notif__empty">Chưa có thông báo nào.</p>`;
    return;
  }
  list.innerHTML = notifs.slice(0, 30).map((n) => {
    const icon = ICONS[n.type] || ICONS.general;
    const when = timeAgo(n.createdAt);
    const inner = `
      <span class="notif__icon">${icon}</span>
      <span class="notif__text">
        <strong>${escapeHtml(n.title)}</strong>
        ${n.body ? `<small>${escapeHtml(n.body)}</small>` : ""}
        <time>${when}</time>
      </span>`;
    const cls = `notif__item ${n.read ? "" : "is-unread"}`;
    return n.link
      ? `<a class="${cls}" href="${escapeHtml(n.link)}" data-id="${escapeHtml(String(n.id))}">${inner}</a>`
      : `<div class="${cls}" data-id="${escapeHtml(String(n.id))}">${inner}</div>`;
  }).join("");
}

async function togglePanel() {
  const panel = document.getElementById("notifPanel");
  const bell = document.getElementById("notifBell");
  if (!panel) return;
  const open = panel.hidden;
  panel.hidden = !open;
  bell.setAttribute("aria-expanded", String(open));
  if (open) {
    await refresh();
    // mở panel = coi như đã đọc hết (sau 800ms để kịp thấy highlight)
    setTimeout(markAllRead, 800);
  }
}

async function markAllRead() {
  const unread = notifs.filter((n) => !n.read);
  if (!unread.length) return;
  await Promise.all(unread.map((n) => updateNotification(n.id, { read: true }).catch(() => {})));
  unread.forEach((n) => (n.read = true));
  renderList();
  updateBadge();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!me || document.hidden) return;
    const panelOpen = !document.getElementById("notifPanel")?.hidden;
    if (panelOpen) return; // đang mở thì không nháy
    await refresh();
  }, POLL_MS);
}

// ---------- Tiện ích ----------
const _icon = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  order: _icon('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
  invoice: _icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h2"/>'),
  wallet: _icon('<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M18 12h.01"/>'),
  stock: _icon('<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>'),
  sale: _icon('<path d="M15 5 5 15M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>'),
  general: _icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
