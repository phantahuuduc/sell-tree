// ==========================================================
// storage.js — Async storage wrapper cho giỏ hàng + người dùng.
// Tất cả hàm đọc/ghi đều async, sẵn sàng chuyển sang IndexedDB
// hoặc server-side storage trong tương lai mà không sửa caller.
// ==========================================================

const CART_PREFIX = "cart_";
const CART_GUEST  = "cart";
const USER_KEY    = "user";

// ===== Async Storage Layer =====
// Giỏ hàng dùng localStorage (bền vững giữa các phiên, theo từng user).
async function storageGet(key) {
  return new Promise((resolve) => {
    try {
      resolve(localStorage.getItem(key));
    } catch {
      resolve(null);
    }
  });
}

async function storageSet(key, value) {
  return new Promise((resolve, reject) => {
    try {
      localStorage.setItem(key, value);
      resolve();
    } catch (err) {
      console.warn("Storage write failed:", err);
      reject(err);
    }
  });
}

async function storageRemove(key) {
  return new Promise((resolve) => {
    try {
      localStorage.removeItem(key);
    } catch { /* bỏ qua */ }
    resolve();
  });
}

// ===== Session Storage Layer (đăng nhập theo TỪNG TAB) =====
// Phiên đăng nhập dùng sessionStorage: mỗi tab độc lập, mở tab mới = chưa đăng nhập,
// đóng tab = đăng xuất tab đó. Cho phép mở 1 tab khách + 1 tab nhân viên song song.
function sessionGetRaw(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSetRaw(key, value) {
  try { sessionStorage.setItem(key, value); } catch (err) { console.warn("Session write failed:", err); }
}
function sessionRemoveRaw(key) {
  try { sessionStorage.removeItem(key); } catch { /* bỏ qua */ }
}

async function readJSON(key, fallback) {
  const raw = await storageGet(key);
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key, data) {
  await storageSet(key, JSON.stringify(data));
}

// ----- Người dùng (async) -----

export async function getUser() {
  const raw = sessionGetRaw(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return user && typeof user === "object" && user.name ? user : null;
  } catch {
    return null;
  }
}

export async function setUser(user) {
  sessionSetRaw(USER_KEY, JSON.stringify(user));
  await migrateGuestCart(user);
}

export async function logout() {
  sessionRemoveRaw(USER_KEY);
}

// ----- Phân quyền theo vai trò (role) -----

export async function getUserRole() {
  const user = await getUser();
  return user?.role || "guest";
}

export async function isAdmin() {
  return (await getUserRole()) === "admin";
}

export async function isStaff() {
  return (await getUserRole()) === "staff";
}

export async function isCustomer() {
  const role = await getUserRole();
  return role === "user" || role === "guest";
}

// Guard cho trang nội bộ: chỉ cho vào nếu role nằm trong allowedRoles.
// Chưa đăng nhập → sang login.html (nhớ URL để quay lại).
// Sai quyền → báo rồi về redirectUrl.
export async function requireRole(allowedRoles, redirectUrl = "index.html") {
  const user = await getUser();
  if (!user) {
    sessionStorage.setItem("redirectAfterLogin", window.location.href);
    window.location.href = "login.html";
    return false;
  }
  if (!allowedRoles.includes(user.role)) {
    alert(`Bạn không có quyền truy cập trang này. Vai trò hiện tại: ${user.role || "khách"}.`);
    window.location.href = redirectUrl;
    return false;
  }
  // Đối chiếu với máy chủ: phiên lưu trong trình duyệt có thể bị sửa tay (tự ghi role "admin").
  // Tài khoản không tồn tại / khác email / khác vai trò → đăng xuất, về trang đăng nhập.
  // (Lỗi mạng thì để trang tự báo lỗi tải dữ liệu như trước.)
  try {
    const { getUserById } = await import("./api.js");
    const real = await getUserById(user.id);
    const same = real && String(real.email || "").toLowerCase() === String(user.email || "").toLowerCase();
    if (!same || !allowedRoles.includes(real.role)) {
      await logout();
      alert("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      sessionStorage.setItem("redirectAfterLogin", window.location.href);
      window.location.href = "login.html";
      return false;
    }
  } catch { /* máy chủ chưa bật — trang sẽ tự hiện lỗi tải dữ liệu */ }
  return true;
}

// ----- Cart key theo user -----
async function cartKey() {
  const user = await getUser();
  return user ? CART_PREFIX + String(user.id) : CART_GUEST;
}

async function migrateGuestCart(user) {
  if (!user) return;
  const guestRaw = await storageGet(CART_GUEST);
  if (!guestRaw) return;
  try {
    const guestCart = JSON.parse(guestRaw);
    if (!Array.isArray(guestCart) || guestCart.length === 0) return;

    const userKey = CART_PREFIX + String(user.id);
    const userCart = await readJSON(userKey, []);
    const merged = Array.isArray(userCart) ? [...userCart] : [];

    guestCart.forEach((gItem) => {
      const existing = merged.find((m) => String(m.id) === String(gItem.id));
      if (existing) {
        existing.quantity += gItem.quantity;
      } else {
        merged.push(gItem);
      }
    });

    await writeJSON(userKey, merged);
    await storageRemove(CART_GUEST);
  } catch {
    // bỏ qua lỗi parse
  }
}

// ----- Giỏ hàng (async) -----
export async function getCart() {
  const key = await cartKey();
  const cart = await readJSON(key, []);
  return Array.isArray(cart) ? cart : [];
}

export async function setCart(cart) {
  const key = await cartKey();
  await writeJSON(key, cart);
}

// Thêm sản phẩm: cộng dồn nếu đã có.
// selectedVariant (optional): giữ nguyên hỗ trợ variants từ V5.
// Thêm từ thẻ sản phẩm (không chọn size) mà cây có nhiều size → lấy size đầu tiên, giống mặc định của trang chi tiết,
// để cùng một chậu không thành 2 dòng trong giỏ. maxQty = tồn kho, tính CHUNG cho mọi size của cùng một cây.
export async function addToCart(product, qty = 1, maxQty = Infinity, selectedVariant = null) {
  if (isShopRole(await getUser())) { notifyShopRole(); return getCart(); }
  if (!selectedVariant && Array.isArray(product.variants) && product.variants.length) selectedVariant = product.variants[0];
  const cart = await getCart();
  const cartKeyId = selectedVariant
    ? `${product.id}::${selectedVariant.label}`
    : String(product.id);
  const price = selectedVariant ? selectedVariant.price : product.price;
  // Số còn được thêm = tồn kho − số chậu cùng cây (mọi size) đã có trong giỏ
  const inCart = cart
    .filter((item) => cartProductId(item) === String(product.id))
    .reduce((s, item) => s + (Number(item.quantity) || 0), 0);
  const added = Math.max(0, Math.min(qty, maxQty - inCart));
  // Giỏ đã có đủ số tồn kho → không thêm; cart.added = 0 để nơi gọi báo cho khách thay vì "Đã thêm"
  if (added <= 0) { cart.added = 0; return cart; }

  const found = cart.find((item) => String(item.id) === cartKeyId);
  if (found) {
    found.quantity += added;
  } else {
    const item = {
      id: cartKeyId,
      productId: String(product.id),
      name: product.name,
      price,
      image: product.image,
      quantity: added,
    };
    if (selectedVariant) {
      item.variantLabel = selectedVariant.label;
      item.height = selectedVariant.height;
      item.selectedPrice = selectedVariant.price;
    }
    cart.push(item);
  }
  await setCart(cart);
  cart.added = added; // số chậu thật sự được thêm (có thể ít hơn qty khi chạm tồn kho)
  return cart;
}

// Câu báo dùng chung khi giỏ đã có đủ số chậu còn trong kho
export function stockFullMessage(product) {
  return `Giỏ của bạn đã có đủ ${Number(product.stock) || 0} chậu "${product.name}" còn trong kho.`;
}

// Mã cây của một dòng giỏ ("14::Nhỏ — 12cm" → "14")
export function cartProductId(item) {
  return String(item.productId || String(item.id).split("::")[0]);
}

// maxQty (tùy chọn): tồn kho của cây — số mới bị chặn để tổng mọi size của cây đó không vượt tồn kho
export async function updateCartQuantity(id, quantity, maxQty = Infinity) {
  const rawCart = await getCart();
  const target = rawCart.find((item) => String(item.id) === String(id));
  if (target && Number.isFinite(maxQty)) {
    const others = rawCart
      .filter((item) => item !== target && cartProductId(item) === cartProductId(target))
      .reduce((s, item) => s + (Number(item.quantity) || 0), 0);
    quantity = Math.min(quantity, Math.max(0, maxQty - others));
  }
  const cart = rawCart
    .map((item) => (String(item.id) === String(id) ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);
  await setCart(cart);
  return cart;
}

export async function removeFromCart(id) {
  const rawCart = await getCart();
  const cart = rawCart.filter((item) => String(item.id) !== String(id));
  await setCart(cart);
  return cart;
}

export async function clearCart() {
  const key = await cartKey();
  await storageRemove(key);
}

export async function getCartCount() {
  const cart = await getCart();
  return cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

export async function getCartTotal() {
  const cart = await getCart();
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ----- Kiểm tra đăng nhập trước khi thêm giỏ (async) -----
// Nhân viên / quản trị không được mua hàng (tránh tự duyệt đơn của chính mình, lẫn số liệu doanh thu)
export function isShopRole(user) {
  return !!user && (user.role === "staff" || user.role === "admin");
}
function notifyShopRole() {
  import("./ui.js")
    .then((m) => m.showToast("Tài khoản nhân viên / quản trị không thể mua hàng. Vui lòng dùng tài khoản khách.", { icon: "alert" }))
    .catch(() => alert("Tài khoản nhân viên / quản trị không thể mua hàng."));
}

export async function requireLogin(message = "Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.") {
  const user = await getUser();
  if (isShopRole(user)) { notifyShopRole(); return false; }
  if (user) return true;

  sessionStorage.setItem("redirectAfterLogin", window.location.href);

  const confirmed = await showLoginModal(message);
  if (confirmed) {
    window.location.href = "login.html";
  }
  return false;
}

// ----- Custom Modal thay thế alert() -----
function showLoginModal(message) {
  return new Promise((resolve) => {
    document.getElementById("loginModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "loginModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-box animate__animated animate__fadeInUp animate__faster">
        <div class="modal-box__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2E5E3A" stroke-width="1.5">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
        </div>
        <p class="modal-box__msg">${message}</p>
        <div class="modal-box__actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">Để sau</button>
          <button type="button" class="btn btn--primary" data-action="login">Đăng nhập</button>
        </div>
      </div>
    `;

    modal.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "login") {
        cleanup();
        resolve(true);
      } else if (action === "cancel" || e.target === modal) {
        cleanup();
        resolve(false);
      }
    });

    function onKey(e) {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    }

    function cleanup() {
      document.removeEventListener("keydown", onKey);
      const box = modal.querySelector(".modal-box");
      if (box) {
        box.classList.remove("animate__fadeInUp");
        box.classList.add("animate__fadeOutDown");
        setTimeout(() => modal.remove(), 250);
      } else {
        modal.remove();
      }
    }

    document.addEventListener("keydown", onKey);
    document.body.appendChild(modal);
    modal.querySelector("[data-action='login']")?.focus();
  });
}
