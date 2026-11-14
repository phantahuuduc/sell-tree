// ==========================================================
// live.js — Tự làm mới vùng đang xem khi dữ liệu trên server đổi (khỏi phải F5).
//
// Cách làm: cứ vài giây lấy "chữ ký" dữ liệu (chuỗi gộp id + trạng thái + mốc cập nhật).
// Chữ ký đổi → gọi lại hàm vẽ. Không đổi → không làm gì, nên gần như không tốn gì.
//
// Luôn hoãn làm mới khi: tab trình duyệt bị ẩn, panel đang ẩn, đang mở hộp thoại,
// người dùng đang gõ trong vùng đó, hoặc nơi gọi báo "khoan đã" (vd: đang tick chọn đơn).
// ==========================================================
const timers = new WeakMap();

export const DEFAULT_INTERVAL = 6000;

// Chữ ký của danh sách đơn: đổi khi có đơn mới / đổi trạng thái / khách vừa thao tác
export const ordersSignature = (orders) => (orders || [])
  .map((o) => `${o.id}|${o.status}|${o.paymentStatus}|${o.refundStatus || ""}|${o.shopUnread ? 1 : 0}|${o.updatedAt || o.createdAt || ""}`)
  .sort()
  .join("\n");

function busy(el, canRefresh) {
  if (!el.isConnected) return true;
  if (document.hidden) return true;                           // tab trình duyệt đang ẩn
  if (el.hidden || !el.offsetParent) return true;             // panel đang ẩn (tab khác)
  if (document.querySelector(".modal-overlay")) return true;  // đang mở hộp hỏi/xác nhận
  const a = document.activeElement;
  if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true; // đang gõ
  if (canRefresh && !canRefresh()) return true;               // nơi gọi đang bận
  return false;
}

/**
 * Theo dõi dữ liệu của một vùng và vẽ lại khi có thay đổi.
 * @param {Element} el         vùng đang hiển thị (dùng làm khóa, gọi lại sẽ thay bộ đếm cũ)
 * @param {Object}  o
 * @param {Function} o.signature  async → chuỗi chữ ký dữ liệu hiện tại trên server
 * @param {Function} o.onChange   gọi khi chữ ký đổi (thường là hàm vẽ lại)
 * @param {string?}  o.baseline   chữ ký của dữ liệu vừa vẽ (tránh vẽ lại thừa ngay lần đầu)
 * @param {Function?} o.canRefresh trả về false để hoãn lần làm mới này
 * @param {number?}  o.interval   nhịp kiểm tra (ms)
 */
export function liveWatch(el, { signature, onChange, baseline = null, canRefresh = null, interval = DEFAULT_INTERVAL }) {
  if (!el) return;
  stopLive(el);
  let sig = baseline;
  const id = setInterval(async () => {
    if (!el.isConnected) { stopLive(el); return; }
    if (busy(el, canRefresh)) return;
    let next;
    try { next = await signature(); } catch { return; }   // mất mạng / server bận → bỏ qua lượt này
    if (sig === null) { sig = next; return; }
    if (next === sig) return;
    sig = next;
    onChange();
  }, interval);
  timers.set(el, id);
}

export function stopLive(el) {
  const id = timers.get(el);
  if (id) { clearInterval(id); timers.delete(el); }
}
