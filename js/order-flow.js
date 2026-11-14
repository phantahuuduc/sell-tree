// ==========================================================
// order-flow.js — Vòng đời đơn hàng dùng chung cho khách, nhân viên, quản trị.
// Một nơi duy nhất quyết định: ai được làm gì ở trạng thái nào, và mỗi bước kéo theo gì
// (hoàn tiền vào ví, trả lại kho, lịch sử đơn, nhật ký nhân viên, thông báo cho khách).
//
//  pending ─duyệt tiền→ confirmed ─giao vận chuyển→ shipping ─đã giao→ delivered ─khách xác nhận / tự hoàn tất sau N ngày→ completed
//     │                    │                            │                 └─ khách báo chưa nhận → delivery_issue
//     │                    │                            │                      ├─ NV xác minh khách đã nhận → delivered
//     │                    │                            │                      ├─ NV giao lại → shipping
//     │                    │                            │                      ├─ khách báo lại (vẫn chưa nhận) → delivery_issue
//     │                    │                            │                      └─ NV giao thất bại → cancelled (hoàn tiền)
//     └─ hủy / từ chối ────┴──── hủy ──── giao thất bại ┴──→ cancelled
//  completed do HỆ THỐNG tự hoàn tất (≤ 7 ngày) ─khách báo chưa nhận→ delivery_issue
//  delivered | completed (≤ 7 ngày) ─khách yêu cầu→ return_requested ─duyệt→ return_approved ─nhận lại hàng→ returned
//                                                         └─ từ chối → trạng thái trước đó
// ==========================================================
import {
  getOrderById, updateOrder, getUserById, updateUser, createWalletTransaction,
  getProductById, updateProduct, createAuditLog, getStockAlerts, updateStockAlert, getSettings,
} from "./api.js";
import { notifyUser } from "./notify.js";
import { formatPrice } from "./ui.js";

export const RETURN_DAYS = 7;          // khớp chính sách "Đổi cây 7 ngày"
export const AUTO_COMPLETE_DAYS = 3;   // mặc định: khách không phản hồi sau khi giao → tự hoàn tất (chỉnh trong Cài đặt)

export const STATUS = {
  pending:          { label: "Chờ xác nhận", tone: "mid" },
  confirmed:        { label: "Đã xác nhận — chờ giao", tone: "plain" },
  shipping:         { label: "Đang giao", tone: "mid" },
  delivered:        { label: "Đã giao — chờ khách xác nhận", tone: "plain" },
  delivery_issue:   { label: "Khách báo chưa nhận được hàng", tone: "alert" },
  completed:        { label: "Hoàn tất", tone: "active" },
  cancelled:        { label: "Đã hủy", tone: "alert" },
  return_requested: { label: "Yêu cầu hoàn hàng", tone: "alert" },
  return_approved:  { label: "Đang hoàn hàng", tone: "mid" },
  returned:         { label: "Đã hoàn hàng", tone: "plain" },
};

export const PAYMENT = {
  paid: { label: "Đã thanh toán", tone: "active" },
  awaiting_confirmation: { label: "Chờ duyệt thanh toán", tone: "mid" },
  rejected: { label: "Thanh toán bị từ chối", tone: "alert" },
  unpaid: { label: "Chưa thanh toán", tone: "alert" },
};

export const REFUND = {
  pending:  { label: "Chờ shop kiểm tra để hoàn tiền", tone: "mid" },
  refunded: { label: "Đã hoàn tiền vào Ví web", tone: "active" },
  declined: { label: "Không hoàn tiền — shop không nhận được thanh toán", tone: "alert" },
};

const DAY = 24 * 60 * 60 * 1000;
export const isPaid = (o) => o.paymentStatus === "paid";
// Khách đã gửi ảnh / báo đã chuyển khoản nhưng đơn chưa được duyệt → có thể đã mất tiền
const mayHavePaid = (o) => o.paymentStatus === "awaiting_confirmation" && (!!o.paymentProof || !!o.proofMissing);
export const deliveredAt = (o) => o.deliveredAt || o.completedAt || null;
export function returnDeadline(o) {
  const d = deliveredAt(o);
  return d ? new Date(new Date(d).getTime() + RETURN_DAYS * DAY) : null;
}

// ---------- Dự kiến giao hàng ----------
// Không phải con số đoán: tính theo LỊCH LÀM VIỆC của shop (quản trị chỉnh ở Cài đặt › Giao hàng):
//   • Giờ chốt đơn (cutoffHour): thanh toán trước giờ này → đóng gói ngay trong ngày; sau giờ này → ngày làm việc kế tiếp.
//   • Thời gian chuẩn bị (prepDays): số ngày làm việc để đóng gói trước khi giao cho vận chuyển.
//   • Thời gian vận chuyển (shipDaysMin–shipDaysMax): số ngày làm việc từ lúc giao cho vận chuyển tới tay khách.
//   • Ngày không giao: Chủ nhật (nếu tắt "Giao Chủ nhật") và các ngày nghỉ khai báo (closedDates) bị bỏ qua khi đếm.
// Nhân viên có thể HẸN NGÀY GIAO cụ thể cho từng đơn (hành động "Hẹn ngày giao") — khi đó ngày hẹn thay cho ước tính.
export const DELIVERY_DEFAULTS = {
  cutoffHour: 16, prepDays: 0, shipDaysMin: 1, shipDaysMax: 2,
  deliverSunday: false, closedDates: "", autoCompleteDays: AUTO_COMPLETE_DAYS,
};
let rules = { ...DELIVERY_DEFAULTS };
const clampInt = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
// Nạp quy tắc từ Cài đặt của shop (thiếu / sai thì dùng mặc định)
export function setDeliveryRules(settings) {
  const st = settings || {};
  const D = DELIVERY_DEFAULTS;
  const min = clampInt(st.shipDaysMin, 0, 14, D.shipDaysMin);
  rules = {
    cutoffHour: clampInt(st.cutoffHour, 0, 24, D.cutoffHour),
    prepDays: clampInt(st.prepDays, 0, 14, D.prepDays),
    shipDaysMin: min,
    shipDaysMax: Math.max(min, clampInt(st.shipDaysMax, 0, 21, Math.max(min, D.shipDaysMax))),
    deliverSunday: st.deliverSunday === true || st.deliverSunday === "true",
    closedDates: typeof st.closedDates === "string" ? st.closedDates : D.closedDates,
    autoCompleteDays: clampInt(st.autoCompleteDays, 1, 14, D.autoCompleteDays),
  };
  closedCache = null;
  return rules;
}
let rulesLoaded = null;
export function loadDeliveryRules(force = false) {
  if (!rulesLoaded || force) rulesLoaded = getSettings().then(setDeliveryRules).catch(() => rules);
  return rulesLoaded;
}
export const deliveryRules = () => rules;

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
const p2 = (n) => String(n).padStart(2, "0");
const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
export function dayLabel(d, now = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  const date = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  if (diff === 0) return `hôm nay (${date})`;
  if (diff === 1) return `ngày mai (${date})`;
  return `${WEEKDAY[d.getDay()]} ${date}`;
}
// Ngày nghỉ: "dd/mm" (lặp lại hằng năm) hoặc "dd/mm/yyyy" (một lần), cách nhau bằng dấu phẩy / chấm phẩy / xuống dòng
let closedCache = null;
function closedSet() {
  if (closedCache) return closedCache;
  closedCache = { yearly: new Set(), once: new Set() };
  String(rules.closedDates || "").split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean).forEach((t) => {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    if (!m) return;
    const key = `${p2(m[1])}/${p2(m[2])}`;
    if (m[3]) closedCache.once.add(`${key}/${m[3]}`); else closedCache.yearly.add(key);
  });
  return closedCache;
}
export function isDeliveryDay(d) {
  if (!rules.deliverSunday && d.getDay() === 0) return false;
  const c = closedSet();
  const key = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  return !c.yearly.has(key) && !c.once.has(`${key}/${d.getFullYear()}`);
}
// Ngày làm việc gần nhất tính từ d (kể cả d)
function nextWorkDay(d) {
  let x = startOfDay(d);
  for (let i = 0; i < 60 && !isDeliveryDay(x); i++) x = addDays(x, 1);
  return x;
}
// Cộng n ngày làm việc
function addWorkDays(d, n) {
  let x = nextWorkDay(d);
  for (let i = 0; i < n; i++) x = nextWorkDay(addDays(x, 1));
  return x;
}
// Ngày shop bắt đầu xử lý một đơn thanh toán lúc `t` (qua giờ chốt → ngày làm việc sau)
function startDay(t) {
  const d = new Date(t);
  const late = rules.cutoffHour < 24 && d.getHours() >= rules.cutoffHour;
  return nextWorkDay(late ? addDays(d, 1) : d);
}
// Khoảng ngày dự kiến cho một đơn thanh toán lúc `paidAt` (giỏ hàng dùng "bây giờ")
export function estimateWindow(paidAt = new Date()) {
  const out = addWorkDays(startDay(paidAt), rules.prepDays);   // ngày giao cho vận chuyển
  return { shipOut: out, from: addWorkDays(out, rules.shipDaysMin), to: addWorkDays(out, rules.shipDaysMax) };
}
// Câu giải thích "ước tính dựa trên đâu" — hiện cho khách ở giỏ hàng và ở đơn
export function deliveryBasisText() {
  const r = rules;
  const prep = r.prepDays ? `đóng gói trong ${r.prepDays} ngày làm việc` : "đóng gói ngay trong ngày";
  const cut = r.cutoffHour < 24 ? ` nếu thanh toán trước ${p2(r.cutoffHour)}:00 (sau giờ này tính từ ngày làm việc kế tiếp)` : "";
  const ship = r.shipDaysMin === r.shipDaysMax ? `${r.shipDaysMin}` : `${r.shipDaysMin}–${r.shipDaysMax}`;
  const off = [!r.deliverSunday ? "Chủ nhật" : "", closedSet().yearly.size || closedSet().once.size ? "ngày nghỉ của shop" : ""].filter(Boolean);
  return `Ước tính: ${prep}${cut}, vận chuyển nội thành ${ship} ngày làm việc${off.length ? `, không tính ${off.join(" và ")}` : ""}.`;
}
// "YYYY-MM-DD" (ngày hẹn do nhân viên đặt) → Date lúc 00:00 giờ máy
function parseDay(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export const formatDay = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
export const toInputDate = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// Đơn có cây "đặt trước" (kho không đủ lúc đặt) → chưa hẹn được ngày
function hasBackorder(o) {
  if (!o.stockDeducted) return false;
  const want = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const got = Object.values(o.stockDeducted).reduce((s, n) => s + (Number(n) || 0), 0);
  return got < want;
}
const shippedTime = (o) => o.shippedAt || (o.timeline || []).filter((t) => t.action === "ship").pop()?.at || o.updatedAt || o.createdAt;
// Dự kiến giao của một đơn ĐÃ đặt. Trả về null khi đơn không còn chờ giao (đã giao / hủy / hoàn hàng).
//   state: "waiting"  chờ xác nhận thanh toán      "preparing" shop đang chuẩn bị
//          "shipping" đang trên đường             "arriving"  sắp tới (shipper báo sắp giao / hôm nay là ngày hẹn)
//          "late"     quá ngày dự kiến             "backorder" có cây đặt trước, chưa hẹn ngày
//   basis: "shop" (nhân viên hẹn ngày) | "auto" (ước tính theo lịch làm việc)
//   progress: 0..1 — đoạn đường đã đi giữa bước hiện tại và bước kế tiếp (để vẽ xe trên thanh tiến trình)
export function deliveryEstimate(o, now = new Date()) {
  if (!["pending", "confirmed", "shipping"].includes(o.status)) return null;
  const today = startOfDay(now);
  const promised = parseDay(o.expectedDeliveryDate);
  const shipping = o.status === "shipping";
  if (!shipping && !promised && hasBackorder(o)) {
    return { state: "backorder", basis: "auto", from: null, to: null, progress: 0, text: "Có cây đặt trước — shop sẽ hẹn ngày giao khi có hàng" };
  }

  let from, to, basis = "auto", start;
  if (promised && o.status !== "pending") { from = to = promised; basis = "shop"; }
  else if (shipping) {
    const out = startOfDay(shippedTime(o));
    from = addWorkDays(out, rules.shipDaysMin); to = addWorkDays(out, rules.shipDaysMax);
  } else {
    // Chờ duyệt tiền: tính như thể được duyệt ngay bây giờ; đã duyệt: tính từ lúc duyệt
    const w = estimateWindow(o.status === "confirmed" ? new Date(o.paidAt || o.createdAt) : now);
    from = w.from; to = w.to;
  }
  start = shipping ? new Date(shippedTime(o)) : new Date(o.paidAt || o.createdAt);
  const late = o.status !== "pending" && today > to;
  const range = from.getTime() === to.getTime() ? dayLabel(to, now) : `${dayLabel(from, now)} – ${dayLabel(to, now)}`;
  const span = Math.max(1, to.getTime() + DAY_MS - start.getTime());
  const ratio = (now - start) / span;

  if (shipping) {
    const arriving = !late && (!!o.outForDeliveryAt || (from.getTime() === to.getTime() && today.getTime() === to.getTime()));
    return {
      state: late ? "late" : arriving ? "arriving" : "shipping", basis, from, to,
      progress: late ? 0.7 : o.outForDeliveryAt ? 0.78 : Math.min(0.7, Math.max(0.3, ratio)),
      text: late ? `Giao chậm hơn ${basis === "shop" ? "ngày hẹn" : "dự kiến"} (${dayLabel(to, now)}) — shop đang theo dõi đơn này`
        : o.outForDeliveryAt ? "Shipper đang trên đường tới bạn — sẽ giao trong ít phút tới, bạn để ý điện thoại nhé"
        : basis === "shop" ? `Shop hẹn giao ${range}` : `Dự kiến giao ${range}`,
    };
  }
  const paid = o.status === "confirmed";
  return {
    state: late ? "late" : paid ? "preparing" : "waiting", basis, from, to,
    progress: paid ? Math.min(0.75, Math.max(0.1, ratio)) : 0,
    text: late ? `Giao chậm hơn ${basis === "shop" ? "ngày hẹn" : "dự kiến"} (${dayLabel(to, now)}) — shop đang xử lý đơn này`
      : basis === "shop" ? `Shop hẹn giao ${range}`
      : paid ? `Dự kiến giao ${range}` : `Dự kiến giao ${range} nếu shop xác nhận thanh toán hôm nay`,
  };
}

// ---------- Sau khi giao: khách quên xác nhận ----------
// Đơn "Đã giao" mà khách không bấm "Đã nhận" / "Chưa nhận" → sau autoCompleteDays ngày tự chuyển "Hoàn tất".
// Trước hạn 24 giờ, khách nhận 1 lời nhắc (thông báo + email). Đơn TỰ hoàn tất (khách chưa từng xác nhận) vẫn cho
// khách báo "Chưa nhận được hàng" trong thời hạn đổi trả, để khách vắng nhà không bị mất quyền khiếu nại.
export function autoCompleteAt(o) {
  if (o.status !== "delivered") return null;
  const since = deliveredSince(o);
  return since === null ? null : new Date(since + rules.autoCompleteDays * DAY_MS);
}
const autoCompleted = (o) => o.status === "completed" && o.receivedConfirmedBy === "system";

// ---------- Định nghĩa hành động ----------
// who: "user" (chủ đơn) | "shop" (nhân viên/quản trị) · reason: bắt buộc nhập lý do · note: cho phép ghi chú
export const ACTIONS = {
  // --- Khách ---
  cancel: {
    who: "user", label: "Hủy đơn", from: ["pending", "confirmed"], reason: true, danger: true,
    ask: "Lý do hủy đơn",
    confirm: (o) => isPaid(o) ? `Hủy đơn và hoàn ${formatPrice(o.total)} vào Ví web?` : "Hủy đơn hàng này?",
    to: () => "cancelled", refund: "auto", restock: true,
  },
  confirm_received: {
    who: "user", label: "Đã nhận được hàng", from: ["delivered", "delivery_issue"], primary: true,
    confirm: () => "Xác nhận bạn đã nhận đủ hàng và hàng đúng như mô tả?",
    to: () => "completed",
  },
  // Báo lại được nhiều lần: khách vẫn chưa nhận sau khi shop xác minh/giao lại thì phải có đường nhắc tiếp
  report_not_received: {
    who: "user", label: "Chưa nhận được hàng", from: ["delivered", "delivery_issue", "completed"], reason: true,
    // Đơn đã hoàn tất: chỉ khi hệ thống TỰ hoàn tất (khách chưa từng xác nhận) và còn trong hạn đổi trả
    when: (o) => o.status !== "completed" || (autoCompleted(o) && !!returnDeadline(o) && new Date() <= returnDeadline(o)),
    labelFor: (o) => o.status === "delivery_issue" ? "Vẫn chưa nhận được hàng" : "Chưa nhận được hàng",
    ask: "Mô tả tình trạng (vd: chưa thấy shipper, sai địa chỉ…)",
    to: () => "delivery_issue",
  },
  request_return: {
    who: "user", label: "Yêu cầu hoàn hàng", from: ["delivered", "completed"], reason: true,
    ask: "Lý do hoàn hàng (vd: cây hỏng, sai loại, không hợp…)",
    when: (o) => { const d = returnDeadline(o); return !!d && new Date() <= d; },
    to: () => "return_requested",
  },
  cancel_return: {
    who: "user", label: "Rút yêu cầu hoàn hàng", from: ["return_requested"],
    to: (o) => o.statusBeforeReturn || "completed",
  },

  // --- Shop: thanh toán ---
  approve_payment: {
    who: "shop", label: "Xác nhận đã nhận tiền", from: ["pending"], primary: true,
    when: (o) => o.paymentStatus === "awaiting_confirmation",
    to: () => "confirmed", extra: () => ({ paymentStatus: "paid", paidAt: new Date().toISOString() }),
  },
  reject_payment: {
    who: "shop", label: "Từ chối thanh toán", from: ["pending"], reason: true, danger: true,
    ask: "Lý do từ chối (khách sẽ thấy)",
    when: (o) => o.paymentStatus === "awaiting_confirmation",
    to: () => "cancelled", extra: (o, reason) => ({ paymentStatus: "rejected", rejectReason: reason }), restock: true,
  },

  // --- Shop: giao hàng ---
  ship: {
    who: "shop", label: "Giao cho vận chuyển", from: ["confirmed", "delivery_issue"], primary: true, note: true,
    labelFor: (o) => o.status === "delivery_issue" ? "Giao lại cho khách" : "Giao cho vận chuyển",
    ask: "Đơn vị vận chuyển / mã vận đơn (không bắt buộc)",
    when: isPaid, blockedHint: "Đơn chưa thanh toán — cần duyệt thanh toán trước",
    to: () => "shipping",
  },
  // Hẹn ngày giao cụ thể (thay cho ước tính tự động) — vd. khách hẹn ngày, cây cần dưỡng thêm, xe đi tuyến xa
  set_delivery_date: {
    who: "shop", label: "Hẹn ngày giao", from: ["confirmed", "shipping"], note: true, dateInput: true,
    labelFor: (o) => o.expectedDeliveryDate ? "Đổi ngày hẹn giao" : "Hẹn ngày giao",
    ask: "Nhắn cho khách (vd: lý do đổi ngày, khung giờ giao — không bắt buộc)",
    to: (o) => o.status,
  },
  // Báo khách "sắp tới": shipper đã ra khỏi kho / đang trên đường đến địa chỉ nhận. Đơn vẫn ở trạng thái "Đang giao".
  out_for_delivery: {
    who: "shop", label: "Shipper sắp giao tới", from: ["shipping"], note: true,
    ask: "Nhắn cho khách (vd: shipper tên gì, khoảng mấy giờ tới — không bắt buộc)",
    when: (o) => !o.outForDeliveryAt,
    to: () => "shipping",
  },
  mark_delivered: {
    who: "shop", label: "Đã giao thành công", from: ["shipping", "delivery_issue"], primary: true, note: true,
    labelFor: (o) => o.status === "delivery_issue" ? "Đã xác minh: khách đã nhận" : "Đã giao thành công",
    ask: (o) => o.status === "delivery_issue"
      ? "Bằng chứng đã giao (ai nhận, lúc nào, ảnh/ghi chú của shipper…)"
      : "Ghi chú giao hàng (người nhận, thời gian… — không bắt buộc)",
    to: () => "delivered",
  },
  delivery_failed: {
    who: "shop", label: "Giao không thành công", from: ["shipping", "delivery_issue"], reason: true, danger: true,
    labelFor: (o) => o.status === "delivery_issue" ? "Không giao được — hủy & hoàn tiền" : "Giao không thành công",
    ask: "Lý do giao thất bại (khách sẽ thấy)",
    confirm: (o) => `Hủy đơn${isPaid(o) ? ` và hoàn ${formatPrice(o.total)} vào ví khách` : ""}, trả hàng về kho?`,
    to: () => "cancelled", refund: "auto", restock: true,
  },
  shop_cancel: {
    who: "shop", label: "Hủy đơn", from: ["pending", "confirmed"], reason: true, danger: true,
    ask: "Lý do hủy (khách sẽ thấy)",
    when: (o) => !(o.status === "pending" && o.paymentStatus === "awaiting_confirmation"), // đơn chờ duyệt tiền: dùng "Từ chối thanh toán"
    confirm: (o) => `Hủy đơn${isPaid(o) ? ` và hoàn ${formatPrice(o.total)} vào ví khách` : ""}?`,
    to: () => "cancelled", refund: "auto", restock: true,
  },

  // --- Shop: hoàn hàng ---
  approve_return: {
    who: "shop", label: "Duyệt hoàn hàng", from: ["return_requested"], primary: true, note: true,
    ask: "Hướng dẫn gửi trả cho khách (không bắt buộc)",
    to: () => "return_approved",
  },
  reject_return: {
    who: "shop", label: "Từ chối hoàn hàng", from: ["return_requested"], reason: true, danger: true,
    ask: "Lý do từ chối (khách sẽ thấy)",
    to: (o) => o.statusBeforeReturn || "completed",
  },
  receive_return: {
    who: "shop", label: "Đã nhận lại hàng", from: ["return_approved"], primary: true,
    confirm: (o) => `Xác nhận đã nhận lại hàng${isPaid(o) ? ` và hoàn ${formatPrice(o.total)} vào ví khách` : ""}?`,
    to: () => "returned", refund: "auto", restock: true,
  },

  // --- Shop: hoàn tiền cần kiểm tra (đơn hủy khi chưa được duyệt tiền) ---
  refund_confirm: {
    who: "shop", label: "Đã nhận tiền — hoàn vào ví", primary: true, anyStatus: true,
    when: (o) => o.refundStatus === "pending",
    confirm: (o) => `Đã kiểm tra sao kê và nhận ${formatPrice(o.total)}? Số tiền sẽ được hoàn vào ví khách.`,
    to: (o) => o.status, refund: "force",
  },
  refund_decline: {
    who: "shop", label: "Không nhận được tiền", reason: true, danger: true, anyStatus: true,
    ask: "Kết quả kiểm tra (khách sẽ thấy)",
    when: (o) => o.refundStatus === "pending",
    to: (o) => o.status, extra: () => ({ refundStatus: "declined" }),
  },
};

// Hành động hệ thống (không hiện nút)
const SYSTEM_ACTIONS = {
  auto_complete: { to: () => "completed" },
};

const actorRole = (actor) => (actor?.role === "staff" || actor?.role === "admin") ? "shop" : "user";

// Danh sách hành động người này được làm với đơn này (kèm hành động bị khóa có lý do)
export function availableActions(order, actor) {
  const who = actorRole(actor);
  if (who === "user" && String(order.userId) !== String(actor?.id)) return [];
  return Object.entries(ACTIONS)
    .filter(([, a]) => a.who === who && (a.anyStatus || a.from.includes(order.status)))
    .map(([key, a]) => {
      const ok = !a.when || a.when(order);
      // label/ask có thể đổi theo trạng thái đơn (vd: "Giao lại cho khách" khi đang khiếu nại)
      const label = a.labelFor ? a.labelFor(order) : a.label;
      const ask = typeof a.ask === "function" ? a.ask(order) : a.ask;
      return { key, ...a, label, ask, disabled: !ok, hint: ok ? "" : (a.blockedHint || "") };
    })
    .filter((a) => !a.disabled || a.hint); // điều kiện không đạt & không có gợi ý → ẩn hẳn
}

// ---------- Hiệu ứng đi kèm ----------
async function refundToWallet(order, actor, note) {
  const amount = Number(order.total) || 0;
  if (!amount) return null;
  const u = await getUserById(order.userId);
  if (!u) throw new Error("Không tìm thấy tài khoản khách để hoàn tiền");
  const newBalance = Number(u.walletBalance || 0) + amount;
  await updateUser(u.id, { walletBalance: newBalance });
  await createWalletTransaction({
    userId: String(u.id), type: "refund", amount, status: "confirmed",
    orderId: String(order.id), note, createdAt: new Date().toISOString(),
    confirmedBy: String(actor?.id || "system"), confirmedAt: new Date().toISOString(),
  });
  return { amount, newBalance };
}

// Trả lại đúng số lượng đã trừ khi đặt hàng (đơn cũ chưa từng trừ kho thì bỏ qua)
async function restockOrder(order) {
  if (order.stockRestored || !order.stockDeducted) return false;
  for (const [pid, qty] of Object.entries(order.stockDeducted)) {
    if (!qty) continue;
    const p = await getProductById(pid).catch(() => null);
    if (!p) continue;
    const before = Number(p.stock) || 0;
    await updateProduct(pid, { stock: before + Number(qty) });
    if (before <= 0) notifyBackInStock(pid, p.name).catch(() => {});
  }
  return true;
}

async function notifyBackInStock(productId, productName) {
  const alerts = await getStockAlerts({ productId, notified: false }).catch(() => []);
  for (const a of alerts) {
    const u = await getUserById(a.userId).catch(() => null);
    await notifyUser({
      userId: a.userId, email: u?.email,
      title: `"${productName}" đã có hàng trở lại!`,
      body: "Sản phẩm bạn quan tâm đã có hàng. Nhanh tay đặt mua trước khi hết nhé!",
      type: "stock", link: `product-detail.html?id=${encodeURIComponent(productId)}`,
    });
    await updateStockAlert(a.id, { notified: true, notifiedAt: new Date().toISOString() });
  }
}

// Khoảng ngày giao kể từ hôm nay khi đơn vừa giao cho vận chuyển (theo lịch làm việc)
function shipWindowText(now = new Date()) {
  const from = addWorkDays(now, rules.shipDaysMin), to = addWorkDays(now, rules.shipDaysMax);
  return from.getTime() === to.getTime() ? dayLabel(to, now) : `${dayLabel(from, now)} – ${dayLabel(to, now)}`;
}

function customerMessage(key, order, reason, note, refund, extra = {}) {
  const id = `#${order.id}`;
  const r = reason ? ` Lý do: ${reason}.` : "";
  const n = note ? ` Ghi chú: ${note}.` : "";
  const money = refund ? ` ${formatPrice(refund.amount)} đã được hoàn vào Ví web của bạn.` : "";
  return {
    approve_payment: [`Đơn ${id} đã được xác nhận thanh toán`, `Thanh toán ${formatPrice(order.total)} đã được xác nhận. Shop đang chuẩn bị hàng.`],
    reject_payment: [`Thanh toán đơn ${id} chưa được xác nhận`, `Shop chưa xác nhận được khoản thanh toán cho đơn ${id}, đơn đã bị hủy.${r} Nếu bạn đã chuyển khoản, hãy nhắn shop.`],
    ship: order.status === "delivery_issue"
      ? [`Đơn ${id} đang được giao lại`, `Shop đã nhận phản hồi "chưa nhận được hàng" và cho giao lại đơn này.${n}`]
      : [`Đơn ${id} đang được giao`, `Đơn hàng đã được giao cho đơn vị vận chuyển. ${order.expectedDeliveryDate && parseDay(order.expectedDeliveryDate) ? `Shop hẹn giao ${dayLabel(parseDay(order.expectedDeliveryDate))}` : `Dự kiến giao ${shipWindowText()}`}.${n}`],
    set_delivery_date: extra.promised
      ? [`Shop hẹn giao đơn ${id} ${dayLabel(extra.promised)}`, `Đơn ${id} sẽ được giao ${WEEKDAY[extra.promised.getDay()].toLowerCase()} ${formatDay(extra.promised)}.${n}`]
      : null,
    out_for_delivery: [`Đơn ${id} sắp tới bạn`, `Shipper đang trên đường giao đơn ${id} tới bạn. Vui lòng để ý điện thoại nhé.${n}`],
    mark_delivered: order.status === "delivery_issue"
      ? [`Đơn ${id}: shop đã xác minh đơn được giao`, `Shop đã kiểm tra lại với đơn vị vận chuyển.${n} Nếu bạn vẫn chưa nhận được hàng, hãy bấm "Vẫn chưa nhận được hàng" để shop giao lại hoặc hủy và hoàn tiền.`]
      : [`Đơn ${id} đã giao thành công`, `Vui lòng vào "Đơn hàng của tôi" bấm "Đã nhận được hàng" (hoặc báo nếu chưa nhận). Nếu bạn không phản hồi, đơn tự hoàn tất sau ${rules.autoCompleteDays} ngày.${n}`],
    delivery_failed: [`Đơn ${id} giao không thành công`, `Đơn đã bị hủy và hàng được trả về kho.${r}${money}`],
    shop_cancel: [`Đơn ${id} đã bị hủy`, `Shop đã hủy đơn hàng của bạn.${r}${money}`],
    approve_return: [`Yêu cầu hoàn hàng đơn ${id} đã được duyệt`, `Vui lòng gửi trả hàng cho shop.${n} Tiền sẽ được hoàn sau khi shop nhận lại hàng.`],
    reject_return: [`Yêu cầu hoàn hàng đơn ${id} bị từ chối`, `${r.trim()}`],
    receive_return: [`Shop đã nhận lại hàng đơn ${id}`, `Hoàn hàng hoàn tất.${money}`],
    refund_confirm: [`Đã hoàn tiền đơn ${id}`, `Shop đã xác nhận nhận được tiền.${money}`],
    refund_decline: [`Kết quả kiểm tra hoàn tiền đơn ${id}`, `Shop không tìm thấy khoản thanh toán của bạn nên không hoàn tiền.${r} Nếu có sai sót, hãy nhắn shop kèm ảnh chuyển khoản.`],
  }[key] || null;
}

// ---------- Thực hiện hành động ----------
// Luôn đọc lại đơn mới nhất từ server rồi kiểm tra quyền → tránh 2 người xử lý cùng lúc / dữ liệu cũ.
export async function performAction(orderId, key, actor, { reason = "", note = "", date = "", sendMail = true } = {}) {
  const def = ACTIONS[key] || SYSTEM_ACTIONS[key];
  if (!def) throw new Error("Hành động không hợp lệ");
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn hàng");

  let label = def.label || "Tự hoàn tất sau khi giao";
  if (ACTIONS[key]) {
    const allowed = availableActions(order, actor).find((a) => a.key === key && !a.disabled);
    if (!allowed) throw new Error(`Đơn đang ở trạng thái "${STATUS[order.status]?.label || order.status}" — không thể "${def.label}". Hãy tải lại trang.`);
    if (def.reason && !reason.trim()) throw new Error("Vui lòng nhập lý do");
    label = allowed.label || label;
  }
  let promised = null;
  if (def.dateInput) {
    promised = parseDay(date);
    if (!promised) throw new Error("Vui lòng chọn ngày giao");
    if (promised < startOfDay(new Date())) throw new Error("Ngày hẹn giao không được ở trong quá khứ");
    label = `${label}: ${formatDay(promised)}`;
  }

  const now = new Date().toISOString();
  const by = actor
    ? { id: String(actor.id), name: actor.name || "", role: actor.role || "user" }
    : { id: "system", name: "Hệ thống", role: "system" };
  const toStatus = def.to(order);
  const patch = { status: toStatus, updatedAt: now, ...(def.extra ? def.extra(order, reason) : {}) };

  // Mốc thời gian để minh bạch / tính hạn
  if (key === "ship") {
    patch.shippedAt = now; patch.outForDeliveryAt = null; if (note) patch.shippingNote = note;
    // Giao lại sau khiếu nại: ngày hẹn cũ không còn đúng → bỏ, quay về ước tính theo lịch
    if (order.status === "delivery_issue") { patch.expectedDeliveryDate = null; patch.expectedDeliveryNote = null; }
  }
  if (key === "set_delivery_date") { patch.expectedDeliveryDate = date; patch.expectedDeliveryNote = note || null; patch.expectedDeliverySetAt = now; }
  if (key === "out_for_delivery") { patch.outForDeliveryAt = now; if (note) patch.outForDeliveryNote = note; }
  if (key === "mark_delivered") { patch.deliveredAt = now; patch.deliveredBy = by.id; patch.receiveReminderAt = null; if (note) patch.deliveryNote = note; }
  if (key === "confirm_received" || key === "auto_complete") { patch.completedAt = now; patch.receivedConfirmedBy = key === "auto_complete" ? "system" : by.id; }
  if (key === "request_return") { patch.statusBeforeReturn = order.status; patch.returnReason = reason; patch.returnRequestedAt = now; }
  if (toStatus === "cancelled") { patch.cancelledAt = now; patch.cancelledBy = by.id; patch.cancelReason = reason; }
  if (key === "receive_return") patch.returnedAt = now;
  if (key === "report_not_received") patch.notReceivedReports = (Number(order.notReceivedReports) || 0) + 1;

  // Hộp việc "chưa đọc" của shop: khách thao tác → đánh dấu chưa đọc; shop thao tác → coi như đã xử lý
  if (by.role === "user") Object.assign(patch, { shopUnread: true, shopUnreadAt: now, shopUnreadLabel: label });
  else if (by.role === "staff" || by.role === "admin") patch.shopUnread = false;

  // Hoàn tiền
  let refund = null;
  if (def.refund === "auto") {
    if (isPaid(order)) {
      refund = await refundToWallet(order, by, `Hoàn tiền đơn #${order.id} (${def.label})`);
      if (refund) Object.assign(patch, { refundStatus: "refunded", refundedAt: now, refundAmount: refund.amount });
    } else if (mayHavePaid(order)) {
      patch.refundStatus = "pending"; // chưa duyệt tiền mà khách báo đã chuyển → nhân viên kiểm tra sao kê
    }
  } else if (def.refund === "force") {
    refund = await refundToWallet(order, by, `Hoàn tiền đơn #${order.id} sau khi kiểm tra sao kê`);
    Object.assign(patch, { refundStatus: "refunded", refundedAt: now, refundAmount: refund?.amount || 0 });
  }

  // Trả kho
  if (def.restock && await restockOrder(order)) patch.stockRestored = true;

  patch.timeline = [...(order.timeline || []), {
    action: key, label, status: toStatus, at: now, by,
    ...(reason ? { reason } : {}), ...(note ? { note } : {}),
    ...(refund ? { refund: refund.amount } : {}),
  }];

  const updated = await updateOrder(order.id, patch);

  // Nhật ký thao tác của nhân viên/quản trị (minh bạch)
  if (by.role === "staff" || by.role === "admin") {
    createAuditLog({
      staffId: by.id, staffName: by.name, action: `order_${key}`,
      detail: `Đơn #${order.id}: ${label}${reason ? ` — ${reason}` : ""}${note ? ` — ${note}` : ""}${refund ? ` — hoàn ${formatPrice(refund.amount)}` : ""}`,
      createdAt: now,
    }).catch(() => {});
  }

  // Thông báo cho khách khi shop thao tác
  const msg = by.role !== "user" && by.role !== "system" ? customerMessage(key, order, reason, note, refund, { promised }) : null;
  if (msg) {
    const u = await getUserById(order.userId).catch(() => null);
    notifyUser({ userId: order.userId, email: u?.email, title: msg[0], body: msg[1], type: key.includes("refund") || refund ? "wallet" : "order", link: "donhang.html", sendMail }).catch(() => {});
  }
  return { order: updated, refund };
}

// Mốc "đã giao" dùng để tính hạn tự hoàn tất.
// Đơn cũ (nhập tay / dữ liệu mẫu) không có deliveredAt → lấy mốc gần nhất có được,
// nếu không đơn sẽ nằm mãi ở "Chờ khách xác nhận" và ô đếm không bao giờ về 0.
function deliveredSince(o) {
  const tl = (o.timeline || []).filter((t) => t.action === "mark_delivered").pop();
  const d = o.deliveredAt || tl?.at || o.shippedAt || o.updatedAt || o.createdAt;
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

// Đơn đã giao quá autoCompleteDays ngày mà khách không phản hồi → tự hoàn tất.
// Còn dưới 24 giờ mà chưa nhắc → gửi 1 lời nhắc cho khách (mỗi lần giao chỉ nhắc 1 lần).
// Chạy mỗi khi trang "Đơn hàng của tôi" hoặc bảng đơn của nhân viên / quản trị được mở (web không có máy chủ chạy nền).
export async function autoCompleteDelivered(orders) {
  await loadDeliveryRules();
  const now = Date.now();
  const due = [], remind = [];
  (orders || []).forEach((o) => {
    const at = autoCompleteAt(o);
    if (!at) return;
    if (now >= at.getTime()) due.push(o);
    else if (at.getTime() - now <= DAY_MS && !o.receiveReminderAt) remind.push({ o, at });
  });
  for (const o of due) {
    try { await performAction(o.id, "auto_complete", null); } catch {}
  }
  for (const { o, at } of remind) {
    try {
      await updateOrder(o.id, { receiveReminderAt: new Date().toISOString() });
      const u = await getUserById(o.userId).catch(() => null);
      notifyUser({
        userId: o.userId, email: u?.email, type: "order", link: "donhang.html",
        title: `Bạn đã nhận được đơn #${o.id} chưa?`,
        body: `Shop đã giao đơn #${o.id}. Vui lòng vào "Đơn hàng của tôi" bấm "Đã nhận được hàng", hoặc "Chưa nhận được hàng" nếu chưa thấy hàng. Nếu không phản hồi, đơn tự hoàn tất lúc ${p2(at.getHours())}:${p2(at.getMinutes())} ${formatDay(at)}.`,
      }).catch(() => {});
    } catch { /* nhắc lần sau */ }
  }
  return due.length;
}
