// ==========================================================
// favorites.js — Quản lý danh sách yêu thích (❤) dùng chung.
//  - Đã đăng nhập: lưu vào user.favorites (json-server) + đồng bộ session.
//  - Chưa đăng nhập: lưu tạm ở localStorage của trình duyệt; khi đăng nhập
//    danh sách tạm được GỘP vào tài khoản rồi xóa bản tạm.
// Mỗi lần danh sách đổi sẽ phát sự kiện "favorites:change" để header
// cập nhật số trên icon trái tim.
// ==========================================================
import { getUser, setUser } from "./storage.js";
import { updateUser, getUserById } from "./api.js";
import { showToast } from "./ui.js";
import { heartBurst } from "./fx.js";

const GUEST_KEY = "favorites_guest";

let cachedFavs = null;   // mảng id dạng string
let loaded = false;

function readGuest() {
  try {
    const arr = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch { return []; }
}
function writeGuest(ids) {
  try {
    if (ids.length) localStorage.setItem(GUEST_KEY, JSON.stringify(ids));
    else localStorage.removeItem(GUEST_KEY);
  } catch { /* trình duyệt chặn localStorage → chỉ giữ trong phiên */ }
}

function announce() {
  window.dispatchEvent(new CustomEvent("favorites:change", { detail: { count: cachedFavs.length } }));
}

async function loadFavs() {
  const user = await getUser();
  if (!user) {
    cachedFavs = readGuest();
    loaded = true;
    return cachedFavs;
  }
  const fresh = await getUserById(user.id).catch(() => user);
  cachedFavs = ((fresh && fresh.favorites) || []).map(String);

  // Khách vừa đăng nhập: gộp các món đã thích lúc chưa đăng nhập vào tài khoản
  const guest = user.role === "user" ? readGuest() : [];
  const extra = guest.filter((id) => !cachedFavs.includes(id));
  if (extra.length) {
    const merged = [...cachedFavs, ...extra];
    try {
      await updateUser(user.id, { favorites: merged });
      await setUser({ ...user, favorites: merged });
      cachedFavs = merged;
      writeGuest([]);
    } catch { /* gộp lỗi → giữ bản tạm, lần sau thử lại */ }
  } else if (guest.length) {
    writeGuest([]);
  }
  loaded = true;
  return cachedFavs;
}

export async function getFavorites() {
  if (!loaded) await loadFavs();
  return cachedFavs.slice();
}

export async function getFavoriteCount() {
  if (!loaded) await loadFavs();
  return cachedFavs.length;
}

export async function isFavorite(productId) {
  if (!loaded) await loadFavs();
  return cachedFavs.includes(String(productId));
}

// Đánh dấu trạng thái các nút [data-fav] trong 1 vùng theo favorites hiện tại.
export async function markFavorites(root = document) {
  if (!loaded) await loadFavs();
  root.querySelectorAll("[data-fav]").forEach((btn) => {
    const fav = cachedFavs.includes(String(btn.dataset.fav));
    btn.classList.toggle("is-active", fav);
    btn.setAttribute("aria-pressed", fav ? "true" : "false");
  });
}

// Trả về true (vừa thích) / false (vừa bỏ thích) / null (lỗi lưu).
export async function toggleFavorite(productId) {
  const user = await getUser();
  if (!loaded) await loadFavs();
  const id = String(productId);
  const before = cachedFavs.slice();
  const idx = cachedFavs.indexOf(id);
  let nowFav;
  if (idx >= 0) { cachedFavs.splice(idx, 1); nowFav = false; }
  else { cachedFavs.push(id); nowFav = true; }

  if (!user) {
    writeGuest(cachedFavs);
    announce();
    return nowFav;
  }
  try {
    await updateUser(user.id, { favorites: cachedFavs.slice() });
    await setUser({ ...user, favorites: cachedFavs.slice() });
  } catch (err) {
    cachedFavs = before; // lưu lỗi → trả lại trạng thái cũ
    showToast("Lỗi lưu yêu thích: " + err.message, { icon: "alert" });
    return null;
  }
  announce();
  return nowFav;
}

// Gắn event delegation xử lý click nút tim trong 1 vùng.
export function initFavoriteButtons(root = document) {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-fav]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.busy) return; // chống bấm đúp khi đang lưu
    btn.dataset.busy = "1";
    const id = String(btn.dataset.fav);
    const nowFav = await toggleFavorite(id);
    delete btn.dataset.busy;
    if (nowFav === null) return;
    // đồng bộ mọi nút cùng id trên trang
    document.querySelectorAll("[data-fav]").forEach((b) => {
      if (String(b.dataset.fav) === id) {
        b.classList.toggle("is-active", nowFav);
        b.setAttribute("aria-pressed", nowFav ? "true" : "false");
      }
    });
    heartBurst(btn, nowFav);
    const guest = !(await getUser());
    showToast(
      nowFav
        ? (guest ? "❤ Đã lưu vào yêu thích trên máy này — đăng nhập để đồng bộ" : "❤ Đã thêm vào yêu thích")
        : "Đã bỏ yêu thích",
      nowFav ? { link: { href: "wishlist.html", label: "Xem" } } : {},
    );
  });
}
