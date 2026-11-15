// ==========================================================
// api.js — Toàn bộ việc gọi JSON-Server nằm ở đây.
// Các trang khác chỉ import hàm, không tự viết URL.
// ==========================================================
import axios from "axios";

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
export const API_URL = IS_LOCAL
  ? "http://localhost:3000"
  : "https://sell-tree.onrender.com";

// Tạo một instance axios dùng chung: cùng baseURL, cùng timeout.
const api = axios.create({
  baseURL: API_URL,
  timeout: IS_LOCAL ? 8000 : 60000,
});

// Tự gửi lại khi lỗi mạng (server chưa sẵn sàng / mất kết nối tạm thời): tối đa 2 lần, cách 800ms + 1600ms.
// CHỈ áp dụng cho lệnh AN TOÀN KHI LẶP: GET / HEAD / OPTIONS và PUT (ghi đè nguyên bản ghi — gửi 2 lần vẫn ra 1 kết quả).
// POST KHÔNG được tự gửi lại: "lỗi mạng" có thể là máy chủ ĐÃ lưu nhưng phản hồi rớt giữa đường → gửi lại mù quáng
// sẽ sinh bản ghi trùng (vd 2 đơn hàng). Lệnh tạo nào cần gửi lại thì đi qua postOnce() bên dưới (tra theo mã trước).
// PATCH / DELETE cũng không tự gửi lại; nơi gọi tự quyết (vd giỏ hàng thử lại các lệnh PATCH ghi giá trị tuyệt đối).
// ----- Hàng đợi ghi -----
// json-server chạy kiểu `json-server --watch db.json` sẽ ĐỌC LẠI cả file sau mỗi lần ghi. Lượt ghi nào tới
// trong vài chục mili-giây ngay sau lượt trước có thể bị lần đọc lại đó đè mất: server vẫn trả "thành công"
// nhưng bản ghi biến mất (vd. ví đã trừ tiền mà đơn hàng không còn). Chạy bằng `node tools/start-db.mjs` thì
// không bị, nhưng để web đúng với MỌI cách bật server: các lượt ghi (POST/PATCH/PUT/DELETE) đi lần lượt,
// lượt sau cách lượt trước một nhịp ngắn. Lượt đọc (GET) không bị ảnh hưởng.
const SAFE_RETRY = ["get", "head", "options", "put"]; // lệnh được phép tự gửi lại khi lỗi mạng
const WRITE_GAP = 300; // ms — đo thực tế: dưới ~25ms mới mất dữ liệu; để dư cho máy chậm / file db lớn
const LAST_WRITE_KEY = "__api_last_write"; // dùng chung giữa các tab (tab khách + tab nhân viên cùng ghi)
let writeChain = Promise.resolve();
const isWrite = (cfg) => !["get", "head", "options"].includes(String(cfg?.method || "get").toLowerCase());
const lastWriteAt = () => { try { return Number(localStorage.getItem(LAST_WRITE_KEY)) || 0; } catch { return 0; } };
function writeDone(cfg) {
  if (!cfg || !cfg.__release) return;
  try { localStorage.setItem(LAST_WRITE_KEY, String(Date.now())); } catch { /* bỏ qua */ }
  const release = cfg.__release;
  cfg.__release = null;
  release();
}
api.interceptors.request.use(async (cfg) => {
  if (!isWrite(cfg)) return cfg;
  const prev = writeChain;
  let release;
  writeChain = new Promise((r) => { release = r; });
  cfg.__release = release;
  await prev;
  const wait = lastWriteAt() + WRITE_GAP - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, WRITE_GAP)));
  return cfg;
});
api.interceptors.response.use((res) => { writeDone(res.config); return res; });

api.interceptors.response.use(undefined, async (err) => {
  const cfg = err.config || {};
  writeDone(cfg); // trả lượt cho hàng đợi ghi TRƯỚC khi thử lại (lần thử lại sẽ tự xếp hàng lại)
  const isNetwork = !err.response; // không có HTTP response = lỗi mạng
  const safeToRepeat = SAFE_RETRY.includes(String(cfg.method || "get").toLowerCase());
  if (!isNetwork || !safeToRepeat || cfg.__retryCount >= 2) return Promise.reject(err);
  cfg.__retryCount = (cfg.__retryCount || 0) + 1;
  const delay = 800 * cfg.__retryCount;
  await new Promise((r) => setTimeout(r, delay));
  return api.request(cfg);
});

// ----- Tạo bản ghi "đúng một lần" -----
// Mỗi lần tạo mang một MÃ RIÊNG do trình duyệt sinh (clientRef), lưu ngay trong bản ghi.
// Gặp lỗi mạng thì KHÔNG gửi lại ngay: tra `GET <path>?clientRef=<mã>` trước —
//   • đã có  → dùng luôn bản ghi đó (máy chủ đã lưu, chỉ phản hồi bị rớt);
//   • chưa có → mới gửi lại;
//   • chưa tra được (mạng vẫn rớt) → chờ rồi tra lại, tuyệt đối không gửi khi chưa biết.
// Hết 3 lượt vẫn không xong thì ném lỗi, kèm cờ: err.notCreated (tra được, chắc chắn chưa có)
// hoặc err.outcomeUnknown (không tra được nên không biết). Hàm KHÔNG bao giờ xóa bản ghi nào.
// Với json-server 0.17, bản ghi gửi kèm `id` còn được máy chủ tự chặn trùng (id đã có → 500) — thêm một lớp bảo vệ.
export function newClientRef(length = 11) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // bỏ ký tự dễ nhầm (0/O, 1/l/I)
  const buf = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else for (let k = 0; k < length; k++) buf[k] = Math.floor(Math.random() * 2 ** 32);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
}
async function findByRef(path, ref) {
  const res = await api.get(path, { params: { clientRef: ref } }); // GET → được tự gửi lại khi lỗi mạng
  // PHẢI so khớp lại ở đây: json-server 0.17 BỎ QUA bộ lọc theo trường chưa bản ghi nào có → trả về toàn bộ danh sách.
  // Lấy phần tử đầu sẽ nhận nhầm bản ghi của người khác.
  const list = Array.isArray(res.data) ? res.data : [];
  return list.find((x) => x && x.clientRef === ref) || null;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function postOnce(path, data) {
  const ref = data.clientRef || newClientRef();
  const body = { ...data, clientRef: ref };
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await pause(800 * attempt);
      try {
        const found = await findByRef(path, ref);
        if (found) return found;               // máy chủ đã lưu từ lượt trước → không gửi nữa
      } catch (lookupErr) { lastErr = lookupErr; continue; } // chưa tra được → KHÔNG gửi lại
    }
    try {
      return (await api.post(path, body)).data;
    } catch (err) {
      lastErr = err;
      if (err.response) {                      // máy chủ có trả lời (vd 500 "id đã tồn tại") → không phải lỗi mạng
        const found = await findByRef(path, ref).catch(() => null);
        if (found) return found;
        throw err;
      }
    }
  }
  try {
    const found = await findByRef(path, ref);
    if (found) return found;
    lastErr.notCreated = true;
  } catch { lastErr.outcomeUnknown = true; }
  throw lastErr;
}

// Lấy toàn bộ danh mục
export async function getCategories() {
  const res = await api.get("/categories");
  return res.data;
}

// Lấy toàn bộ sản phẩm
export async function getProducts() {
  const res = await api.get("/products");
  return res.data;
}

// Lấy 1 sản phẩm theo id.
// Thử path param trước (/products/:id), fallback sang query param (?id=...).
// Trả về null nếu không tìm thấy để trang chi tiết hiện empty state.
export async function getProductById(id) {
  try {
    // Cách 1: path param — json-server cả v0 & v1 đều hỗ trợ
    const res = await api.get(`/products/${encodeURIComponent(id)}`);
    if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
      return res.data;
    }
    // Nếu trả về mảng (json-server v1 hiếm khi)
    if (Array.isArray(res.data) && res.data.length > 0) return res.data[0];
    return null;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err; // lỗi mạng thì ném tiếp để trang hiện thông báo "kiểm tra server"
  }
}

// ----- Người dùng -----

// Tìm user theo email (dùng khi đăng ký để kiểm tra trùng)
// Email KHÔNG phân biệt hoa / thường: "An@Gmail.com" và "an@gmail.com" là một tài khoản.
// json-server chỉ lọc khớp đúng từng ký tự → thử email viết thường trước, không thấy thì so khớp trên cả danh sách
// (tài khoản cũ có thể đã lưu email có chữ hoa).
export async function findUserByEmail(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return [];
  const res = await api.get("/users", { params: { email: key } });
  if (Array.isArray(res.data) && res.data.length) return res.data;
  const all = await api.get("/users");
  return Array.isArray(all.data) ? all.data.filter((u) => String(u.email || "").trim().toLowerCase() === key) : [];
}

// Đăng nhập: lọc theo email, rồi so sánh password ở client
// (json-server v1 có thể không lọc đúng khi query nhiều field cùng lúc)
export async function findUserByCredentials(email, password) {
  const users = await findUserByEmail(email);
  if (!Array.isArray(users)) return [];
  // So sánh password phía client
  return users.filter((u) => u.password === password);
}

// Tạo user mới
export async function createUser(user) {
  const res = await api.post("/users", user);
  return res.data;
}

// ----- Đơn hàng -----
// Tạo đơn "đúng một lần": mã đơn (id) do trình duyệt sinh và cũng là mã tra cứu clientRef.
// Gọi lại với cùng mã (vd sau lỗi mạng, hoặc bước kiểm tra lại ở giỏ hàng) không bao giờ ra đơn thứ hai.
export async function createOrder(order) {
  const ref = order.clientRef || (order.id != null ? String(order.id) : newClientRef());
  return postOnce("/orders", { id: ref, ...order, clientRef: ref });
}
// Tìm đơn theo mã do trình duyệt sinh (null nếu chưa có)
export async function findOrderByRef(ref) {
  return findByRef("/orders", ref);
}

// Lấy một nhóm đơn theo mã (mỗi lượt tối đa 40 mã: /orders?id=a&id=b…). Chỉ giữ đúng những đơn được hỏi
// (phòng trường hợp máy chủ bỏ qua bộ lọc và trả cả danh sách). Đơn đã xóa thì không có trong kết quả.
export async function getOrdersByIds(ids = []) {
  const want = [...new Set(ids.map(String).filter(Boolean))];
  const out = [];
  for (let i = 0; i < want.length; i += 40) {
    const chunk = want.slice(i, i + 40);
    const res = await api.get("/orders", { params: { id: chunk }, paramsSerializer: { indexes: null } });
    const set = new Set(chunk);
    (Array.isArray(res.data) ? res.data : []).forEach((o) => { if (set.has(String(o.id))) out.push(o); });
  }
  return out;
}

export async function getOrders() {
  const res = await api.get("/orders");
  return res.data;
}

export async function getOrdersByUser(userId) {
  // Lọc client-side: json-server v1 so khớp kiểu nghiêm ngặt nên ?userId=2 (số) không khớp "2" (chuỗi)
  const res = await api.get("/orders");
  return (res.data || []).filter((o) => String(o.userId) === String(userId));
}

export async function getOrderById(id) {
  try {
    const res = await api.get(`/orders/${encodeURIComponent(id)}`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function updateOrderStatus(id, status) {
  const res = await api.patch(`/orders/${encodeURIComponent(id)}`, { status });
  return res.data;
}

// Cập nhật nhiều field của đơn hàng (vd: { status }) — dùng ở trang nhân viên
export async function updateOrder(id, patch) {
  const res = await api.patch(`/orders/${encodeURIComponent(id)}`, patch);
  return res.data;
}

// Xóa hẳn 1 đơn khỏi hệ thống — chỉ dùng để dọn đơn đã kết thúc ở trang nhân viên/quản trị
export async function deleteOrder(id) {
  await api.delete(`/orders/${encodeURIComponent(id)}`);
}

// ----- Sản phẩm (ghi) — dùng cho admin import / nhân viên cập nhật tồn kho -----
export async function createProduct(data) {
  const res = await api.post("/products", data);
  return res.data;
}

export async function updateProduct(id, patch) {
  const res = await api.patch(`/products/${encodeURIComponent(id)}`, patch);
  return res.data;
}

export async function deleteProduct(id) {
  await api.delete(`/products/${encodeURIComponent(id)}`);
}

// ----- Banner (slideshow trang chủ) -----
export async function getBanners() {
  const res = await api.get("/banners");
  return res.data;
}

export async function createBanner(data) {
  const res = await api.post("/banners", data);
  return res.data;
}

export async function updateBanner(id, patch) {
  const res = await api.patch(`/banners/${encodeURIComponent(id)}`, patch);
  return res.data;
}

export async function deleteBanner(id) {
  await api.delete(`/banners/${encodeURIComponent(id)}`);
}

// ----- Site Settings (địa chỉ, phí ship, giờ mở cửa...) -----
export async function getSettings() {
  try {
    const res = await api.get("/settings");
    // json-server trả về object nếu key là single, mảng nếu là collection
    if (Array.isArray(res.data)) return res.data[0] || null;
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function updateSettings(patch) {
  // Dùng PUT thay vì PATCH để chắc chắn chấp nhận trên cả single-object và collection
  try {
    const res = await api.patch("/settings", patch);
    return res.data;
  } catch (err) {
    // Nếu là collection, fallback về PATCH /settings/shop
    const res2 = await api.patch("/settings/shop", patch);
    return res2.data;
  }
}

// ----- Danh mục (CRUD cho admin) -----
export async function createCategory(data) {
  const res = await api.post("/categories", data);
  return res.data;
}

export async function updateCategory(id, patch) {
  const res = await api.patch(`/categories/${encodeURIComponent(id)}`, patch);
  return res.data;
}

export async function deleteCategory(id) {
  await api.delete(`/categories/${encodeURIComponent(id)}`);
}

// ----- Coupon (CRUD đầy đủ cho admin) -----
export async function getCoupons() {
  const res = await api.get("/coupons");
  return res.data;
}

export async function createCoupon(data) {
  const res = await api.post("/coupons", data);
  return res.data;
}

export async function deleteCoupon(id) {
  await api.delete(`/coupons/${encodeURIComponent(id)}`);
}

// ----- Người dùng (CRUD cho admin) -----
export async function updateUser(id, patch) {
  const res = await api.patch(`/users/${encodeURIComponent(id)}`, patch);
  return res.data;
}

export async function deleteUser(id) {
  await api.delete(`/users/${encodeURIComponent(id)}`);
}

// ----- Ngày lễ (CRUD cho admin) -----
export async function getHolidays() {
  const res = await api.get("/holidays");
  return res.data;
}

export async function createHoliday(data) {
  const res = await api.post("/holidays", data);
  return res.data;
}

export async function deleteHoliday(id) {
  await api.delete(`/holidays/${encodeURIComponent(id)}`);
}

export async function getUsers() {
  const res = await api.get("/users");
  return res.data;
}

// ----- Promotions -----
export async function getPromotions() {
  const res = await api.get("/promotions");
  return res.data;
}

export async function createPromotion(data) {
  const res = await api.post("/promotions", data);
  return res.data;
}

export async function updatePromotion(id, patch) {
  const res = await api.patch(`/promotions/${encodeURIComponent(id)}`, patch);
  return res.data;
}

export async function deletePromotion(id) {
  await api.delete(`/promotions/${encodeURIComponent(id)}`);
}

// ----- Coupons -----
export async function getCouponByCode(code) {
  const res = await api.get("/coupons", { params: { code } });
  const list = res.data;
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

export async function updateCoupon(id, data) {
  const res = await api.patch(`/coupons/${encodeURIComponent(id)}`, data);
  return res.data;
}

// ----- Nhãn sản phẩm: nhóm nhãn + nhãn (admin quản lý) -----
export async function getLabelGroups() {
  const res = await api.get("/labelGroups");
  return res.data;
}
export async function createLabelGroup(data) {
  const res = await api.post("/labelGroups", data);
  return res.data;
}
export async function updateLabelGroup(id, patch) {
  const res = await api.patch(`/labelGroups/${encodeURIComponent(id)}`, patch);
  return res.data;
}
export async function deleteLabelGroup(id) {
  await api.delete(`/labelGroups/${encodeURIComponent(id)}`);
}
export async function getLabels() {
  const res = await api.get("/labels");
  return res.data;
}
export async function createLabel(data) {
  const res = await api.post("/labels", data);
  return res.data;
}
export async function updateLabel(id, patch) {
  const res = await api.patch(`/labels/${encodeURIComponent(id)}`, patch);
  return res.data;
}
export async function deleteLabel(id) {
  await api.delete(`/labels/${encodeURIComponent(id)}`);
}

// ----- Reviews (đánh giá + bình luận) -----
export async function getReviews() {
  const res = await api.get("/reviews");
  return res.data;
}

export async function createReview(data) {
  const res = await api.post("/reviews", data);
  return res.data;
}

export async function updateReview(id, patch) {
  const res = await api.patch(`/reviews/${encodeURIComponent(id)}`, patch);
  return res.data;
}

export async function deleteReview(id) {
  await api.delete(`/reviews/${encodeURIComponent(id)}`);
}

// ----- Lấy 1 user theo id -----
export async function getUserById(id) {
  try {
    const res = await api.get(`/users/${encodeURIComponent(id)}`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

// ----- Chat: Conversations + Messages -----
export async function getConversations() {
  const res = await api.get("/conversations");
  return res.data;
}
export async function getConversationByCustomer(customerId) {
  const res = await api.get("/conversations");
  const list = (res.data || []).filter((c) => String(c.customerId) === String(customerId));
  return list.length ? list[0] : null;
}
export async function createConversation(data) {
  const res = await api.post("/conversations", data);
  return res.data;
}
export async function updateConversation(id, patch) {
  const res = await api.patch(`/conversations/${encodeURIComponent(id)}`, patch);
  return res.data;
}
export async function getMessages(conversationId) {
  const res = await api.get("/messages");
  return (res.data || []).filter((m) => String(m.conversationId) === String(conversationId));
}
export async function createMessage(data) {
  const res = await api.post("/messages", data);
  return res.data;
}

// ----- Thông báo (web) -----
export async function getNotifications(userId) {
  const res = await api.get("/notifications");
  return (res.data || []).filter((n) => String(n.userId) === String(userId));
}
export async function createNotification(data) {
  const res = await api.post("/notifications", data);
  return res.data;
}
export async function updateNotification(id, patch) {
  const res = await api.patch(`/notifications/${encodeURIComponent(id)}`, patch);
  return res.data;
}

// ----- Hộp thư (email outbox mô phỏng + lưu vết email đã gửi) -----
export async function getMailbox(params = {}) {
  const res = await api.get("/mailbox", { params });
  return res.data;
}
export async function createMail(data) {
  const res = await api.post("/mailbox", data);
  return res.data;
}

// ----- Giao dịch ví -----
export async function getWalletTransactions(params = {}) {
  const res = await api.get("/walletTransactions");
  let list = res.data || [];
  if (params.userId != null) list = list.filter((t) => String(t.userId) === String(params.userId));
  if (params.type) list = list.filter((t) => t.type === params.type);
  if (params.status) list = list.filter((t) => t.status === params.status);
  return list;
}
export async function createWalletTransaction(data) {
  return postOnce("/walletTransactions", data); // giao dịch ví cũng không được ghi trùng khi mạng chập chờn
}
export async function updateWalletTransaction(id, patch) {
  const res = await api.patch(`/walletTransactions/${encodeURIComponent(id)}`, patch);
  return res.data;
}

// ----- Nhật ký thao tác nhân viên (audit log — chống gian lận) -----
export async function getAuditLog(params = {}) {
  const res = await api.get("/auditLog", { params });
  return res.data;
}
export async function createAuditLog(data) {
  const res = await api.post("/auditLog", data);
  return res.data;
}
// Một trang nhật ký đã lọc / sắp xếp sẵn ở máy chủ (json-server 0.17: _page, _limit, _sort, _order, <field>_gte/_lte,
// <field>_like là biểu thức chính quy không phân biệt hoa thường, lặp lại một khóa = "hoặc"). Trả { items, total }:
// total lấy từ header X-Total-Count. Mảng được gửi dạng lặp khóa (action=a&action=b), không phải action[]=…
// Lưu ý 0.17: lọc theo trường mà CHƯA bản ghi nào có thì máy chủ bỏ qua bộ lọc → nơi gọi phải tự kiểm tra lại kết quả.
export async function getAuditLogPage(params = {}) {
  const res = await api.get("/auditLog", { params, paramsSerializer: { indexes: null } });
  const total = Number(res.headers?.["x-total-count"]);
  const items = Array.isArray(res.data) ? res.data : [];
  return { items, total: Number.isFinite(total) ? total : items.length };
}

// ----- Đăng ký nhận thông báo có hàng lại -----
export async function getStockAlerts(params = {}) {
  const res = await api.get("/stockAlerts");
  let list = res.data || [];
  if (params.userId != null) list = list.filter((a) => String(a.userId) === String(params.userId));
  if (params.productId != null) list = list.filter((a) => String(a.productId) === String(params.productId));
  if (params.notified != null) list = list.filter((a) => !!a.notified === !!params.notified);
  return list;
}
export async function createStockAlert(data) {
  const res = await api.post("/stockAlerts", data);
  return res.data;
}
export async function updateStockAlert(id, patch) {
  const res = await api.patch(`/stockAlerts/${encodeURIComponent(id)}`, patch);
  return res.data;
}
export async function deleteStockAlert(id) {
  await api.delete(`/stockAlerts/${encodeURIComponent(id)}`);
}

// Kiểm tra lỗi có phải do không kết nối được server không (server tắt, sai cổng...)
export function isNetworkError(err) {
  return !err.response;
}
