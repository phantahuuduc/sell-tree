// ==========================================================
// order-ui.js — Giao diện vòng đời đơn hàng (dùng chung khách / nhân viên / quản trị).
// ==========================================================
import { getOrders, getUsers, updateOrder, deleteOrder, createAuditLog } from "./api.js";
import { formatPrice, escapeHTML, showToast } from "./ui.js";
import {
  STATUS, PAYMENT, REFUND, availableActions, performAction, autoCompleteDelivered, returnDeadline, isPaid, deliveryEstimate,
  autoCompleteAt, loadDeliveryRules, estimateWindow, isDeliveryDay, toInputDate, deliveryBasisText,
} from "./order-flow.js";
import { liveWatch, ordersSignature } from "./live.js";

const chip = (meta, fallback) => meta ? `<span class="chip chip--${meta.tone}">${escapeHTML(meta.label)}</span>` : (fallback || "");
export const statusChip = (o) => chip(STATUS[o.status], `<span class="chip">${escapeHTML(o.status || "—")}</span>`);
export const paymentChip = (o) => chip(PAYMENT[o.paymentStatus] || PAYMENT.unpaid);
export const refundChip = (o) => o.refundStatus ? chip(REFUND[o.refundStatus]) : "";

const fmtTime = (iso) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
const ROLE_LABEL = { user: "Khách", staff: "Nhân viên", admin: "Quản trị", system: "Hệ thống" };

// Lịch sử đơn: ai làm gì lúc nào (minh bạch cho cả khách & shop)
export function timelineHtml(o) {
  const items = [{ label: "Đặt hàng", at: o.createdAt, by: { role: "user", name: "" } }, ...(o.timeline || [])];
  return `<ol class="order-timeline">${items.map((t) => `
    <li>
      <span class="order-timeline__dot" aria-hidden="true"></span>
      <div>
        <strong>${escapeHTML(t.label || STATUS[t.status]?.label || "")}</strong>
        <small>${fmtTime(t.at)} · ${escapeHTML(ROLE_LABEL[t.by?.role] || "")}${t.by?.name && t.by.role !== "user" ? ` ${escapeHTML(t.by.name)}` : ""}</small>
        ${t.reason ? `<p>Lý do: ${escapeHTML(t.reason)}</p>` : ""}
        ${t.note ? `<p>Ghi chú: ${escapeHTML(t.note)}</p>` : ""}
        ${t.refund ? `<p class="order-timeline__refund">Hoàn ${formatPrice(t.refund)} vào Ví web</p>` : ""}
      </div>
    </li>`).join("")}</ol>`;
}

// Hộp hỏi lý do / ghi chú (thay cho prompt())
// Lý do hay gặp — bấm để điền nhanh (vẫn sửa / viết thêm được)
const REASON_PICKS = {
  cancel: ["Tôi muốn đổi sang cây khác", "Đặt nhầm số lượng / kích thước", "Tìm được chỗ mua khác", "Không còn nhu cầu"],
  request_return: ["Cây bị hỏng / dập khi nhận", "Giao sai loại cây", "Cây không giống ảnh mô tả"],
  report_not_received: ["Chưa thấy shipper liên hệ", "Shipper báo đã giao nhưng tôi chưa nhận", "Sai địa chỉ giao hàng"],
  shop_cancel: ["Hết hàng, chưa nhập kịp", "Không liên lạc được với khách", "Khách yêu cầu hủy qua tin nhắn"],
  reject_payment: ["Chưa nhận được tiền chuyển khoản", "Số tiền chuyển không khớp", "Ảnh chuyển khoản không hợp lệ"],
  delivery_failed: ["Không liên lạc được người nhận", "Sai địa chỉ giao hàng", "Khách từ chối nhận hàng"],
};
const MIN_REASON = 5;

export function askInput({ title, label, required = false, confirmText = "Xác nhận", danger = false, picks = [] }) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "modal-overlay";
    box.innerHTML = `
      <form class="modal-box order-ask" novalidate>
        <h3>${escapeHTML(title)}</h3>
        ${label && picks.length ? `<div class="order-ask__picks">${picks.map((p) => `<button type="button" class="filter-chip" data-pick-reason>${escapeHTML(p)}</button>`).join("")}</div>` : ""}
        ${label ? `<label>${escapeHTML(label)}${required ? " *" : ""}<textarea rows="3" maxlength="300"></textarea></label>` : ""}
        <p class="order-ask__err" hidden>${required ? `Vui lòng ghi rõ lý do (ít nhất ${MIN_REASON} ký tự) hoặc chọn một lý do ở trên.` : "Vui lòng nhập nội dung."}</p>
        <div class="modal-box__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Quay lại</button>
          <button type="submit" class="btn btn--primary ${danger ? "btn--danger" : ""}">${escapeHTML(confirmText)}</button>
        </div>
      </form>`;
    const done = (v) => { box.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    box.addEventListener("click", (e) => {
      if (e.target === box || e.target.closest("[data-cancel]")) { done(null); return; }
      const pick = e.target.closest("[data-pick-reason]");
      if (pick) {
        const ta = box.querySelector("textarea");
        ta.value = pick.textContent;
        box.querySelectorAll("[data-pick-reason]").forEach((b) => b.classList.toggle("is-active", b === pick));
        box.querySelector(".order-ask__err").hidden = true;
        ta.focus();
      }
    });
    box.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const ta = box.querySelector("textarea");
      const v = ta ? ta.value.trim() : "";
      // Bắt buộc: phải có ít nhất MIN_REASON ký tự chữ/số (chặn kiểu "no.", "...", "a")
      if (required && v.replace(/[^\p{L}\p{N}]/gu, "").length < MIN_REASON) { box.querySelector(".order-ask__err").hidden = false; ta.focus(); return; }
      done(v);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(box);
    (box.querySelector("textarea") || box.querySelector("[type=submit]")).focus();
  });
}

// Hẹn giao của đơn (cho shop): đơn đã thanh toán / đang giao phải tới tay khách trước ngày nào
function dueHtml(o) {
  const dm = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Đã giao, chờ khách xác nhận: cho shop biết khi nào đơn tự hoàn tất
  const doneAt = autoCompleteAt(o);
  if (doneAt) {
    const hm = `${String(doneAt.getHours()).padStart(2, "0")}:${String(doneAt.getMinutes()).padStart(2, "0")}`;
    return `<small class="order-due">Khách chưa xác nhận · tự hoàn tất ${hm} ${dm(doneAt)}${o.receiveReminderAt ? " · đã nhắc khách" : ""}</small>`;
  }
  if (!["confirmed", "shipping"].includes(o.status)) return "";
  const eta = deliveryEstimate(o);
  if (!eta || !eta.to) return eta ? `<small class="order-due">${escapeHTML(eta.text)}</small>` : "";
  const day = dm(eta.to);
  const src = eta.basis === "shop" ? "đã hẹn khách" : "ước tính theo lịch";
  const text = eta.state === "late" ? `⚠ Trễ hẹn giao (${day}, ${src})`
    : o.outForDeliveryAt ? `🚚 Đã báo khách "sắp tới" · hẹn ${day}`
    : eta.basis === "shop" ? `📅 Đã hẹn khách giao ngày ${day}`
    : `Giao trước hết ngày ${day} (${src})`;
  return `<small class="order-due is-${eta.state}" title="${escapeHTML(eta.basis === "shop" ? "Ngày do nhân viên hẹn" : deliveryBasisText())}">${text}</small>`;
}

// Hộp chọn ngày hẹn giao: gợi ý sẵn ngày cuối của khoảng ước tính; ngày shop không giao (Chủ nhật / ngày nghỉ) báo trước
function askDeliveryDate(order, action) {
  return new Promise((resolve) => {
    const eta = deliveryEstimate(order);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const suggest = order.expectedDeliveryDate || toInputDate(eta?.to && eta.to >= today ? eta.to : estimateWindow().to);
    const box = document.createElement("div");
    box.className = "modal-overlay";
    box.innerHTML = `
      <form class="modal-box order-ask" novalidate>
        <h3>${escapeHTML(action.label)} — đơn #${escapeHTML(String(order.id))}</h3>
        ${eta && eta.basis !== "shop" && eta.from ? `<p class="order-ask__hint">Theo lịch làm việc: dự kiến ${escapeHTML(eta.text.replace(/^Dự kiến giao /, ""))}.</p>` : ""}
        <label>Ngày giao *<input type="date" required min="${toInputDate(today)}" value="${escapeHTML(suggest)}"></label>
        <p class="order-ask__hint" data-day-warn hidden>Ngày này shop không giao hàng (Chủ nhật / ngày nghỉ trong Cài đặt) — vẫn có thể hẹn nếu đã thỏa thuận với khách.</p>
        <label>${escapeHTML(action.ask || "Ghi chú")}<textarea rows="2" maxlength="200"></textarea></label>
        <p class="order-ask__err" hidden>Vui lòng chọn một ngày từ hôm nay trở đi.</p>
        <div class="modal-box__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Quay lại</button>
          <button type="submit" class="btn btn--primary">Lưu ngày hẹn</button>
        </div>
      </form>`;
    const input = box.querySelector("input[type=date]");
    const warn = box.querySelector("[data-day-warn]");
    const check = () => {
      const [y, m, d] = String(input.value).split("-").map(Number);
      warn.hidden = !(y && m && d) || isDeliveryDay(new Date(y, m - 1, d));
    };
    const done = (v) => { box.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("[data-cancel]")) done(null); });
    input.addEventListener("input", check);
    box.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value) || input.value < toInputDate(today)) {
        box.querySelector(".order-ask__err").hidden = false; input.focus(); return;
      }
      done({ date: input.value, note: box.querySelector("textarea").value.trim() });
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(box);
    check();
    input.focus();
  });
}

// Chạy 1 hành động: hỏi lý do/ghi chú hoặc xác nhận → gọi performAction → báo kết quả
export async function runAction(order, action, actor) {
  let reason = "", note = "", date = "";
  if (action.dateInput) {
    const v = await askDeliveryDate(order, action);
    if (!v) return false;
    date = v.date; note = v.note;
  } else if (action.reason || action.note) {
    const v = await askInput({
      title: `${action.label} — đơn #${order.id}`,
      label: action.ask || (action.reason ? "Lý do" : "Ghi chú"),
      required: !!action.reason,
      confirmText: action.label, danger: !!action.danger,
      picks: action.reason ? (REASON_PICKS[action.key] || []) : [],
    });
    if (v === null) return false;
    if (action.reason) reason = v; else note = v;
    if (action.confirm && (await askInput({ title: action.confirm(order), confirmText: "Đồng ý", danger: !!action.danger })) === null) return false;
  } else {
    const msg = action.confirm ? action.confirm(order) : `${action.label} cho đơn #${order.id}?`;
    if ((await askInput({ title: msg, confirmText: action.label, danger: !!action.danger })) === null) return false;
  }
  try {
    const { refund } = await performAction(order.id, action.key, actor, { reason, note, date });
    showToast(`✓ ${action.label}${refund ? ` — đã hoàn ${formatPrice(refund.amount)} vào ví` : ""}`);
    return true;
  } catch (err) {
    showToast(err.message, { icon: "alert" });
    return false;
  }
}

export function actionButtons(order, actor, { exclude = [] } = {}) {
  return availableActions(order, actor).filter((a) => !exclude.includes(a.key)).map((a) => `
    <button type="button" class="btn btn--sm ${a.primary ? "btn--primary" : a.danger ? "btn--danger-ghost" : "btn--ghost"}"
      data-order-action="${a.key}" data-order-id="${escapeHTML(String(order.id))}"
      ${a.disabled ? `disabled title="${escapeHTML(a.hint)}"` : ""}>${escapeHTML(a.label)}</button>`).join("");
}

// ---------- Bảng quản lý đơn cho nhân viên / quản trị ----------
// awaitingPay: đơn chuyển khoản khách đã báo đã trả, đang chờ shop đối chiếu (việc thật)
// staleUnpaid: đơn chưa chọn/chưa trả tiền, không ai phải duyệt → tách riêng để các ô "việc cần làm" về được 0
const awaitingPay = (o) => o.status === "pending" && o.paymentStatus === "awaiting_confirmation";
const staleUnpaid = (o) => o.status === "pending" && !awaitingPay(o) && !isPaid(o);
// Đơn shop đang phải làm tiếp (chuẩn bị / giao / khiếu nại / hoàn hàng / hoàn tiền) hoặc khách vừa cập nhật.
// Dùng chung cho badge tab "Đơn hàng" và ô "Đơn cần xử lý" ở trang Hôm nay → hai con số luôn khớp nhau.
// (Đơn chờ duyệt chuyển khoản tính riêng ở tab "Duyệt thanh toán".)
export const shopTodo = (o) => ["confirmed", "shipping", "delivery_issue", "return_requested", "return_approved"].includes(o.status)
  || o.refundStatus === "pending" || !!o.shopUnread;
const needsShop = (o) => ["confirmed", "shipping", "delivery_issue", "return_requested", "return_approved"].includes(o.status)
  || o.refundStatus === "pending" || awaitingPay(o) || !!o.shopUnread;

// [khóa, tên, điều kiện, là ô "việc cần làm"? (ô việc phải về 0 khi làm xong)]
const FILTERS = [
  ["todo", "Cần xử lý", needsShop, true],
  ["unread", "Khách vừa cập nhật", (o) => !!o.shopUnread, true],
  ["pending", "Chờ duyệt thanh toán", awaitingPay, true],
  ["confirmed", "Chờ giao", (o) => o.status === "confirmed", true],
  ["shipping", "Đang giao", (o) => o.status === "shipping", true],
  // Chờ khách xác nhận: shop không phải làm gì, đơn tự hoàn tất sau 3 ngày → không tính là việc tồn
  ["delivered", "Chờ khách xác nhận", (o) => o.status === "delivered", false],
  ["issue", "Khiếu nại giao hàng", (o) => o.status === "delivery_issue", true],
  ["returns", "Đang hoàn hàng", (o) => ["return_requested", "return_approved"].includes(o.status), true],
  ["refund", "Cần hoàn tiền", (o) => o.refundStatus === "pending", true],
  ["unpaid", "Chưa thanh toán", staleUnpaid, false],
  ["done", "Hoàn tất", (o) => o.status === "completed", false],
  ["closed", "Đã hủy / đã hoàn hàng", (o) => ["cancelled", "returned"].includes(o.status), false],
  ["all", "Tất cả", () => true, false],
];

// Đánh dấu đã đọc (bỏ cờ khách-vừa-cập-nhật) — dùng khi shop đã xem xong, không thao tác gì
async function markRead(ids) {
  await Promise.all(ids.map((id) => updateOrder(id, { shopUnread: false }).catch(() => {})));
}

// Chỉ được xóa đơn đã kết thúc (hoàn tất / đã hủy / đã hoàn hàng) hoặc đơn bỏ dở chưa thanh toán.
// Đơn đang chạy là chứng từ còn hiệu lực — không cho xóa để tránh mất dữ liệu của khách.
const canDelete = (o) => ["completed", "cancelled", "returned"].includes(o.status) || staleUnpaid(o);

// opts.paymentQueueTab: trang này có tab duyệt thanh toán riêng → KHÔNG hiện lại nút duyệt tiền ở đây
//                        (tránh xác nhận 2 lần), chỉ dẫn sang tab đó.
// opts.badgeId: id của ô badge trên nút tab để hiện số việc khách vừa cập nhật mà shop chưa đọc.
export async function renderOrderManager(panel, actor, opts = {}) {
  const { paymentQueueTab = "", badgeId = "" } = opts;
  const exclude = paymentQueueTab ? ["approve_payment", "reject_payment"] : [];
  let filter = panel.dataset.orderFilter || "todo";
  await loadDeliveryRules(); // lịch làm việc của shop (giờ chốt, ngày chuẩn bị / vận chuyển, ngày nghỉ)
  let orders = await getOrders().catch(() => []);
  if (await autoCompleteDelivered(orders)) orders = await getOrders().catch(() => orders);
  const users = await getUsers().catch(() => []);
  const userName = (id) => users.find((u) => String(u.id) === String(id))?.name || `#${id}`;
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const unread = orders.filter((o) => o.shopUnread);
  const badge = badgeId ? document.getElementById(badgeId) : null;
  // Trang không có tab "Duyệt thanh toán" riêng (quản trị) → đơn chờ duyệt tiền cũng là việc của tab này
  const todoCount = orders.filter((o) => shopTodo(o) || (!paymentQueueTab && awaitingPay(o))).length;
  if (badge) { badge.hidden = todoCount === 0; badge.textContent = todoCount; badge.title = `${todoCount} đơn cần xử lý`; }

  const reload = () => renderOrderManager(panel, actor, opts);
  const picked = new Set();   // id các đơn đang được tick để xóa hàng loạt

  // Khách thao tác (hủy đơn, yêu cầu hoàn hàng, báo chưa nhận…) → bảng tự cập nhật, khỏi F5.
  // Hoãn lại nếu đang tick chọn đơn để không mất lựa chọn đang làm dở.
  liveWatch(panel, {
    baseline: ordersSignature(orders),
    signature: async () => ordersSignature(await getOrders()),
    canRefresh: () => picked.size === 0,
    onChange: reload,
  });

  const draw = () => {
    panel.dataset.orderFilter = filter;
    const [, , test] = FILTERS.find((f) => f[0] === filter) || FILTERS[0];
    const shown = orders.filter(test);
    const chips = FILTERS.map(([k, label, t, isTodo]) => {
      const n = orders.filter(t).length;
      const cls = [
        "filter-chip",
        filter === k ? "is-active" : "",
        isTodo && n ? "filter-chip--alert" : "",
        isTodo && !n ? "filter-chip--clear" : "",
      ].filter(Boolean).join(" ");
      return `<button type="button" class="${cls}" data-filter="${k}">${label} <span class="filter-chip__n">${n}</span></button>`;
    }).join("");
    const deletable = shown.filter(canDelete);
    shown.forEach((o) => { if (!canDelete(o)) picked.delete(String(o.id)); });
    const sel = [...picked];

    const rows = shown.map((o) => {
      const id = String(o.id);
      const items = (o.items || []).map((i) => `${escapeHTML(i.name)} ×${i.quantity}`).join(", ");
      const payNote = awaitingPay(o) && paymentQueueTab
        ? `<button type="button" class="btn btn--sm btn--text" data-goto-pay>Duyệt ở tab “Duyệt thanh toán” ↗</button>`
        : "";
      const tick = canDelete(o)
        ? `<input type="checkbox" class="order-pick" data-pick="${escapeHTML(id)}" ${picked.has(id) ? "checked" : ""} aria-label="Chọn đơn #${escapeHTML(id)}">`
        : `<input type="checkbox" disabled title="Đơn đang xử lý — chỉ xóa được đơn đã kết thúc hoặc chưa thanh toán" aria-label="Không thể chọn">`;
      return `
        <tr data-order-row="${escapeHTML(id)}" class="${o.shopUnread ? "is-unread" : ""}${picked.has(id) ? " is-picked" : ""}">
          <td class="order-pick-cell">${tick}</td>
          <td>${o.shopUnread ? `<span class="order-new" title="Khách vừa cập nhật, shop chưa xem">MỚI</span> ` : ""}<strong>#${escapeHTML(String(o.id))}</strong><br><small class="muted">${fmtTime(o.createdAt)}</small></td>
          <td>${escapeHTML(userName(o.userId))}<br><small class="muted" title="${items}">${items.length > 60 ? items.slice(0, 60) + "…" : items}</small>
            ${o.shipping ? `<small class="order-ship" title="${escapeHTML(o.shipping.address || "")}">📍 ${escapeHTML(o.shipping.name || "")} · <a href="tel:${escapeHTML(o.shipping.phone || "")}">${escapeHTML(o.shipping.phone || "")}</a><br>${escapeHTML(o.shipping.address || "")}${o.shipping.note ? `<br><em>Ghi chú: ${escapeHTML(o.shipping.note)}</em>` : ""}</small>` : ""}</td>
          <td style="white-space:nowrap">${formatPrice(o.total)}</td>
          <td><div class="order-chips">${paymentChip(o)}${refundChip(o)}</div></td>
          <td><div class="order-chips">${statusChip(o)}</div>
            ${dueHtml(o)}
            ${o.shopUnread && o.shopUnreadLabel ? `<small class="order-new__what">Khách: ${escapeHTML(o.shopUnreadLabel)}${o.shopUnreadAt ? ` · ${fmtTime(o.shopUnreadAt)}` : ""}</small>` : ""}
            ${o.notReceivedReports > 1 ? `<small class="order-new__what">Khách đã báo chưa nhận ${o.notReceivedReports} lần</small>` : ""}
            ${payNote}</td>
          <td><div class="order-actions">${actionButtons(o, actor, { exclude }) || `<span class="muted">—</span>`}
            ${o.shopUnread ? `<button type="button" class="btn btn--sm btn--text" data-read-one="${escapeHTML(String(o.id))}">Đánh dấu đã đọc</button>` : ""}
            <button type="button" class="btn btn--sm btn--text" data-toggle-tl="${escapeHTML(String(o.id))}">Lịch sử</button></div></td>
        </tr>
        <tr class="order-tl-row" data-tl-for="${escapeHTML(String(o.id))}" hidden><td colspan="7">${timelineHtml(o)}</td></tr>`;
    }).join("");

    const allTicked = deletable.length > 0 && deletable.every((o) => picked.has(String(o.id)));
    const bulkBar = sel.length
      ? `<p class="order-bulk-bar">Đã chọn <strong>${sel.length}</strong> đơn
          <button type="button" class="btn btn--sm btn--danger-ghost" data-bulk-del>🗑 Xóa ${sel.length} đơn</button>
          <button type="button" class="btn btn--sm btn--text" data-bulk-clear>Bỏ chọn</button></p>`
      : "";

    panel.innerHTML = `
      <div class="filter-chips" style="margin-bottom:var(--sp-3)">${chips}</div>
      ${unread.length ? `<p class="order-unread-bar">🔔 <strong>${unread.length}</strong> đơn khách vừa cập nhật mà chưa xem
        <button type="button" class="btn btn--sm btn--ghost" data-read-all>Đánh dấu tất cả đã đọc</button></p>` : ""}
      ${bulkBar}
      <div class="admin-table-wrap">
        ${shown.length ? `<table class="admin-table order-table">
          <thead><tr>
            <th class="order-pick-cell"><input type="checkbox" data-pick-all ${allTicked ? "checked" : ""}
              ${deletable.length ? "" : "disabled"} title="Chọn tất cả đơn có thể xóa trong mục này" aria-label="Chọn tất cả"></th>
            <th>Đơn</th><th>Khách & sản phẩm</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>${rows}</tbody></table>` : `<p class="muted">Không có đơn nào ở mục này.${FILTERS.find((f) => f[0] === filter)?.[3] ? " 🎉 Việc ở mục này đã xử lý xong." : ""}</p>`}
      </div>
      <p class="muted" style="margin-top:8px;font-size:.85rem">Mọi thao tác được ghi vào lịch sử đơn và nhật ký nhân viên; khách nhận thông báo + email. Hoàn tiền luôn vào Ví web của khách.</p>`;

    panel.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      filter = b.dataset.filter; picked.clear(); draw();
    }));

    // ----- Chọn nhiều đơn để xóa một lượt -----
    panel.querySelectorAll("[data-pick]").forEach((cb) => cb.addEventListener("change", () => {
      if (cb.checked) picked.add(cb.dataset.pick); else picked.delete(cb.dataset.pick);
      draw();
    }));
    panel.querySelector("[data-pick-all]")?.addEventListener("change", (e) => {
      if (e.target.checked) deletable.forEach((o) => picked.add(String(o.id)));
      else deletable.forEach((o) => picked.delete(String(o.id)));
      draw();
    });
    panel.querySelector("[data-bulk-clear]")?.addEventListener("click", () => { picked.clear(); draw(); });
    panel.querySelector("[data-bulk-del]")?.addEventListener("click", async (e) => {
      const list = sel.map((id) => orders.find((o) => String(o.id) === id)).filter(Boolean);
      const ok = await askInput({
        title: `Xóa vĩnh viễn ${list.length} đơn (#${list.slice(0, 5).map((o) => o.id).join(", #")}${list.length > 5 ? "…" : ""})? Không thể hoàn tác.`,
        confirmText: `Xóa ${list.length} đơn`, danger: true,
      });
      if (ok === null) return;
      e.target.disabled = true;
      let done = 0;
      for (const o of list) {
        try { await deleteOrder(o.id); done++; } catch { /* bỏ qua đơn lỗi, báo số thực tế */ }
      }
      createAuditLog({
        staffId: String(actor?.id || ""), staffName: actor?.name || "", action: "orders_bulk_delete",
        detail: `Xóa ${done} đơn đã kết thúc: #${list.slice(0, 20).map((o) => o.id).join(", #")}`,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
      showToast(done === list.length ? `✓ Đã xóa ${done} đơn` : `Đã xóa ${done}/${list.length} đơn`, done ? {} : { icon: "alert" });
      picked.clear();
      await reload();
    });

    panel.querySelectorAll("[data-toggle-tl]").forEach((b) => b.addEventListener("click", () => {
      const row = panel.querySelector(`[data-tl-for="${CSS.escape(b.dataset.toggleTl)}"]`);
      row.hidden = !row.hidden;
    }));
    panel.querySelectorAll("[data-goto-pay]").forEach((b) => b.addEventListener("click", () => {
      document.querySelector(`[data-staff-tab="${paymentQueueTab}"], [data-admin-tab="${paymentQueueTab}"]`)?.click();
    }));
    panel.querySelector("[data-read-all]")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      await markRead(unread.map((o) => o.id));
      await reload();
    });
    panel.querySelectorAll("[data-read-one]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      await markRead([b.dataset.readOne]);
      await reload();
    }));
    panel.querySelectorAll("[data-order-action]").forEach((b) => b.addEventListener("click", async () => {
      const o = orders.find((x) => String(x.id) === b.dataset.orderId);
      const a = availableActions(o, actor).find((x) => x.key === b.dataset.orderAction);
      if (!o || !a) return;
      b.disabled = true;
      if (await runAction(o, a, actor)) await reload();
      else b.disabled = false;
    }));
  };
  draw();
}

// Cho trang khách: thời hạn hoàn hàng còn lại
export function returnInfo(o) {
  const d = returnDeadline(o);
  if (!d || !["delivered", "completed"].includes(o.status)) return "";
  const left = Math.ceil((d - Date.now()) / (24 * 60 * 60 * 1000));
  return left > 0 ? `Có thể yêu cầu hoàn hàng trong ${left} ngày nữa (đến ${d.toLocaleDateString("vi-VN")}).` : "";
}
export { isPaid };
