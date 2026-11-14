// ==========================================================
// orders.js — "Đơn hàng của tôi": trạng thái + tải hóa đơn khi đã thanh toán.
// ==========================================================
import { getUser } from "./storage.js";
import { getOrdersByUser, updateOrder, getReviews, createReview } from "./api.js";
import { initPage, formatPrice, escapeHTML, showToast, compressImageToDataURL } from "./ui.js";
import {
  availableActions, autoCompleteDelivered, deliveryEstimate, deliveryBasisText, autoCompleteAt, loadDeliveryRules,
  deliveryRules, returnDeadline,
} from "./order-flow.js";
import { liveWatch, ordersSignature } from "./live.js";
import { statusChip, paymentChip, refundChip, timelineHtml, actionButtons, runAction, returnInfo } from "./order-ui.js";

await initPage();

const box = document.getElementById("ordersList");
const user = await getUser();

if (!user) {
  sessionStorage.setItem("redirectAfterLogin", window.location.href);
  window.location.href = "login.html";
} else {
  renderOrders();
  import("./chat.js").then((m) => m.initCustomerChat()).catch(() => {});
}

const fmt = (iso) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// "còn 1 ngày 5 giờ" / "còn 3 giờ" / "còn 20 phút"
function timeLeft(at) {
  const ms = at - Date.now();
  if (ms <= 0) return "sắp tới";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.max(1, Math.floor((ms % 3600000) / 60000));
  return d ? `còn ${d} ngày${h ? ` ${h} giờ` : ""}` : h ? `còn ${h} giờ` : `còn ${m} phút`;
}

// Lời nhắn theo từng trạng thái — khách luôn biết đơn đang ở đâu và cần làm gì
function stageNote(o) {
  const n = (html, tone = "") => `<p class="order-card__note ${tone}">${html}</p>`;
  if (o.status === "pending" && o.paymentStatus === "awaiting_confirmation") {
    return o.paymentProof
      ? n("⏳ Đơn đang chờ nhân viên kiểm tra ảnh chuyển khoản. Hóa đơn sẽ được gửi qua email sau khi duyệt.")
      : n(`⏳ Bạn chưa gửi ảnh chuyển khoản — nhân viên sẽ đối soát theo nội dung <strong>${escapeHTML(o.addInfo || "")}</strong>. Bổ sung ảnh để được duyệt nhanh hơn.`) +
        `<label class="btn btn--ghost btn--sm" style="cursor:pointer">📁 Bổ sung ảnh chuyển khoản
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-add-proof="${escapeHTML(String(o.id))}" hidden>
        </label>`;
  }
  switch (o.status) {
    case "confirmed": return n("📦 Shop đang chuẩn bị hàng. Bạn vẫn có thể hủy đơn trước khi shop giao cho vận chuyển.");
    case "shipping": return n(`🚚 Đơn đang trên đường giao${o.shippingNote ? ` — ${escapeHTML(o.shippingNote)}` : ""}.`);
    case "delivered": {
      const at = autoCompleteAt(o);
      return n(`✅ Shop đã giao${o.deliveredAt ? ` lúc ${fmt(o.deliveredAt)}` : ""}${o.deliveryNote ? ` (${escapeHTML(o.deliveryNote)})` : ""}. Vui lòng bấm <strong>Đã nhận được hàng</strong>, hoặc <strong>Chưa nhận được hàng</strong> nếu chưa thấy hàng.`
        + (at ? `<br><small>Nếu bạn không phản hồi, đơn tự chuyển sang <strong>Hoàn tất</strong> lúc ${fmt(at.toISOString())} (${timeLeft(at)}). Sau đó bạn vẫn có thể báo chưa nhận hoặc yêu cầu hoàn hàng tới hết hạn đổi trả.</small>` : ""));
    }
    case "delivery_issue": {
      const last = (o.timeline || []).filter((t) => ["mark_delivered", "ship"].includes(t.action)).pop();
      const verified = last?.action === "mark_delivered" && last.by?.role !== "user";
      return n(`⚠ Bạn đã báo chưa nhận được hàng${o.notReceivedReports > 1 ? ` (${o.notReceivedReports} lần)` : ""}. Shop đang xác minh với đơn vị vận chuyển.`
        + (verified ? ` Shop đã xác minh đơn được giao${last.note ? ` — ${escapeHTML(last.note)}` : ""}.` : "")
        + ` Nếu vẫn chưa nhận được, bấm <strong>Vẫn chưa nhận được hàng</strong> — shop sẽ giao lại hoặc hủy đơn và hoàn tiền cho bạn.`, "is-warn");
    }
    case "completed": {
      const r = returnInfo(o);
      const dl = returnDeadline(o);
      const auto = o.receivedConfirmedBy === "system" && dl && new Date() <= dl
        ? n(`ℹ Đơn được <strong>tự hoàn tất</strong> vì bạn chưa phản hồi sau ${deliveryRules().autoCompleteDays} ngày kể từ khi shop giao. Nếu thực tế bạn chưa nhận được hàng, bấm <strong>Chưa nhận được hàng</strong> trước ${fmt(dl.toISOString())}.`)
        : "";
      return auto + (r ? n(`↩ ${r}`) : "");
    }
    case "return_requested": return n(`↩ Đã gửi yêu cầu hoàn hàng${o.returnReason ? ` (${escapeHTML(o.returnReason)})` : ""}. Chờ shop duyệt.`);
    case "return_approved": {
      const guide = (o.timeline || []).filter((t) => t.action === "approve_return").pop()?.note;
      return n(`↩ Shop đã duyệt hoàn hàng. Vui lòng gửi trả hàng${guide ? `: ${escapeHTML(guide)}` : ""}. Tiền được hoàn vào Ví web khi shop nhận lại hàng.`);
    }
    case "returned": return "";
    case "cancelled":
      return n(`✗ Đơn đã hủy${o.cancelReason || o.rejectReason ? `: ${escapeHTML(o.cancelReason || o.rejectReason)}` : ""}.`, "is-error");
    default: return "";
  }
}

// ---------- Đánh giá sao + bình luận sau khi nhận hàng ----------
let myReviews = [];   // đánh giá của chính khách này (nạp lại mỗi lần vẽ)
// Chỉ đánh giá được khi khách ĐÃ xác nhận nhận hàng (hoặc đơn tự hoàn tất sau 3 ngày).
// Đơn mới "đã giao" mà khách chưa xác nhận thì chưa chắc hàng đã tới tay → chưa cho chấm sao.
const REVIEWABLE = ["completed"];
const reviewOf = (pid) => myReviews.find((r) => String(r.productId) === String(pid));
const stars = (n, interactive = false) => {
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += interactive
      ? `<button type="button" class="star-input ${i <= n ? "on" : ""}" data-star="${i}" aria-label="${i} sao">★</button>`
      : `<span class="star ${i <= n ? "on" : ""}">★</span>`;
  }
  return out;
};

// Mỗi sản phẩm trong đơn đã nhận: chấm sao + viết nhận xét (1 đánh giá / 1 sản phẩm / 1 khách)
function reviewBox(o) {
  if (o.status === "delivered") {
    return `<p class="order-card__note">⭐ Bấm <strong>Đã nhận được hàng</strong> ở trên rồi bạn có thể chấm sao và viết nhận xét cho từng cây trong đơn.</p>`;
  }
  if (!REVIEWABLE.includes(o.status)) return "";
  const seen = new Set();
  const rows = (o.items || []).filter((it) => {
    const k = String(it.productId);
    if (!it.productId || seen.has(k)) return false;
    seen.add(k); return true;
  }).map((it) => {
    const done = reviewOf(it.productId);
    const name = escapeHTML(it.name || "Sản phẩm");
    if (done) {
      return `<li class="order-review order-review--done">
        <span class="order-review__name">${name}</span>
        <span class="order-review__stars">${stars(done.rating)}</span>
        <span class="muted">Đã đánh giá</span>
        <a class="btn btn--text btn--sm" href="product-detail.html?id=${encodeURIComponent(it.productId)}#reviewsSection">Xem</a>
      </li>`;
    }
    return `<li class="order-review" data-review-for="${escapeHTML(String(it.productId))}" data-review-order="${escapeHTML(String(o.id))}">
      <span class="order-review__name">${name}</span>
      <span class="order-review__stars" data-stars>${stars(0, true)}</span>
      <textarea rows="2" maxlength="500" data-review-text placeholder="Cây về có khỏe không? Đóng gói, giao hàng thế nào?"></textarea>
      <button type="button" class="btn btn--primary btn--sm" data-review-send>Gửi đánh giá</button>
    </li>`;
  }).join("");
  if (!rows) return "";
  const allDone = (o.items || []).every((it) => !it.productId || reviewOf(it.productId));
  return `<details class="order-card__review" ${allDone ? "" : "open"}>
    <summary>⭐ Đánh giá sản phẩm ${allDone ? "(đã gửi)" : ""}</summary>
    <ul class="order-review-list">${rows}</ul>
  </details>`;
}

// ---------- Thanh tiến trình đơn (5 bước) + dự kiến giao ----------
const PROGRESS_STEPS = ["Đặt hàng", "Xác nhận", "Đang giao", "Đã giao", "Hoàn tất"];
const PROGRESS_AT = { pending: 0, confirmed: 1, shipping: 2, delivered: 3, delivery_issue: 3, completed: 4 };
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const STEP_ICONS = [
  svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),                       // túi hàng
  svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="m14 15 1.5 1.5L19 13"/>'),                                   // đã thanh toán
  svg('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'), // xe giao
  svg('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73Z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>'), // kiện hàng
  svg('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'), // lá
];
const CHECK_ICON = svg('<path d="M5 12.5 10 17.5 19 7.5"/>');
const fmtShort = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
// Mốc thời gian từng bước (đơn cũ thiếu trường thì lấy từ lịch sử đơn)
function stepTimes(o) {
  const tl = (keys) => (o.timeline || []).filter((t) => keys.includes(t.action)).pop()?.at;
  return [
    o.createdAt,
    o.paidAt || tl(["approve_payment", "pay_wallet"]),
    o.shippedAt || tl(["ship"]),
    o.deliveredAt || tl(["mark_delivered"]),
    o.completedAt || tl(["confirm_received", "auto_complete"]),
  ];
}
const ETA_BADGE = {
  waiting: "Chờ xác nhận", preparing: "Đang chuẩn bị hàng", shipping: "Đang trên đường",
  arriving: "Sắp tới bạn", late: "Chậm hơn dự kiến", backorder: "Hàng đặt trước",
};

// Chỉ vẽ cho đơn đang đi theo luồng chính; đơn đã hủy / đang hoàn hàng đã có nhãn + ghi chú riêng.
export function progressHtml(o) {
  const at = PROGRESS_AT[o.status];
  if (at === undefined) return "";
  const warn = o.status === "delivery_issue";
  const eta = deliveryEstimate(o);
  // Đoạn đã đi giữa bước hiện tại và bước kế tiếp: đơn đang giao thì có xe chạy trên đường
  const go = eta && at < 4 ? eta.progress || 0 : 0;
  const fill = Math.min(1, (at + go) / 4);
  const riding = o.status === "shipping" && !!eta;
  const times = stepTimes(o);
  const cls = ["order-steps", warn ? "is-warn" : "", eta ? `is-${eta.state}` : "", at === 4 ? "is-complete" : ""].filter(Boolean).join(" ");
  const why = !eta ? "" : eta.basis === "shop"
    ? `Ngày giao do shop hẹn riêng cho đơn này${o.expectedDeliveryNote ? ` — ${escapeHTML(o.expectedDeliveryNote)}` : ""}.`
    : eta.state === "backorder" ? "" : escapeHTML(deliveryBasisText());
  const doneAt = autoCompleteAt(o);
  const etaHtml = eta ? `
    <div class="order-eta is-${eta.state}" role="status">
      <span class="order-eta__badge"><i aria-hidden="true"></i>${ETA_BADGE[eta.state]}</span>
      <span class="order-eta__text">${escapeHTML(eta.text)}${o.outForDeliveryNote ? ` · ${escapeHTML(o.outForDeliveryNote)}` : ""}</span>
      ${why ? `<small class="order-eta__why">${why}</small>` : ""}
    </div>` : doneAt ? `
    <div class="order-eta is-confirm" role="status">
      <span class="order-eta__badge"><i aria-hidden="true"></i>Chờ bạn xác nhận</span>
      <span class="order-eta__text">Tự hoàn tất lúc ${fmt(doneAt.toISOString())} (${timeLeft(doneAt)}) nếu bạn không phản hồi</span>
    </div>` : "";
  return `
    <ol class="${cls}" style="--at:${at};--fill:${fill.toFixed(3)}" aria-label="Tiến trình đơn: ${PROGRESS_STEPS[at]}${eta ? ` — ${escapeHTML(eta.text)}` : ""}">
      ${PROGRESS_STEPS.map((label, i) => {
        const done = i < at || at === 4;
        const state = done ? "is-done" : i === at ? "is-current" : i === at + 1 && riding ? "is-next" : "";
        return `
        <li class="${state}" style="--i:${i}"${i === at ? ' aria-current="step"' : ""}>
          <span class="order-steps__dot">${done ? CHECK_ICON : STEP_ICONS[i]}</span>
          <span class="order-steps__label">${label}</span>
          ${(done || i === at) && times[i] ? `<time class="order-steps__time" datetime="${escapeHTML(String(times[i]))}">${fmtShort(times[i])}</time>` : ""}
        </li>`;
      }).join("")}
      ${riding ? `<li class="order-steps__rider" aria-hidden="true"><span class="order-steps__rider-run"><span class="order-steps__rider-badge">${STEP_ICONS[2]}</span></span></li>` : ""}
    </ol>${etaHtml}`;
}

// ---------- Lọc theo trạng thái + tải dần (tài khoản nhiều đơn không phải cuộn một trang dài) ----------
const ORDER_FILTERS = [
  ["all", "Tất cả", () => true],
  ["active", "Đang xử lý", (o) => ["pending", "confirmed", "shipping", "delivered", "delivery_issue", "return_requested", "return_approved"].includes(o.status)],
  ["done", "Hoàn tất", (o) => o.status === "completed"],
  ["closed", "Đã hủy / hoàn hàng", (o) => ["cancelled", "returned"].includes(o.status)],
];
const PAGE_SIZE = 10;
let orderFilter = "all";
let visibleCount = PAGE_SIZE;

async function renderOrders() {
  await loadDeliveryRules(); // lịch làm việc của shop: giờ chốt đơn, ngày chuẩn bị / vận chuyển, ngày nghỉ
  let orders = await getOrdersByUser(user.id).catch(() => []);
  myReviews = (await getReviews().catch(() => [])).filter((r) => String(r.userId) === String(user.id));
  if (await autoCompleteDelivered(orders)) orders = await getOrdersByUser(user.id).catch(() => orders);
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Shop duyệt tiền / giao hàng / duyệt hoàn hàng → trang này tự cập nhật, khách khỏi F5
  liveWatch(box, {
    baseline: ordersSignature(orders),
    signature: async () => ordersSignature(await getOrdersByUser(user.id)),
    onChange: renderOrders,
  });

  if (!orders.length) {
    box.innerHTML = `<div class="state"><p>Bạn chưa có đơn hàng nào.</p><a class="btn btn--primary" href="index.html">Mua sắm ngay</a></div>`;
    return;
  }

  const test = (ORDER_FILTERS.find((f) => f[0] === orderFilter) || ORDER_FILTERS[0])[2];
  const matched = orders.filter(test);
  const shown = matched.slice(0, visibleCount);
  const filterBar = `
    <div class="filter-chips order-filter" role="group" aria-label="Lọc đơn hàng">
      ${ORDER_FILTERS.map(([k, label, t]) => `<button type="button" class="filter-chip${k === orderFilter ? " is-active" : ""}" data-order-filter="${k}">${label} <span class="filter-chip__n">${orders.filter(t).length}</span></button>`).join("")}
    </div>`;
  const moreBtn = matched.length > shown.length
    ? `<div class="order-more"><button type="button" class="btn btn--ghost" data-order-more>Xem thêm ${Math.min(PAGE_SIZE, matched.length - shown.length)} đơn (còn ${matched.length - shown.length})</button></div>`
    : "";
  const emptyNote = matched.length ? "" : `<div class="state"><p>Không có đơn nào ở mục này.</p></div>`;

  box.innerHTML = filterBar + emptyNote + shown.map((o) => {
    const items = (o.items || []).map((i) => `${escapeHTML(i.name)} ×${i.quantity}`).join(", ");
    const method = o.paymentMethod === "wallet" ? "Ví web" : o.paymentMethod === "qr" ? "Chuyển khoản QR" : "Chưa ghi nhận";
    const canInvoice = o.paymentStatus === "paid";
    return `
      <div class="order-card" data-order-id="${escapeHTML(String(o.id))}">
        <div class="order-card__head">
          <div><strong>Đơn #${escapeHTML(String(o.id))}</strong> · <span class="muted">${fmt(o.createdAt)}</span></div>
          <div class="order-chips">${statusChip(o)}${paymentChip(o)}${refundChip(o)}</div>
        </div>
        ${progressHtml(o)}
        <div class="order-card__items">${items || "—"}</div>
        ${o.shipping ? `<div class="order-card__ship">📍 Giao đến <strong>${escapeHTML(o.shipping.name || "")}</strong> · ${escapeHTML(o.shipping.phone || "")} — ${escapeHTML(o.shipping.address || "")}${o.shipping.note ? `<br><small class="muted">Ghi chú: ${escapeHTML(o.shipping.note)}</small>` : ""}</div>` : ""}
        <div class="order-card__foot">
          <span>Phương thức: <strong>${method}</strong></span>
          <span class="order-card__total">${formatPrice(o.total)}</span>
        </div>
        ${stageNote(o)}
        ${reviewBox(o)}
        ${o.refundStatus === "refunded" ? `<p class="order-card__note is-ok">💸 Đã hoàn ${formatPrice(o.refundAmount || o.total)} vào Ví web${o.refundedAt ? ` lúc ${fmt(o.refundedAt)}` : ""}.</p>` : ""}
        ${o.refundStatus === "pending" ? `<p class="order-card__note">💸 Shop đang kiểm tra sao kê ngân hàng để hoàn tiền cho bạn.</p>` : ""}
        <div class="order-card__actions">
          ${actionButtons(o, user)}
          ${canInvoice ? `<button class="btn btn--ghost btn--sm" data-invoice="${escapeHTML(String(o.id))}">📄 Tải hóa đơn PDF</button>` : ""}
        </div>
        <details class="order-card__history"><summary>Lịch sử đơn hàng</summary>${timelineHtml(o)}</details>
      </div>`;
  }).join("") + moreBtn;

  box.querySelectorAll("[data-order-filter]").forEach((b) => b.addEventListener("click", () => {
    orderFilter = b.dataset.orderFilter;
    visibleCount = PAGE_SIZE;
    renderOrders();
  }));
  box.querySelector("[data-order-more]")?.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderOrders();
  });

  box.querySelectorAll("[data-order-action]").forEach((b) => b.addEventListener("click", async () => {
    const o = orders.find((x) => String(x.id) === b.dataset.orderId);
    const a = availableActions(o, user).find((x) => x.key === b.dataset.orderAction);
    if (!o || !a) return;
    b.disabled = true;
    if (await runAction(o, a, user)) renderOrders();
    else b.disabled = false;
  }));

  box.querySelectorAll("[data-review-for]").forEach((li) => {
    let rating = 0;
    li.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", () => {
      rating = Number(b.dataset.star);
      li.querySelectorAll("[data-star]").forEach((x) => x.classList.toggle("on", Number(x.dataset.star) <= rating));
    }));
    li.querySelector("[data-review-send]").addEventListener("click", async (e) => {
      if (!rating) { showToast("Hãy chọn số sao trước nhé", { icon: "alert" }); return; }
      const comment = li.querySelector("[data-review-text]").value.trim();
      e.target.disabled = true;
      try {
        await createReview({
          productId: String(li.dataset.reviewFor), userId: String(user.id), orderId: String(li.dataset.reviewOrder),
          rating, comment, createdAt: new Date().toISOString(), replies: [],
        });
        showToast("✓ Cảm ơn bạn đã đánh giá!");
        renderOrders();
      } catch (err) {
        showToast("Không gửi được đánh giá: " + err.message, { icon: "alert" });
        e.target.disabled = false;
      }
    });
  });

  box.querySelectorAll("[data-add-proof]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = await compressImageToDataURL(file);
        await updateOrder(input.dataset.addProof, { paymentProof: data, proofMissing: false, proofAddedAt: new Date().toISOString() });
        showToast("✓ Đã gửi ảnh chuyển khoản, nhân viên sẽ duyệt sớm");
        renderOrders();
      } catch (err) {
        showToast("Không gửi được ảnh: " + err.message, { icon: "alert" });
      }
    });
  });

  box.querySelectorAll("[data-invoice]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const order = orders.find((o) => String(o.id) === btn.dataset.invoice);
      if (!order) return;
      btn.disabled = true; btn.textContent = "Đang tạo...";
      try {
        const { generateInvoicePDF } = await import("./invoice.js");
        await generateInvoicePDF(order, user);
        showToast("📄 Đã tải hóa đơn");
      } catch (err) {
        showToast("Lỗi tạo hóa đơn: " + err.message, { icon: "alert" });
      } finally {
        btn.disabled = false; btn.textContent = "📄 Tải hóa đơn PDF";
      }
    });
  });
}
