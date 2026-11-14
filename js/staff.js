// ==========================================================
// staff.js — Trang nghiệp vụ nhân viên.
// Quyền: xem thống kê ngắn hạn (ngày/tuần), cập nhật trạng thái đơn,
// cập nhật tồn kho. KHÔNG được thêm/xóa sản phẩm hay quản lý user/coupon.
// ==========================================================

import { requireRole, getUser } from "./storage.js";
import {
  getOrders, updateOrder, getProducts, updateProduct,
  getWalletTransactions, updateWalletTransaction, getUserById, updateUser, createAuditLog,
  getConversations, updateConversation, getMessages, createMessage,
  getStockAlerts, updateStockAlert,
} from "./api.js";
import { initPage, formatPrice, showToast, escapeHTML } from "./ui.js";
import { exportToExcel, exportToTxt, getOrdersInRange } from "./report.js";
import { sendEmail } from "./email.js";
import { notifyUser } from "./notify.js";
import { isCompletedSale } from "./sale.js";
import { performAction } from "./order-flow.js";
import { renderOrderManager, askInput, shopTodo } from "./order-ui.js";
import { liveWatch, DEFAULT_INTERVAL } from "./live.js";
import { attachMarker } from "./slide-marker.js";
import { slipCell, sproutPlugin, plotOptions, plotBars } from "./dash-kit.js";

// Ảnh CK do khách gửi: chỉ chấp nhận data:image/* để không chèn được URL/HTML lạ
function safeImageSrc(src) {
  return typeof src === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : "";
}
function proofThumb(src, fallbackHtml) {
  const safe = safeImageSrc(src);
  if (!safe) return fallbackHtml;
  return `<button type="button" class="pay-review__thumb" title="Bấm để phóng to"><img src="${safe}" alt="Ảnh chuyển khoản" data-proof-src></button>`;
}
// Chrome chặn mở URL data: ở tab mới (trang trắng) → xem ảnh ngay trong trang
function openProofLightbox(src) {
  document.getElementById("proofLightbox")?.remove();
  const box = document.createElement("div");
  box.id = "proofLightbox";
  box.className = "proof-lightbox";
  box.innerHTML = `
    <div class="proof-lightbox__inner" role="dialog" aria-label="Ảnh chuyển khoản">
      <button type="button" class="proof-lightbox__close" aria-label="Đóng">×</button>
      <img alt="Ảnh chuyển khoản phóng to">
    </div>`;
  box.querySelector("img").src = src;
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".proof-lightbox__close")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
}

let STAFF = null;
// Trạng thái chat (khai báo sớm vì loadChat được gọi ngay trong init block)
let activeConvoId = null;
let chatPollTimer = null;
// Biểu đồ ở trang tổng quan (khai báo ở đầu file vì loadDashboard chạy ngay lúc khởi động)
let staffChart = null;
let staffChartMode = "day";
let lastMsgCount = 0;
let lastConvos = [];

// Guard — chỉ nhân viên hoặc admin được vào (requireRole tự redirect nếu sai quyền)
if (await requireRole(["staff", "admin"])) {
  STAFF = await getUser();
  await initPage();
  initTabs();
  await loadDashboard();
  await loadPayments();
  await loadChat();
  await loadOrders();
  await loadStock();
  initExportButtons();
  startChatPolling();
  startBadgeWatch();
}

/* ---- Chuyển tab ---- */
function initTabs() {
  const tabs = document.querySelectorAll("[data-staff-tab]");
  // Dấu "thẻ đang mở" trượt từ thẻ cũ sang thẻ mới
  attachMarker(document.querySelector(".adm-tabs"), { item: ".adm-tab", isActive: (b) => b.getAttribute("aria-selected") === "true", hover: true });
  const panels = {
    dashboard: document.getElementById("panelDashboard"),
    payments: document.getElementById("panelPayments"),
    chat: document.getElementById("panelChat"),
    orders: document.getElementById("panelOrders"),
    stock: document.getElementById("panelStock"),
  };
  // Mở lại tab nào thì tải lại dữ liệu tab đó → số liệu/hàng chờ luôn mới, không bị cũ
  const refresh = { payments: loadPayments, orders: loadOrders, dashboard: loadDashboard, stock: loadStock };
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");
      const target = btn.dataset.staffTab;
      Object.entries(panels).forEach(([key, el]) => {
        if (el) el.hidden = key !== target;
      });
      const title = document.getElementById("admTitle");
      if (title) {
        title.textContent = btn.querySelector("span")?.textContent || "";
        title.dataset.no = String(Array.from(tabs).indexOf(btn) + 1).padStart(2, "0");
      }
      refresh[target]?.().catch((err) => console.warn("Tải lại tab lỗi:", err?.message));
    });
  });
}

/* ---- Ghi nhật ký thao tác nhân viên (minh bạch, chống gian lận) ---- */
async function logAction(action, detail) {
  try {
    await createAuditLog({
      staffId: String(STAFF.id),
      staffName: STAFF.name,
      action,
      detail,
      createdAt: new Date().toISOString(),
    });
  } catch (err) { console.warn("Ghi audit log lỗi:", err?.message); }
}

// Chữ ký hàng chờ duyệt: đổi khi có đơn/yêu cầu nạp mới, có ảnh bổ sung, hoặc đã được duyệt
function paymentQueueSignature(orders, txs) {
  const a = (orders || [])
    .filter((o) => o.paymentStatus === "awaiting_confirmation" && o.status === "pending")
    .map((o) => `${o.id}|${o.paymentProof ? 1 : 0}|${o.proofMissing ? 1 : 0}`);
  const b = (txs || []).filter((t) => t.type === "topup" && t.status === "pending").map((t) => `t${t.id}`);
  return [...a, ...b].sort().join("|#|");
}

// Số trên 2 nút tab ("Duyệt thanh toán", "Đơn hàng") phải nhảy ngay cả khi đang đứng ở tab khác,
// nên cập nhật nền; nội dung bảng thì đã có liveWatch của từng panel lo.
function startBadgeWatch() {
  const setBadge = (id, n) => {
    const el = document.getElementById(id);
    if (el) { el.hidden = n === 0; el.textContent = n; }
  };
  const tick = async () => {
    if (document.hidden) return;
    const [orders, txs] = await Promise.all([
      getOrders().catch(() => null), getWalletTransactions().catch(() => null),
    ]);
    if (!orders || !txs) return;
    setBadge("payBadge",
      orders.filter((o) => o.paymentStatus === "awaiting_confirmation" && o.status === "pending").length
      + txs.filter((t) => t.type === "topup" && t.status === "pending").length);
    setBadge("orderBadge", orders.filter(shopTodo).length);
  };
  setInterval(tick, DEFAULT_INTERVAL);
}

/* ---- Duyệt thanh toán QR + Nạp ví ---- */
async function loadPayments() {
  const panel = document.getElementById("panelPayments");
  const [orders, txs] = await Promise.all([
    getOrders().catch(() => []),
    getWalletTransactions().catch(() => []),
  ]);

  // Chỉ đơn còn đang chờ (khách hủy rồi thì chuyển sang mục "Cần hoàn tiền" ở tab Đơn hàng)
  const pendingOrders = orders.filter((o) => o.paymentStatus === "awaiting_confirmation" && o.status === "pending");
  const pendingTopups = txs.filter((t) => t.type === "topup" && t.status === "pending");

  // Badge tổng số việc chờ duyệt
  const badge = document.getElementById("payBadge");
  const total = pendingOrders.length + pendingTopups.length;
  if (badge) { badge.hidden = total === 0; badge.textContent = total; }

  const orderCards = pendingOrders.map((o) => `
    <div class="pay-review" data-order="${escapeHTML(String(o.id))}">
      <div class="pay-review__info">
        <strong>Đơn #${escapeHTML(String(o.id))}</strong> · ${formatPrice(o.total)}
        <div class="muted">Khách: ${escapeHTML(o.shipping?.name || String(o.userId))} · ND: ${escapeHTML(o.addInfo || "")}</div>
        <div class="muted">${new Date(o.createdAt).toLocaleString("vi-VN")}</div>
        <div class="muted">${(o.items || []).map((i) => `${escapeHTML(i.name)} ×${i.quantity}`).join(", ")}</div>
        ${o.shipping ? `<div class="order-ship">📍 ${escapeHTML(o.shipping.name || "")} · ${escapeHTML(o.shipping.phone || "")} — ${escapeHTML(o.shipping.address || "")}${o.shipping.note ? `<br><em>Ghi chú của khách: ${escapeHTML(o.shipping.note)}</em>` : ""}</div>` : ""}
      </div>
      <div class="pay-review__proof">
        ${proofThumb(o.paymentProof, o.proofMissing
          ? `<span class="pay-review__noproof">⚠ Khách báo <strong>quên chụp ảnh</strong> — đối soát sao kê ngân hàng theo nội dung <code>${escapeHTML(o.addInfo || "")}</code> và số tiền ${formatPrice(o.total)}</span>`
          : `<span class="muted">(Không có ảnh)</span>`)}
      </div>
      <div class="pay-review__actions">
        <button class="btn btn--primary btn--sm" data-confirm-order="${escapeHTML(String(o.id))}">✓ Xác nhận đã nhận tiền</button>
        <button class="btn btn--ghost btn--sm" data-reject-order="${escapeHTML(String(o.id))}">✗ Từ chối</button>
      </div>
    </div>`).join("");

  const topupCards = pendingTopups.map((t) => `
    <div class="pay-review" data-topup="${escapeHTML(String(t.id))}">
      <div class="pay-review__info">
        <strong>Nạp ví</strong> · ${formatPrice(t.amount)}
        <div class="muted">User: ${escapeHTML(String(t.userId))}</div>
        <div class="muted">${new Date(t.createdAt).toLocaleString("vi-VN")}</div>
      </div>
      <div class="pay-review__proof">
        ${proofThumb(t.proofImage, `<span class="muted">(Không có ảnh)</span>`)}
      </div>
      <div class="pay-review__actions">
        <button class="btn btn--primary btn--sm" data-confirm-topup="${escapeHTML(String(t.id))}">✓ Xác nhận cộng ví</button>
        <button class="btn btn--ghost btn--sm" data-reject-topup="${escapeHTML(String(t.id))}">✗ Từ chối</button>
      </div>
    </div>`).join("");

  panel.innerHTML = `
    <p class="muted">Kiểm tra ảnh chuyển khoản của khách rồi xác nhận. Mọi thao tác được ghi nhật ký (minh bạch).</p>
    <h3 class="dash-section-title">Đơn chờ xác nhận thanh toán (${pendingOrders.length})</h3>
    ${orderCards || `<p class="muted">Không có đơn nào chờ duyệt.</p>`}
    <h3 class="dash-section-title">Yêu cầu nạp ví chờ duyệt (${pendingTopups.length})</h3>
    ${topupCards || `<p class="muted">Không có yêu cầu nạp ví nào.</p>`}`;

  // Khách vừa chuyển khoản / gửi bổ sung ảnh → hàng chờ tự hiện, khỏi F5
  liveWatch(panel, {
    baseline: paymentQueueSignature(orders, txs),
    signature: async () => paymentQueueSignature(
      await getOrders().catch(() => []), await getWalletTransactions().catch(() => [])),
    onChange: () => loadPayments().catch(() => {}),
  });

  panel.querySelectorAll("[data-proof-src]").forEach((img) => {
    img.closest("button").addEventListener("click", () => openProofLightbox(img.src));
  });

  // Xác nhận đơn QR → paid + xuất hóa đơn + gửi email
  panel.querySelectorAll("[data-confirm-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.confirmOrder;
      const order = pendingOrders.find((o) => String(o.id) === id);
      if (!confirm(`Xác nhận đã nhận đủ tiền cho đơn #${id}?`)) return;
      try {
        // Qua luồng chung: kiểm tra lại trạng thái mới nhất, ghi lịch sử đơn + nhật ký, thông báo web
        await performAction(id, "approve_payment", STAFF, { sendMail: false });
        await emailInvoice(order); // email hóa đơn (thay cho email thông báo)
        showToast(`✓ Đã duyệt đơn #${id} + gửi email hóa đơn`);
        await loadPayments();
        await loadOrders(); // đồng bộ số ở tab Đơn hàng ngay (ô "Chờ duyệt thanh toán" về 0 khi hết việc)
      } catch (err) { showToast("Lỗi: " + err.message, { icon: "alert" }); }
    });
  });

  panel.querySelectorAll("[data-reject-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.rejectOrder;
      const reason = await askInput({ title: `Từ chối thanh toán đơn #${id}`, label: "Lý do từ chối (khách sẽ thấy)", required: true, confirmText: "Từ chối", danger: true });
      if (reason === null) return;
      try {
        // Qua luồng chung: hủy đơn, trả lại kho, ghi lịch sử + nhật ký, thông báo khách kèm lý do
        await performAction(id, "reject_payment", STAFF, { reason });
        showToast(`Đã từ chối đơn #${id}`);
        await loadPayments();
        await loadOrders();
      } catch (err) { showToast("Lỗi: " + err.message, { icon: "alert" }); }
    });
  });

  // Xác nhận nạp ví → cộng số dư
  panel.querySelectorAll("[data-confirm-topup]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.confirmTopup;
      const tx = pendingTopups.find((t) => String(t.id) === id);
      if (!confirm(`Xác nhận đã nhận ${formatPrice(tx.amount)} và cộng vào ví user ${tx.userId}?`)) return;
      try {
        const u = await getUserById(tx.userId);
        const newBalance = Number(u.walletBalance || 0) + Number(tx.amount);
        await updateUser(tx.userId, { walletBalance: newBalance });
        await updateWalletTransaction(id, {
          status: "confirmed", confirmedBy: String(STAFF.id), confirmedAt: new Date().toISOString(),
        });
        await logAction("confirm_topup", `Duyệt nạp ví ${formatPrice(tx.amount)} cho user ${tx.userId} (số dư mới ${formatPrice(newBalance)})`);
        try {
          await notifyUser({
            userId: tx.userId, email: u?.email,
            title: `Nạp ví thành công: +${formatPrice(tx.amount)}`,
            body: `Yêu cầu nạp ví của bạn đã được xác nhận. Số dư hiện tại: ${formatPrice(newBalance)}.`,
            type: "wallet", link: "profile.html",
          });
        } catch {}
        showToast(`✓ Đã cộng ${formatPrice(tx.amount)} vào ví user ${tx.userId}`);
        await loadPayments();
      } catch (err) { showToast("Lỗi: " + err.message, { icon: "alert" }); }
    });
  });

  panel.querySelectorAll("[data-reject-topup]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.rejectTopup;
      const reason = prompt("Lý do từ chối:", "Không tìm thấy giao dịch");
      if (reason === null) return;
      try {
        await updateWalletTransaction(id, { status: "rejected", note: reason });
        await logAction("reject_topup", `Từ chối nạp ví #${id}: ${reason}`);
        const tx = pendingTopups.find((t) => String(t.id) === id);
        if (tx?.userId) {
          try {
            const u = await getUserById(tx.userId).catch(() => null);
            await notifyUser({
              userId: tx.userId, email: u?.email,
              title: `Yêu cầu nạp ví ${formatPrice(tx.amount)} chưa được xác nhận`,
              body: `Shop chưa xác nhận được khoản nạp ${formatPrice(tx.amount)}. Lý do: ${reason}. Số dư ví không thay đổi — vui lòng nhắn shop nếu bạn đã chuyển khoản.`,
              type: "wallet", link: "profile.html",
            });
          } catch {}
        }
        showToast(`Đã từ chối nạp ví #${id}`);
        await loadPayments();
      } catch (err) { showToast("Lỗi: " + err.message, { icon: "alert" }); }
    });
  });
}

/* ---- Tin nhắn khách hàng (chat realtime) ---- */
async function loadChat() {
  const panel = document.getElementById("panelChat");
  // Khung cố định: list bên trái + main bên phải (chỉ dựng 1 lần)
  if (!panel.querySelector(".staff-chat")) {
    panel.innerHTML = `
      <div class="staff-chat">
        <div class="staff-chat__list" id="convoList"><p class="muted" style="padding:12px">Đang tải...</p></div>
        <div class="staff-chat__main" id="chatMain">
          <div class="staff-chat__empty">← Chọn một khách hàng để trả lời</div>
        </div>
      </div>`;
  }
  await refreshConvoList();
}

async function refreshConvoList() {
  const convos = (await getConversations().catch(() => []))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  lastConvos = convos;

  const totalUnread = convos.reduce((s, c) => s + (c.unreadForStaff || 0), 0);
  const badge = document.getElementById("chatBadge");
  if (badge) { badge.hidden = totalUnread === 0; badge.textContent = totalUnread; }

  const list = document.getElementById("convoList");
  if (!list) return;
  if (!convos.length) {
    list.innerHTML = `<p class="muted" style="padding:12px">Chưa có cuộc trò chuyện.</p>`;
    return;
  }
  list.innerHTML = convos.map((c) => `
    <div class="staff-convo ${c.id === activeConvoId ? "is-active" : ""}" data-convo="${escapeHTML(String(c.id))}">
      <div class="staff-convo__name">
        ${escapeHTML(c.customerName || "Khách " + c.customerId)}
        ${c.unreadForStaff ? `<span class="staff-convo__unread">${c.unreadForStaff}</span>` : ""}
      </div>
      <div class="staff-convo__last">${escapeHTML(c.lastMessage || "(chưa có tin)")}</div>
    </div>`).join("");

  list.querySelectorAll("[data-convo]").forEach((el) => {
    el.addEventListener("click", () => selectConvo(el.dataset.convo, lastConvos));
  });
}

async function selectConvo(convoId, convos) {
  activeConvoId = convoId;
  const convo = (convos || await getConversations().catch(() => [])).find((c) => c.id === convoId);
  if (!convo) return;

  document.querySelectorAll(".staff-convo").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.convo === convoId);
  });

  const msgs = (await getMessages(convoId).catch(() => []))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  lastMsgCount = msgs.length;

  const main = document.getElementById("chatMain");
  main.innerHTML = `
    <div class="staff-chat__msgs" id="staffMsgs">
      ${msgs.map((m) => {
        const staff = m.fromRole !== "user";
        return `<div class="chat-msg ${staff ? "chat-msg--me" : "chat-msg--them"}">
          ${!staff ? `<span class="chat-msg__who">${escapeHTML(m.fromName || "Khách")}</span>` : ""}
          <div class="chat-msg__bubble">${escapeHTML(m.text)}</div>
          <time>${new Date(m.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
        </div>`;
      }).join("") || `<div class="staff-chat__empty">Chưa có tin nhắn</div>`}
    </div>
    <form class="staff-chat__form" id="staffChatForm">
      <input type="text" id="staffChatInput" placeholder="Nhập trả lời..." autocomplete="off" maxlength="500">
      <button type="submit">Gửi</button>
    </form>`;

  const msgsBox = document.getElementById("staffMsgs");
  msgsBox.scrollTop = msgsBox.scrollHeight;

  // Đánh dấu đã đọc cho nhân viên
  if (convo.unreadForStaff) {
    try { await updateConversation(convoId, { unreadForStaff: 0 }); } catch {}
  }

  document.getElementById("staffChatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("staffChatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      await createMessage({
        conversationId: convoId,
        customerId: String(convo.customerId),
        fromRole: "staff",
        fromName: STAFF.name,
        text,
        createdAt: new Date().toISOString(),
      });
      await updateConversation(convoId, {
        lastMessage: text, lastRole: "staff", staffId: String(STAFF.id),
        unreadForCustomer: (convo.unreadForCustomer || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      await selectConvo(convoId);
    } catch (err) { showToast("Gửi lỗi: " + err.message, { icon: "alert" }); }
  });
}

function startChatPolling() {
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(async () => {
    if (document.hidden) return; // tab đang ẩn: khỏi hỏi máy chủ mỗi 2,5 giây
    const panelHidden = document.getElementById("panelChat")?.hidden;
    // Luôn cập nhật danh sách + badge
    await refreshConvoList();
    // Nếu đang xem 1 convo và có tin mới → nạp lại tin (không reset ô nhập đang gõ)
    if (activeConvoId && !panelHidden) {
      const input = document.getElementById("staffChatInput");
      const typing = input && input.value.trim().length > 0;
      if (!typing) {
        const msgs = await getMessages(activeConvoId).catch(() => []);
        if (msgs.length !== lastMsgCount) await selectConvo(activeConvoId, lastConvos);
      }
    }
  }, 2500);
}

// Gửi email hóa đơn (nội dung text) cho khách sau khi duyệt
async function emailInvoice(order) {
  try {
    const u = await getUserById(order.userId).catch(() => null);
    if (!u?.email) return;
    const lines = (order.items || []).map((i) => `- ${i.name} ×${i.quantity}: ${formatPrice(i.price * i.quantity)}`).join("\n");
    const body =
      `Xin chào ${u.name},\n\n` +
      `Đơn hàng #${order.id} của bạn đã được xác nhận thanh toán. Cảm ơn bạn!\n\n` +
      `Chi tiết:\n${lines}\n` +
      (order.shippingFee != null ? `Phí giao hàng: ${order.shippingFee ? formatPrice(order.shippingFee) : "Miễn phí"}\n` : "") +
      (order.discount ? `Giảm giá${order.couponCode ? " (" + order.couponCode + ")" : ""}: −${formatPrice(order.discount)}\n` : "") +
      `\nTổng cộng: ${formatPrice(order.total)}\n` +
      (order.shipping?.address ? `Giao đến: ${order.shipping.name || ""} · ${order.shipping.phone || ""} — ${order.shipping.address}\n` : "") +
      `\n` +
      `Bạn có thể tải hóa đơn PDF trong mục "Đơn hàng của tôi" trên website.\n\nLá & Sỏi`;
    await sendEmail({ to: u.email, toUserId: u.id, subject: `Hóa đơn đơn hàng #${order.id} — Lá & Sỏi`, body, type: "invoice" });
  } catch (err) { console.warn("Gửi email hóa đơn lỗi:", err?.message); }
}

// Báo "có hàng lại" cho mọi khách đã đăng ký (chưa được báo) về sản phẩm này.
async function notifyBackInStock(productId, productName) {
  try {
    const alerts = await getStockAlerts({ productId, notified: false }).catch(() => []);
    if (!alerts.length) return;
    for (const a of alerts) {
      const u = await getUserById(a.userId).catch(() => null);
      await notifyUser({
        userId: a.userId, email: u?.email,
        title: `"${productName}" đã có hàng trở lại!`,
        body: `Sản phẩm bạn quan tâm đã có hàng. Nhanh tay đặt mua trước khi hết nhé!`,
        type: "stock", link: `product-detail.html?id=${encodeURIComponent(productId)}`,
      });
      await updateStockAlert(a.id, { notified: true, notifiedAt: new Date().toISOString() }).catch(() => {});
    }
    showToast(`Đã báo "có hàng lại" cho ${alerts.length} khách`);
  } catch (err) { console.warn("[staff] notifyBackInStock lỗi:", err?.message); }
}

/* ---- Dashboard: hôm nay + tuần này ---- */
// Tổng quan của nhân viên, trình bày kiểu "sổ tay vườn ươm":
//   1. Một câu nói rõ còn bao nhiêu việc đang chờ + 3 PHIẾU VIỆC (thanh toán chờ duyệt, đơn cần xử lý,
//      tin nhắn chưa đọc) — bấm phiếu nào là tới đúng mục đó.
//   2. Phiếu số liệu: doanh thu / số đơn hôm nay và tuần này, mỗi ô ghi kèm số của hôm qua / tuần trước.
//   3. Một biểu đồ "luống" doanh thu, đổi được giữa "7 ngày" và "4 tuần".
async function loadDashboard() {
  const root = document.getElementById("staffDash");
  if (!root) return;
  const [allOrders, txs, convos] = await Promise.all([
    getOrders().catch(() => []),
    getWalletTransactions().catch(() => []),
    getConversations().catch(() => []),
  ]);
  const sold = allOrders.filter(isCompletedSale); // doanh thu = đơn đã thanh toán / đã giao

  const day = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
  const today = day(0), tomorrow = day(1), yesterday = day(-1);
  const weekStart = day(-today.getDay());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const sumTotal = (list) => list.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const between = (list, from, to) => list.filter((o) => { const d = new Date(o.createdAt); return d >= from && d < to; });
  const delta = (cur, prev, vs, money = false) => {
    const was = `${vs} ${money ? formatPrice(prev) : prev}`;
    if (!prev && !cur) return { text: `bằng ${vs}`, tone: "flat" };
    if (!prev) return { text: `${vs} chưa có`, tone: "up" };
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return { text: `${was} · không đổi`, tone: "flat" };
    return { text: `${was} · ${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, tone: pct > 0 ? "up" : "down" };
  };

  // ----- việc đang chờ -----
  const payWaiting = allOrders.filter((o) => o.paymentStatus === "awaiting_confirmation" && o.status === "pending").length
    + txs.filter((t) => t.type === "topup" && t.status === "pending").length;
  const orderWaiting = allOrders.filter(shopTodo).length;
  const chatWaiting = convos.reduce((n, c) => n + (Number(c.unreadForStaff) || 0), 0);
  const waiting = payWaiting + orderWaiting + chatWaiting;
  const task = (no, tab, label, n, hint) => `
    <li>
      <button type="button" class="stf-task${n ? " has-work" : ""}" data-goto-tab="${tab}">
        <span class="stf-task__no">Phiếu việc No. ${no}</span>
        <strong>${n}</strong>
        <span class="stf-task__label">${label}<small>${hint}</small></span>
        <em>${n ? "Mở mục này" : "Không có việc tồn"} <i aria-hidden="true">→</i></em>
      </button>
    </li>`;
  const parts = [
    payWaiting && `<b>${payWaiting}</b> thanh toán cần duyệt`,
    orderWaiting && `<b>${orderWaiting}</b> đơn cần xử lý`,
    chatWaiting && `<b>${chatWaiting}</b> tin nhắn chưa đọc`,
  ].filter(Boolean);
  const brief = waiting
    ? `Đang có <b>${waiting} việc</b> chờ bạn: ${parts.join(", ")}.`
    : "Không còn việc nào chờ bạn — vườn đang gọn gàng.";

  const tSold = between(sold, today, tomorrow), ySold = between(sold, yesterday, today);
  const wSold = between(sold, weekStart, weekEnd), lwSold = between(sold, lastWeekStart, weekStart);
  const tAll = between(allOrders, today, tomorrow).length, yAll = between(allOrders, yesterday, today).length;
  const wAll = between(allOrders, weekStart, weekEnd).length, lwAll = between(allOrders, lastWeekStart, weekStart).length;

  root.innerHTML = `
    <section class="dsh-brief" aria-label="Việc đang chờ">
      <p class="dsh-brief__main">${brief}</p>
      <p class="dsh-brief__vs">${waiting ? "Bấm vào phiếu để tới đúng mục cần làm." : "Có việc mới, phiếu bên dưới sẽ tự hiện số."}</p>
    </section>
    <ul class="stf-tasks">
      ${task("01", "payments", "Thanh toán chờ duyệt", payWaiting, "đơn chuyển khoản + yêu cầu nạp ví")}
      ${task("02", "orders", "Đơn cần xử lý", orderWaiting, "chờ giao, đang giao, khiếu nại, hoàn hàng, hoàn tiền")}
      ${task("03", "chat", "Tin nhắn chưa đọc", chatWaiting, "khách đang chờ trả lời")}
    </ul>

    <section class="slip" aria-label="Doanh thu và số đơn">
      <header class="slip__head"><span>Phiếu số liệu · hôm nay và tuần này</span><span>so với hôm qua / tuần trước</span></header>
      <div class="slip__cells slip__cells--4">
        ${slipCell(1, "Đã thu hôm nay", formatPrice(sumTotal(tSold)), delta(sumTotal(tSold), sumTotal(ySold), "hôm qua", true))}
        ${slipCell(2, "Đơn tạo hôm nay", tAll, delta(tAll, yAll, "hôm qua"), "đơn")}
        ${slipCell(3, "Đã thu tuần này", formatPrice(sumTotal(wSold)), delta(sumTotal(wSold), sumTotal(lwSold), "tuần trước", true))}
        ${slipCell(4, "Đơn tạo tuần này", wAll, delta(wAll, lwAll, "tuần trước"), "đơn")}
      </div>
    </section>

    <section class="dsh-plot stf-chart">
      <header class="dsh-plot__head">
        <h3>Luống doanh thu</h3>
        <div class="dsh-seg" role="group" aria-label="Khoảng thời gian của biểu đồ">
          <button type="button" data-chart-mode="day" class="${staffChartMode === "day" ? "is-active" : ""}">7 ngày</button>
          <button type="button" data-chart-mode="week" class="${staffChartMode === "week" ? "is-active" : ""}">4 tuần</button>
        </div>
      </header>
      <div class="dsh-plot__box"><canvas id="staffTrend"></canvas></div>
    </section>`;

  attachMarker(root.querySelector(".dsh-seg"), { item: "button", isActive: (b) => b.classList.contains("is-active"), key: "staff-chart" });
  root.querySelectorAll("[data-goto-tab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelector(`[data-staff-tab="${b.dataset.gotoTab}"]`)?.click();
  }));

  function drawChart() {
    staffChart?.destroy(); staffChart = null; // mở lại tab không còn lỗi "Canvas is already in use"
    if (typeof Chart === "undefined") { console.warn("Chart.js chưa nạp — bỏ qua biểu đồ."); return; }
    const labels = [], data = [];
    if (staffChartMode === "day") {
      for (let i = 6; i >= 0; i--) {
        const d = day(-i), next = day(-i + 1);
        data.push(sumTotal(between(sold, d, next)));
        labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      }
    } else {
      for (let i = 3; i >= 0; i--) {
        const ws = new Date(weekStart); ws.setDate(ws.getDate() - i * 7);
        const we = new Date(ws); we.setDate(we.getDate() + 7);
        data.push(sumTotal(between(sold, ws, we)));
        labels.push(`Tuần ${ws.getDate()}/${ws.getMonth() + 1}`);
      }
    }
    staffChart = new Chart(document.getElementById("staffTrend"), {
      type: "bar",
      data: { labels, datasets: [plotBars("Doanh thu", data)] },
      options: plotOptions(),
      plugins: [sproutPlugin],
    });
  }
  root.querySelectorAll("[data-chart-mode]").forEach((b) => b.addEventListener("click", () => {
    staffChartMode = b.dataset.chartMode;
    root.querySelectorAll("[data-chart-mode]").forEach((x) => x.classList.toggle("is-active", x === b));
    drawChart();
  }));
  drawChart();
}

/* ---- Đơn hàng: vòng đời giao hàng / hủy / hoàn hàng / hoàn tiền (js/order-flow.js) ---- */
async function loadOrders() {
  // paymentQueueTab: duyệt tiền chỉ làm ở tab "Duyệt thanh toán" (có ảnh CK) → không hiện lại nút ở đây
  await renderOrderManager(document.getElementById("panelOrders"), STAFF, {
    paymentQueueTab: "payments", badgeId: "orderBadge",
  });
}

/* ---- Tồn kho: chỉ cập nhật số lượng ---- */
async function loadStock() {
  const panel = document.getElementById("panelStock");
  const products = await getProducts().catch(() => []);

  const rows = products
    .map((p) => `
      <tr data-product-id="${escapeHTML(String(p.id))}">
        <td>#${escapeHTML(String(p.id))}</td>
        <td>${escapeHTML(p.name)}</td>
        <td>${formatPrice(p.price)}</td>
        <td><input type="number" min="0" value="${Number(p.stock) || 0}" class="stock-input" data-stock></td>
        <td><button class="btn btn--primary btn--sm" type="button" data-save-stock>Lưu</button></td>
      </tr>`)
    .join("");

  panel.innerHTML = `
    <p class="muted">Nhân viên chỉ được cập nhật số lượng tồn kho, không được thêm hoặc xóa sản phẩm.</p>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Mã</th><th>Tên</th><th>Giá</th><th>Tồn kho</th><th>Cập nhật</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  panel.querySelector("tbody").addEventListener("click", async (e) => {
    if (!e.target.closest("[data-save-stock]")) return;
    const row = e.target.closest("tr");
    const id = row.dataset.productId;
    const field = row.querySelector("[data-stock]");
    const raw = String(field.value).trim();
    // Chỉ nhận số nguyên ≥ 0 (ô trống, chữ, số âm, số lẻ → báo lỗi, không lưu)
    if (!/^\d+$/.test(raw) || Number(raw) > 100000) {
      showToast("Tồn kho phải là số nguyên từ 0 trở lên.", { icon: "alert" });
      field.focus();
      field.select?.();
      return;
    }
    const stock = Number(raw);
    const prod = products.find((p) => String(p.id) === String(id));
    const wasOut = Number(prod?.stock) <= 0;
    try {
      const oldStock = Number(prod?.stock) || 0;
      await updateProduct(id, { stock });
      await logAction("update_stock", `Tồn kho "${prod?.name || "#" + id}": ${oldStock} → ${stock}`);
      if (prod) prod.stock = stock; // cập nhật cache cục bộ
      // Có hàng lại: báo cho khách đã đăng ký "🔔 Báo khi có hàng"
      if (wasOut && stock > 0) {
        await notifyBackInStock(id, prod?.name || `Sản phẩm #${id}`);
      }
      showToast(`Đã cập nhật tồn kho sản phẩm #${id} → ${stock}`);
    } catch {
      showToast("Lỗi cập nhật tồn kho", { icon: "alert" });
    }
  });
}

/* ---- Nút xuất báo cáo ---- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function initExportButtons() {
  const bind = (id, fn) => document.getElementById(id)?.addEventListener("click", fn);

  bind("exportTodayExcel", async () => exportToExcel(await getOrdersInRange("day"), `DoanhThu_HomNay_${todayStr()}.xlsx`));
  bind("exportTodayTxt", async () => exportToTxt(await getOrdersInRange("day"), `DoanhThu_HomNay_${todayStr()}.txt`));
  bind("exportWeekExcel", async () => exportToExcel(await getOrdersInRange("week"), `DoanhThu_TuanNay_${todayStr()}.xlsx`));
  bind("exportWeekTxt", async () => exportToTxt(await getOrdersInRange("week"), `DoanhThu_TuanNay_${todayStr()}.txt`));
}
