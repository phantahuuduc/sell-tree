// ==========================================================
// admin-audit.js — Trang quản trị › Nhật ký nhân viên.
//
// CHỈ ĐỌC nhật ký (auditLog) — cách ghi log ở order-flow.js / order-ui.js / staff.js giữ nguyên.
//   • Mặc định chỉ xem HÔM NAY; chọn nhanh 7 ngày / 30 ngày / khoảng tùy chọn. Danh sách chia theo ngày.
//   • Hai cách xem: "Theo đối tượng" (gom mọi thao tác trên cùng một đơn / một ví / một sản phẩm thành 1 dòng,
//     bấm để mở dòng thời gian) và "Danh sách đầy đủ" (mỗi thao tác một dòng, như trước).
//   • Lọc theo nhân viên (bấm ô tóm tắt), loại thao tác, "chỉ thao tác quan trọng", ô tìm kiếm (mã đơn / sản phẩm / khách).
//   • Không tải cả bảng: máy chủ lọc + sắp xếp + phân trang (_page/_limit/_sort/_order, createdAt_gte/_lte, staffId,
//     action, detail_like), trình duyệt chỉ nhận từng trang 60 thao tác ("Xem thêm"). Kết quả máy chủ trả về luôn
//     được KIỂM TRA LẠI phía trình duyệt (json-server 0.17 bỏ qua bộ lọc theo trường chưa bản ghi nào có).
//   • Xuất Excel đúng bộ lọc đang chọn (SheetJS đã nạp ở admin.html).
// ==========================================================
import { getAuditLogPage, getOrdersByIds, getOrders, getUsers, getProducts } from "./api.js";
import { STATUS } from "./order-flow.js";
import { escapeHTML, formatPrice, removeAccents, debounce, prefersReducedMotion } from "./ui.js";

const PAGE_SIZE = 60;
const VIEW_KEY = "admin_audit_view";
const RANGE_KEY = "admin_audit_range";

// ---------- Loại thao tác: tên tiếng Việt + mức độ ----------
// Mỗi loại gom các mã đang được ghi (kể cả mã cũ còn trong db.json). important: cần admin để ý (tiền, hủy, xóa, sửa kho…).
export const AUDIT_TYPES = [
  { key: "pay_ok",     icon: "✓",  label: "Duyệt thanh toán",            codes: ["confirm_payment", "order_approve_payment"] },
  { key: "pay_no",     icon: "✗",  label: "Từ chối thanh toán",          codes: ["reject_payment", "order_reject_payment"], important: true },
  { key: "ship",       icon: "🚚", label: "Giao cho vận chuyển",         codes: ["order_ship"] },
  { key: "set_date",   icon: "📅", label: "Hẹn ngày giao",               codes: ["order_set_delivery_date"] },
  { key: "out",        icon: "🛵", label: "Báo shipper sắp giao tới",    codes: ["order_out_for_delivery"] },
  { key: "delivered",  icon: "📦", label: "Xác nhận đã giao",            codes: ["order_mark_delivered"] },
  { key: "fail",       icon: "⚠",  label: "Giao không thành công",       codes: ["order_delivery_failed"], important: true },
  { key: "cancel",     icon: "✗",  label: "Hủy đơn",                     codes: ["order_shop_cancel", "order_cancel"], important: true },
  { key: "ret_ok",     icon: "↩",  label: "Duyệt hoàn hàng",             codes: ["order_approve_return"] },
  { key: "ret_no",     icon: "✗",  label: "Từ chối hoàn hàng",           codes: ["order_reject_return"], important: true },
  { key: "ret_recv",   icon: "↩",  label: "Nhận lại hàng hoàn",          codes: ["order_receive_return"], important: true },
  { key: "refund_ok",  icon: "💸", label: "Hoàn tiền vào ví",            codes: ["order_refund_confirm"], important: true },
  { key: "refund_no",  icon: "✗",  label: "Từ chối hoàn tiền",           codes: ["order_refund_decline"], important: true },
  { key: "status",     icon: "↻",  label: "Đổi trạng thái đơn (thủ công)", codes: ["update_order_status"], important: true },
  { key: "bulk_del",   icon: "🗑",  label: "Xóa nhiều đơn",               codes: ["orders_bulk_delete"], important: true },
  { key: "topup_ok",   icon: "💰", label: "Duyệt nạp ví",                codes: ["confirm_topup"], important: true },
  { key: "topup_no",   icon: "✗",  label: "Từ chối nạp ví",              codes: ["reject_topup"], important: true },
  { key: "stock",      icon: "📦", label: "Sửa tồn kho",                 codes: ["update_stock", "product_stock"], important: true },
  // --- Thao tác của quản trị (admin.html) ---
  { key: "p_create",   icon: "🌱", label: "Thêm sản phẩm",               codes: ["product_create"] },
  { key: "p_update",   icon: "✎",  label: "Sửa sản phẩm",                codes: ["product_update"] },
  { key: "p_price",    icon: "₫",  label: "Đổi giá sản phẩm",            codes: ["product_price"], important: true },
  { key: "p_cost",     icon: "💲", label: "Đổi giá vốn sản phẩm",        codes: ["product_cost"], important: true },
  { key: "p_delete",   icon: "🗑",  label: "Xóa sản phẩm",                codes: ["product_delete"], important: true },
  { key: "p_import",   icon: "⬆",  label: "Nhập sản phẩm từ Excel",      codes: ["product_import"] },
  { key: "pr_create",  icon: "🎉", label: "Tạo khuyến mãi",              codes: ["promo_create"] },
  { key: "pr_update",  icon: "✎",  label: "Sửa khuyến mãi",              codes: ["promo_update"] },
  { key: "pr_toggle",  icon: "⏻",  label: "Bật / tắt khuyến mãi",        codes: ["promo_toggle"] },
  { key: "pr_pct",     icon: "%",  label: "Đổi % giảm của khuyến mãi",   codes: ["promo_discount"], important: true },
  { key: "pr_delete",  icon: "🗑",  label: "Xóa khuyến mãi",              codes: ["promo_delete"], important: true },
  { key: "c_create",   icon: "🏷",  label: "Tạo mã giảm giá",             codes: ["coupon_create"] },
  { key: "c_update",   icon: "✎",  label: "Sửa mã giảm giá",             codes: ["coupon_update"] },
  { key: "c_toggle",   icon: "⏻",  label: "Tạm ngưng / kích hoạt mã",    codes: ["coupon_toggle"] },
  { key: "c_restore",  icon: "↺",  label: "Khôi phục mã giảm giá",       codes: ["coupon_restore"] },
  { key: "c_pct",      icon: "%",  label: "Đổi % giảm của mã giảm giá",  codes: ["coupon_discount"], important: true },
  { key: "c_delete",   icon: "🗑",  label: "Xóa mã giảm giá",             codes: ["coupon_delete"], important: true },
  { key: "u_create",   icon: "👤", label: "Tạo tài khoản nhân viên",     codes: ["user_create"], important: true },
  { key: "u_role",     icon: "⇄",  label: "Đổi vai trò tài khoản",       codes: ["user_role"], important: true },
  { key: "u_lock",     icon: "🔒", label: "Khóa tài khoản",              codes: ["user_lock"], important: true },
  { key: "u_unlock",   icon: "🔓", label: "Mở khóa tài khoản",           codes: ["user_unlock"], important: true },
  { key: "u_delete",   icon: "🗑",  label: "Xóa tài khoản",               codes: ["user_delete"], important: true },
  // Dự phòng: trang quản trị hiện CHƯA có chức năng nạp / trừ ví thủ công — khai báo sẵn tên để không lộ mã thô nếu thêm sau
  { key: "w_adjust",   icon: "💰", label: "Sửa số dư ví thủ công",       codes: ["wallet_adjust"], important: true, hidden: true },
  // Các hành động phía khách / hệ thống — hiện chưa được ghi vào nhật ký nhân viên, khai báo sẵn để không bao giờ lộ mã thô
  { key: "cust",       icon: "•",  label: "Thao tác thay khách",         codes: ["order_confirm_received", "order_report_not_received", "order_request_return", "order_cancel_return", "order_auto_complete"] },
];
const TYPE_OF = new Map();
AUDIT_TYPES.forEach((t) => t.codes.forEach((c) => TYPE_OF.set(c, t)));
const IMPORTANT_CODES = AUDIT_TYPES.filter((t) => t.important).flatMap((t) => t.codes);

// Mã chưa khai báo: nhãn chung dễ đọc, không bao giờ hiện mã thô
export function auditType(code) {
  const t = TYPE_OF.get(String(code || ""));
  if (t) return t;
  return { key: "other", icon: "•", label: /^order_/.test(String(code)) ? "Thao tác khác trên đơn" : "Thao tác khác", codes: [], important: false };
}

// ---------- Tiện ích thời gian ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const shortDate = (iso) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };

function dayLabel(d) {
  const today = startOfDay(new Date());
  const diff = Math.round((today - startOfDay(d)) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  const year = d.getFullYear() !== today.getFullYear() ? `/${d.getFullYear()}` : "";
  return `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${year}`;
}

// Khoảng thời gian đang chọn → [from, to) theo giờ máy + nhãn
function resolveRange(st) {
  const today = startOfDay(new Date());
  const end = addDays(today, 1);
  if (st.range === "7") return { from: addDays(today, -6), to: end, label: "7 ngày qua" };
  if (st.range === "30") return { from: addDays(today, -29), to: end, label: "30 ngày qua" };
  if (st.range === "custom") {
    let a = parseYmd(st.from) || today, b = parseYmd(st.to) || today;
    if (a > b) [a, b] = [b, a];
    return { from: a, to: addDays(b, 1), label: a.getTime() === b.getTime() ? dmy(a) : `${dmy(a)} – ${dmy(b)}` };
  }
  return { from: today, to: end, label: "Hôm nay" };
}

// ---------- Đối tượng của một thao tác (để gom) ----------
const ORDER_RE = /đơn #([A-Za-z0-9_-]+)/i;
function subjectOf(log) {
  const detail = String(log.detail || "");
  if (log.action === "orders_bulk_delete") return { key: `bulk:${log.id}`, kind: "bulk" };
  const o = ORDER_RE.exec(detail);
  if (o) return { key: `order:${o[1]}`, kind: "order", id: o[1] };
  const w = /cho user ([A-Za-z0-9_-]+)/i.exec(detail);
  if (w) return { key: `wallet:${w[1]}`, kind: "wallet", id: w[1] };
  const t = /nạp ví #([A-Za-z0-9_-]+)/i.exec(detail);
  if (t) return { key: `topup:${t[1]}`, kind: "topup", id: t[1] };
  if (log.action === "product_import") return { key: `one:${log.id}`, kind: "other" };
  const p = /Tồn kho "(.+?)"/.exec(detail) || /sản phẩm "(.+?)"/i.exec(detail);
  if (p) return { key: `product:${p[1]}`, kind: "product", id: p[1] };
  const pr = /khuyến mãi "(.+?)"/i.exec(detail);
  if (pr) return { key: `promo:${pr[1]}`, kind: "promo", id: pr[1] };
  const c = /mã giảm giá "(.+?)"/i.exec(detail);
  if (c) return { key: `coupon:${c[1]}`, kind: "coupon", id: c[1] };
  const a = /tài khoản (?:nhân viên )?"(.+?)"/i.exec(detail);
  if (a) return { key: `account:${a[1]}`, kind: "account", id: a[1] };
  return { key: `one:${log.id}`, kind: "other" };
}
// Phần ghi chú của một bước (bỏ "Đơn #id: <tên thao tác>" lặp lại)
function noteOf(log) {
  const detail = String(log.detail || "");
  const m = /^Đơn #[A-Za-z0-9_-]+: (.*)$/s.exec(detail);
  if (!m) return detail;
  return m[1].split(" — ").slice(1).join(" — ");
}
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => removeAccents(String(s || "")).toLowerCase().trim();

// ==========================================================
export function initAuditPanel(panel) {
  if (!panel) return;
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* chỉ là ghi nhớ cách xem */ } };
  const st = {
    range: "today", from: ymd(new Date()), to: ymd(new Date()),
    view: read(VIEW_KEY, "group") === "list" ? "list" : "group",
    staff: "", type: "", important: false, q: "",
    items: [], total: 0, page: 0, loading: false, token: 0, open: new Set(),
  };
  const savedRange = read(RANGE_KEY, "today");
  if (["today", "7", "30"].includes(savedRange)) st.range = savedRange;

  // Dữ liệu tra cứu (tên khách, đơn, sản phẩm) — nạp một lần, làm mới khi bấm "Làm mới"
  let ref = null;
  async function loadRef(force = false) {
    if (ref && !force) return ref;
    const [users, products] = await Promise.all([getUsers().catch(() => []), getProducts().catch(() => [])]);
    ref = { users, products, userById: new Map(users.map((u) => [String(u.id), u])), orders: null };
    return ref;
  }
  async function allOrders() {
    if (!ref.orders) ref.orders = await getOrders().catch(() => []);
    return ref.orders;
  }

  // ---------- Khung tĩnh ----------
  panel.innerHTML = `
    <div class="aud">
      <p class="aud__intro muted">Mọi thao tác nhạy cảm của nhân viên (thanh toán, giao hàng, hủy / hoàn, nạp ví, tồn kho) được ghi lại để quản trị giám sát.</p>
      <div class="aud__bar">
        <div class="aud__seg" role="group" aria-label="Khoảng thời gian">
          <button type="button" data-range="today">Hôm nay</button>
          <button type="button" data-range="7">7 ngày</button>
          <button type="button" data-range="30">30 ngày</button>
          <button type="button" data-range="custom">Tùy chọn</button>
        </div>
        <form class="aud__custom" id="audCustom" hidden>
          <label>Từ <input type="date" name="from" required></label>
          <label>Đến <input type="date" name="to" required></label>
          <button class="btn btn--ghost btn--sm" type="submit">Xem</button>
        </form>
        <div class="aud__seg aud__seg--view" role="group" aria-label="Cách xem">
          <button type="button" data-view="group">Theo đối tượng</button>
          <button type="button" data-view="list">Danh sách đầy đủ</button>
        </div>
      </div>
      <div class="aud__staff" id="audStaff" role="group" aria-label="Lọc theo nhân viên"></div>
      <div class="aud__filters">
        <label class="aud__search"><span class="visually-hidden">Tìm kiếm</span>
          <input type="search" id="audSearch" placeholder="Tìm mã đơn, tên sản phẩm, tên khách…" autocomplete="off">
        </label>
        <label class="aud__select"><span class="visually-hidden">Loại thao tác</span>
          <select id="audType">
            <option value="">Mọi loại thao tác</option>
            ${AUDIT_TYPES.filter((t) => t.key !== "cust" && !t.hidden).map((t) => `<option value="${t.key}">${t.icon} ${escapeHTML(t.label)}${t.important ? " ●" : ""}</option>`).join("")}
          </select>
        </label>
        <label class="aud__switch"><input type="checkbox" id="audImportant"><span>Chỉ xem thao tác quan trọng</span></label>
        <button class="btn btn--text btn--sm" type="button" id="audClear" hidden>Xóa bộ lọc</button>
        <span class="aud__spacer"></span>
        <button class="btn btn--ghost btn--sm" type="button" id="audExport">⬇ Xuất Excel</button>
        <button class="btn btn--ghost btn--sm" type="button" id="audRefresh">↻ Làm mới</button>
      </div>
      <p class="aud__summary muted" id="audSummary" aria-live="polite"></p>
      <div class="aud__body" id="audBody"><div class="state"><p>Đang tải nhật ký…</p></div></div>
      <div class="aud__more" id="audMore"></div>
    </div>`;

  const $ = (sel) => panel.querySelector(sel);
  const body = $("#audBody"), more = $("#audMore"), summary = $("#audSummary");
  const custom = $("#audCustom");

  // ---------- Bộ lọc → tham số máy chủ ----------
  // Danh sách mã thao tác cần lấy (loại ∩ quan trọng). null = không lọc; [] = chắc chắn rỗng.
  function actionCodes() {
    let codes = null;
    if (st.type) codes = (AUDIT_TYPES.find((t) => t.key === st.type)?.codes) || [];
    if (st.important) codes = codes ? codes.filter((c) => IMPORTANT_CODES.includes(c)) : IMPORTANT_CODES.slice();
    return codes;
  }
  // Biểu thức tìm trong "detail": chữ người dùng gõ + mã đơn của khách / có sản phẩm khớp tên + "user <id>" (nạp ví)
  async function searchPattern() {
    const q = st.q.trim();
    if (!q) return null;
    const nq = norm(q);
    const parts = [escRe(q)];
    const { users, products } = await loadRef();
    const custIds = users.filter((u) => u.role === "user" && norm(u.name).includes(nq)).map((u) => String(u.id));
    const prodIds = new Set(products.filter((p) => norm(p.name).includes(nq)).map((p) => String(p.id)));
    products.filter((p) => prodIds.has(String(p.id))).forEach((p) => parts.push(escRe(p.name)));
    custIds.forEach((id) => parts.push(`user ${escRe(id)}(?![A-Za-z0-9_-])`));
    if (custIds.length || prodIds.size) {
      const orders = await allOrders();
      const cust = new Set(custIds);
      orders
        .filter((o) => cust.has(String(o.userId)) || (o.items || []).some((it) => prodIds.has(String(it.productId))))
        .slice(0, 200)
        .forEach((o) => parts.push(`#${escRe(o.id)}(?![A-Za-z0-9_-])`));
    }
    return [...new Set(parts)].join("|");
  }
  async function baseParams({ withStaff = true } = {}) {
    const r = resolveRange(st);
    const p = { createdAt_gte: r.from.toISOString(), createdAt_lte: new Date(r.to.getTime() - 1).toISOString() };
    const codes = actionCodes();
    if (codes) p.action = codes;
    if (withStaff && st.staff) p.staffId = st.staff;
    const pat = await searchPattern();
    if (pat) p.detail_like = pat;
    return p;
  }
  // Kiểm tra lại từng bản ghi máy chủ trả về (không tin bộ lọc mù quáng)
  function keep(log, p) {
    const t = String(log.createdAt || "");
    if (!(t >= p.createdAt_gte && t <= p.createdAt_lte)) return false;
    if (p.action && !p.action.includes(log.action)) return false;
    if (p.staffId && String(log.staffId) !== String(p.staffId)) return false;
    if (p.detail_like) { try { if (!new RegExp(p.detail_like, "i").test(String(log.detail || ""))) return false; } catch { /* biểu thức lỗi → bỏ qua kiểm tra này */ } }
    return true;
  }

  // ---------- Tải dữ liệu ----------
  async function load({ reset = true } = {}) {
    const token = ++st.token;
    st.loading = true;
    if (reset) {
      st.items = []; st.page = 0; st.total = 0; st.open.clear();
      body.innerHTML = `<div class="state"><p>Đang tải nhật ký…</p></div>`;
      more.innerHTML = "";
    } else {
      more.innerHTML = `<p class="muted">Đang tải thêm…</p>`;
    }
    syncControls();
    try {
      await loadRef();
      const p = await baseParams();
      const codes = p.action;
      let items = [], total = 0;
      if (!codes || codes.length) {
        const res = await getAuditLogPage({ ...p, _sort: "createdAt", _order: "desc", _page: st.page + 1, _limit: PAGE_SIZE });
        items = res.items.filter((l) => keep(l, p));
        total = res.items.length === items.length ? res.total : Math.max(items.length, st.items.length + items.length);
      }
      if (token !== st.token) return;      // người dùng đã đổi bộ lọc trong lúc chờ
      st.page += 1;
      st.items = st.items.concat(items);
      st.total = total;
      await attachOrders(token);
      if (token !== st.token) return;
      render();
      if (reset) loadStaffCounts(token);
    } catch (err) {
      if (token !== st.token) return;
      body.innerHTML = `<div class="state"><p>Không tải được nhật ký: ${escapeHTML(err.message || "lỗi mạng")}.</p><button class="btn btn--ghost btn--sm" type="button" data-retry>Thử lại</button></div>`;
      body.querySelector("[data-retry]").addEventListener("click", () => load());
      more.innerHTML = "";
    } finally {
      if (token === st.token) st.loading = false;
    }
  }

  // Thông tin hiện tại của các đơn có trong trang đang xem (trạng thái, khách, cờ "Cần kiểm tra Ví web")
  let orderInfo = new Map();
  async function attachOrders(token) {
    const ids = [...new Set(st.items.map(subjectOf).filter((s) => s.kind === "order").map((s) => s.id))].filter((id) => !orderInfo.has(id));
    if (!ids.length) return;
    const found = await getOrdersByIds(ids).catch(() => null);
    if (token !== st.token || !found) return;
    const byId = new Map(found.map((o) => [String(o.id), o]));
    ids.forEach((id) => orderInfo.set(id, byId.get(id) || null)); // null = đơn đã bị xóa
  }

  // Số thao tác của từng nhân viên trong khoảng thời gian + bộ lọc đang chọn (không tính bộ lọc nhân viên)
  async function loadStaffCounts(token) {
    const wrap = $("#audStaff");
    try {
      const p = await baseParams({ withStaff: false });
      const staffUsers = ref.users.filter((u) => u.role === "staff" || u.role === "admin");
      const seen = new Map(staffUsers.map((u) => [String(u.id), u.name || `#${u.id}`]));
      st.items.forEach((l) => { if (l.staffId && !seen.has(String(l.staffId))) seen.set(String(l.staffId), l.staffName || `#${l.staffId}`); });
      if (st.staff && !seen.has(st.staff)) seen.set(st.staff, `#${st.staff}`);
      const empty = p.action && !p.action.length;
      const count = async (extra) => (empty ? 0 : (await getAuditLogPage({ ...p, ...extra, _page: 1, _limit: 1 })).total);
      const all = await count({});
      const per = await Promise.all([...seen].map(async ([id, name]) => ({ id, name, n: await count({ staffId: id }) })));
      if (token !== st.token) return;
      per.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "vi"));
      wrap.innerHTML = [
        `<button type="button" class="aud-staff${!st.staff ? " is-on" : ""}" data-staff="" aria-pressed="${!st.staff}"><b>${all}</b><span>Tất cả nhân viên</span></button>`,
        ...per.map((s) => `<button type="button" class="aud-staff${st.staff === s.id ? " is-on" : ""}${s.n ? "" : " is-zero"}" data-staff="${escapeHTML(s.id)}" aria-pressed="${st.staff === s.id}">
          <b>${s.n}</b><span>${escapeHTML(s.name)}</span><small>thao tác</small></button>`),
      ].join("");
    } catch { wrap.innerHTML = ""; }
  }

  // ---------- Vẽ ----------
  function staffName(log) { return log.staffName || (ref.userById.get(String(log.staffId))?.name) || `#${log.staffId || "?"}`; }

  function subjectTitle(sub, logs) {
    if (sub.kind === "order") {
      const o = orderInfo.get(sub.id);
      const cust = o ? (ref.userById.get(String(o.userId))?.name || `Khách #${o.userId}`) : "";
      return { title: `Đơn #${sub.id}`, meta: o ? `${cust} · ${formatPrice(o.total)}` : "Đơn đã bị xóa khỏi hệ thống" };
    }
    if (sub.kind === "wallet") {
      const u = ref.userById.get(String(sub.id));
      return { title: `Ví của ${u?.name || `khách #${sub.id}`}`, meta: "Nạp ví" };
    }
    if (sub.kind === "topup") return { title: `Yêu cầu nạp ví #${sub.id}`, meta: "Nạp ví" };
    if (sub.kind === "product") return { title: sub.id, meta: "Sản phẩm" };
    if (sub.kind === "promo") return { title: `Khuyến mãi "${sub.id}"`, meta: "Chương trình khuyến mãi" };
    if (sub.kind === "coupon") return { title: `Mã giảm giá ${sub.id}`, meta: "Mã giảm giá" };
    if (sub.kind === "account") return { title: `Tài khoản ${sub.id}`, meta: "Tài khoản" };
    if (sub.kind === "bulk") return { title: "Xóa nhiều đơn", meta: "Dọn đơn đã kết thúc" };
    return { title: auditType(logs[0].action).label, meta: "" };
  }
  function statusChip(sub) {
    if (sub.kind !== "order") return "";
    const o = orderInfo.get(sub.id);
    if (o === undefined) return "";
    if (o === null) return `<span class="chip chip--plain">Đã xóa</span>`;
    const s = STATUS[o.status] || { label: "Trạng thái khác", tone: "plain" };
    return `<span class="chip chip--${s.tone}">${escapeHTML(s.label)}</span>`;
  }
  const walletFlag = (sub) => sub.kind === "order" && orderInfo.get(sub.id)?.walletCheckNeeded;
  const typeChip = (log) => {
    const t = auditType(log.action);
    return `<span class="aud-type${t.important ? " is-important" : ""}"><i aria-hidden="true">${t.icon}</i>${escapeHTML(t.label)}</span>`;
  };

  function groupsOf(items) {
    const map = new Map();
    items.forEach((l) => {
      const sub = subjectOf(l);
      let g = map.get(sub.key);
      if (!g) { g = { sub, logs: [] }; map.set(sub.key, g); }
      g.logs.push(l);
    });
    const groups = [...map.values()];
    groups.forEach((g) => {
      g.logs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));   // dòng thời gian: cũ → mới
      g.latest = g.logs[g.logs.length - 1].createdAt;
      g.important = g.logs.some((l) => auditType(l.action).important) || !!walletFlag(g.sub);
    });
    return groups.sort((a, b) => String(b.latest).localeCompare(String(a.latest)));
  }
  // Chia theo ngày (theo thao tác mới nhất của mỗi dòng)
  function byDay(rows, dateOf) {
    const out = [];
    rows.forEach((r) => {
      const d = startOfDay(new Date(dateOf(r)));
      const k = ymd(d);
      let b = out[out.length - 1];
      if (!b || b.k !== k) { b = { k, d, rows: [] }; out.push(b); }
      b.rows.push(r);
    });
    return out;
  }

  function groupHtml(g) {
    const { title, meta } = subjectTitle(g.sub, g.logs);
    const names = [...new Set(g.logs.map(staffName))];
    const last = g.logs[g.logs.length - 1];
    const id = `aud-${g.sub.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const open = st.open.has(g.sub.key);
    const flag = walletFlag(g.sub);
    const steps = g.logs.map((l) => {
      const t = auditType(l.action);
      const note = noteOf(l);
      return `
        <li class="aud-step${t.important ? " is-important" : ""}">
          <time datetime="${escapeHTML(l.createdAt)}">${shortDate(l.createdAt)} · ${hhmm(l.createdAt)}</time>
          <div class="aud-step__what">${typeChip(l)}<span class="aud-step__who">${escapeHTML(staffName(l))}</span></div>
          ${note ? `<p class="aud-step__note">${escapeHTML(note)}</p>` : ""}
        </li>`;
    }).join("");
    return `
      <li class="aud-group${g.important ? " is-important" : ""}${open ? " is-open" : ""}">
        <button type="button" class="aud-group__head" aria-expanded="${open}" aria-controls="${id}" data-group="${escapeHTML(g.sub.key)}">
          <span class="aud-group__mark" aria-hidden="true">${g.important ? "!" : ""}</span>
          <span class="aud-group__main">
            <span class="aud-group__title">${escapeHTML(title)} ${statusChip(g.sub)}${flag ? ` <span class="chip chip--alert">⚠ Cần kiểm tra Ví web</span>` : ""}</span>
            <span class="aud-group__meta">${meta ? `${escapeHTML(meta)} · ` : ""}Gần nhất: ${typeChip(last)}</span>
          </span>
          <span class="aud-group__side">
            <span class="aud-group__who">${names.map(escapeHTML).join(", ")}</span>
            <span class="aud-group__when"><time datetime="${escapeHTML(last.createdAt)}">${hhmm(last.createdAt)}</time> · ${g.logs.length} bước</span>
          </span>
          <span class="aud-group__chev" aria-hidden="true">›</span>
        </button>
        <div class="aud-group__tl" id="${id}" ${open ? "" : "hidden"}>
          <ol class="aud-steps">${steps}</ol>
        </div>
      </li>`;
  }

  function listHtml(rows) {
    return `
      <table class="admin-table aud-table">
        <thead><tr><th>Thời gian</th><th>Nhân viên</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
        <tbody>${rows.map((l) => {
          const sub = subjectOf(l);
          const t = auditType(l.action);
          const { title } = subjectTitle(sub, [l]);
          return `
          <tr class="${t.important ? "is-important" : ""}">
            <td data-label="Thời gian"><div><time datetime="${escapeHTML(l.createdAt)}">${hhmm(l.createdAt)}</time></div></td>
            <td data-label="Nhân viên"><div><strong>${escapeHTML(staffName(l))}</strong></div></td>
            <td data-label="Thao tác"><div>${typeChip(l)}</div></td>
            <td data-label="Đối tượng"><div class="aud-cell">${escapeHTML(title)} ${statusChip(sub)}</div></td>
            <td data-label="Chi tiết"><div>${escapeHTML(l.detail || "")}</div></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  }

  function filtersActive() { return !!(st.staff || st.type || st.important || st.q.trim()); }

  function render() {
    const r = resolveRange(st);
    const shown = st.items.length;
    const active = filtersActive();
    summary.innerHTML = shown
      ? `${escapeHTML(r.label)}: <b>${st.total}</b> thao tác${active ? " khớp bộ lọc" : ""}${st.view === "group" ? ` · gom thành <b>${groupsOf(st.items).length}</b> đối tượng` : ""}${shown < st.total ? ` · đang xem ${shown} thao tác mới nhất` : ""}.`
      : "";

    if (!shown) {
      body.innerHTML = active
        ? `<div class="aud-empty"><p class="aud-empty__title">Không có thao tác nào khớp bộ lọc.</p><p class="muted">Thử bỏ bớt điều kiện hoặc chọn khoảng thời gian dài hơn.</p><button class="btn btn--ghost btn--sm" type="button" data-clear>Xóa bộ lọc</button></div>`
        : `<div class="aud-empty"><p class="aud-empty__title">${st.range === "today" ? "Hôm nay chưa có thao tác nào." : `Không có thao tác nào trong ${escapeHTML(r.label.toLowerCase())}.`}</p>
            <p class="muted">Nhân viên duyệt thanh toán, giao hàng, hủy đơn, nạp ví hay sửa tồn kho sẽ hiện ở đây.</p>
            ${st.range !== "30" ? `<div class="aud-empty__acts">${st.range === "today" ? `<button class="btn btn--ghost btn--sm" type="button" data-go-range="7">Xem 7 ngày</button>` : ""}<button class="btn btn--ghost btn--sm" type="button" data-go-range="30">Xem 30 ngày</button></div>` : ""}</div>`;
      more.innerHTML = "";
      return;
    }

    if (st.view === "group") {
      const days = byDay(groupsOf(st.items), (g) => g.latest);
      body.innerHTML = days.map((b) => `
        <section class="aud-day" aria-label="${escapeHTML(dayLabel(b.d))}">
          <h3 class="aud-day__title">${escapeHTML(dayLabel(b.d))} <small>${b.rows.length} đối tượng</small></h3>
          <ul class="aud-groups">${b.rows.map(groupHtml).join("")}</ul>
        </section>`).join("");
    } else {
      const days = byDay(st.items, (l) => l.createdAt);
      body.innerHTML = days.map((b) => `
        <section class="aud-day" aria-label="${escapeHTML(dayLabel(b.d))}">
          <h3 class="aud-day__title">${escapeHTML(dayLabel(b.d))} <small>${b.rows.length} thao tác</small></h3>
          <div class="admin-table-wrap">${listHtml(b.rows)}</div>
        </section>`).join("");
    }
    more.innerHTML = shown < st.total
      ? `<button class="btn btn--ghost" type="button" data-more>Xem thêm ${Math.min(PAGE_SIZE, st.total - shown)} thao tác cũ hơn</button>
         <p class="muted aud__more-note">Đã tải ${shown}/${st.total}.${st.view === "group" ? " Đối tượng ở cuối danh sách có thể còn bước cũ hơn chưa tải." : ""}</p>`
      : (st.total > PAGE_SIZE ? `<p class="muted aud__more-note">Đã hiện đủ ${st.total} thao tác.</p>` : "");
  }

  function syncControls() {
    panel.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === st.range)));
    panel.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === st.view)));
    custom.hidden = st.range !== "custom";
    custom.from.value = st.from; custom.to.value = st.to;
    $("#audType").value = st.type;
    $("#audImportant").checked = st.important;
    if ($("#audSearch").value !== st.q) $("#audSearch").value = st.q;
    $("#audClear").hidden = !filtersActive();
    panel.querySelectorAll("[data-staff]").forEach((b) => {
      const on = b.dataset.staff === st.staff;
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on));
    });
  }

  function clearFilters() {
    st.staff = ""; st.type = ""; st.important = false; st.q = "";
    load();
  }

  // ---------- Sự kiện ----------
  panel.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !panel.contains(t)) return;
    if (t.dataset.range) {
      st.range = t.dataset.range;
      if (st.range !== "custom") save(RANGE_KEY, st.range);
      if (st.range === "custom") { syncControls(); custom.from.focus(); return; }
      load(); return;
    }
    if (t.dataset.goRange) { st.range = t.dataset.goRange; save(RANGE_KEY, st.range); load(); return; }
    if (t.dataset.view) { st.view = t.dataset.view; save(VIEW_KEY, st.view); syncControls(); render(); return; }
    if (t.dataset.staff !== undefined && t.classList.contains("aud-staff")) { st.staff = st.staff === t.dataset.staff ? "" : t.dataset.staff; load(); return; }
    if (t.hasAttribute("data-clear") || t.id === "audClear") { clearFilters(); return; }
    if (t.hasAttribute("data-more")) { if (!st.loading) load({ reset: false }); return; }
    if (t.id === "audRefresh") { ref = null; orderInfo = new Map(); load(); return; }
    if (t.id === "audExport") { exportExcel(t); return; }
    if (t.dataset.group) {
      const key = t.dataset.group;
      const li = t.closest(".aud-group");
      const tl = li.querySelector(".aud-group__tl");
      const open = tl.hidden;
      tl.hidden = !open;
      li.classList.toggle("is-open", open);
      t.setAttribute("aria-expanded", String(open));
      if (open) st.open.add(key); else st.open.delete(key);
    }
  });
  custom.addEventListener("submit", (e) => {
    e.preventDefault();
    st.from = custom.from.value || ymd(new Date());
    st.to = custom.to.value || st.from;
    load();
  });
  $("#audType").addEventListener("change", (e) => { st.type = e.target.value; load(); });
  $("#audImportant").addEventListener("change", (e) => { st.important = e.target.checked; load(); });
  const onSearch = debounce(() => { const v = $("#audSearch").value; if (v.trim() === st.q.trim()) return; st.q = v; load(); }, 350);
  $("#audSearch").addEventListener("input", onSearch);

  // ---------- Xuất Excel đúng bộ lọc ----------
  async function exportExcel(btn) {
    const XLSX = window.XLSX;
    if (!XLSX) { alert("Thư viện Excel chưa sẵn sàng. Vui lòng tải lại trang."); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Đang xuất…";
    try {
      await loadRef();
      const p = await baseParams();
      const rows = [];
      if (!p.action || p.action.length) {
        for (let page = 1; page < 200; page++) {
          const res = await getAuditLogPage({ ...p, _sort: "createdAt", _order: "desc", _page: page, _limit: 500 });
          rows.push(...res.items.filter((l) => keep(l, p)));
          if (res.items.length < 500 || page * 500 >= res.total) break;
        }
      }
      if (!rows.length) { alert("Không có thao tác nào trong bộ lọc hiện tại để xuất."); return; }
      const orderIds = [...new Set(rows.map(subjectOf).filter((s) => s.kind === "order").map((s) => s.id))].filter((id) => !orderInfo.has(id));
      if (orderIds.length) {
        const found = await getOrdersByIds(orderIds).catch(() => []);
        const byId = new Map(found.map((o) => [String(o.id), o]));
        orderIds.forEach((id) => orderInfo.set(id, byId.get(id) || null));
      }
      const data = rows.map((l) => {
        const t = auditType(l.action);
        const sub = subjectOf(l);
        const d = new Date(l.createdAt);
        const o = sub.kind === "order" ? orderInfo.get(sub.id) : undefined;
        return {
          "Ngày": dmy(d), "Giờ": hhmm(l.createdAt),
          "Nhân viên": staffName(l), "Mã NV": String(l.staffId || ""),
          "Thao tác": t.label, "Mức": t.important ? "Quan trọng" : "Thường ngày",
          "Đối tượng": subjectTitle(sub, [l]).title,
          "Trạng thái đơn hiện tại": o ? (STATUS[o.status]?.label || "") : (o === null ? "Đã xóa" : ""),
          "Chi tiết": String(l.detail || ""),
        };
      });
      const r = resolveRange(st);
      const filt = [
        st.staff ? `NV: ${ref.userById.get(st.staff)?.name || st.staff}` : "",
        st.type ? `Loại: ${AUDIT_TYPES.find((x) => x.key === st.type)?.label}` : "",
        st.important ? "Chỉ thao tác quan trọng" : "",
        st.q.trim() ? `Tìm: "${st.q.trim()}"` : "",
      ].filter(Boolean).join(" · ");
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.sheet_add_aoa(ws, [[], [`Khoảng thời gian: ${st.range === "custom" ? r.label : `${r.label} (${dmy(r.from)} – ${dmy(new Date(r.to.getTime() - 1))})`}`], [`Bộ lọc: ${filt || "không"}`], [`Tổng: ${rows.length} thao tác`]], { origin: -1 });
      ws["!cols"] = [{ wch: 11 }, { wch: 6 }, { wch: 20 }, { wch: 8 }, { wch: 26 }, { wch: 12 }, { wch: 26 }, { wch: 26 }, { wch: 70 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Nhật ký");
      const f = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
      const toDay = new Date(r.to.getTime() - 1);
      XLSX.writeFile(wb, `NhatKyNhanVien_${f(r.from)}${ymd(r.from) === ymd(toDay) ? "" : `_den_${f(toDay)}`}${filt ? "_daloc" : ""}.xlsx`);
    } catch (err) {
      alert(`Không xuất được: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  if (prefersReducedMotion()) panel.classList.add("aud--still");
  syncControls();
  load();
  return { reload: () => { ref = null; orderInfo = new Map(); return load(); } };
}
