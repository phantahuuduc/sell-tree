// ==========================================================
// wishlist.js — Trang "Yêu thích" (wishlist.html).
// Xem được cả khi CHƯA đăng nhập (danh sách lưu trên máy); đăng nhập thì
// danh sách tạm tự gộp vào tài khoản (xem favorites.js).
// Mỗi món: Thêm vào giỏ (ảnh bay vào icon giỏ) + Bỏ thích.
// ==========================================================
import { getUser, addToCart, requireLogin, stockFullMessage } from "./storage.js";
import { getProducts } from "./api.js";
import {
  initPage, formatPrice, escapeHTML, showToast, updateCartBadge, bumpCartIcon,
  animateAddButton, attachImageFallback, renderSkeletonCards,
} from "./ui.js";
import { getFavorites, toggleFavorite } from "./favorites.js";
import { ensurePromotions, getPriceInfo } from "./sale.js";
import { flyToCart } from "./fx.js";

await initPage();

const grid = document.getElementById("wishlistGrid");
const countEl = document.getElementById("wishlistCount");
const syncBox = document.getElementById("wishlistSync");
const user = await getUser();

// Khách chưa đăng nhập: nhắc đăng nhập để đồng bộ (không chặn xem)
if (!user && syncBox) {
  syncBox.hidden = false;
  syncBox.querySelector("a")?.addEventListener("click", () => {
    sessionStorage.setItem("redirectAfterLogin", window.location.href);
  });
}

let products = [];

function emptyState() {
  grid.innerHTML = "";
  grid.insertAdjacentHTML("afterend", `
    <div class="state" id="wishlistEmpty">
      <p>Bạn chưa thích cây nào. Bấm biểu tượng ♥ trên mỗi cây để lưu lại đây.</p>
      <a class="btn btn--primary" href="index.html#catalog">Khám phá cây cảnh</a>
    </div>`);
}

function setCount(n) {
  if (countEl) countEl.textContent = n ? `${n} sản phẩm` : "";
}

function cardHtml(p, i) {
  const url = `product-detail.html?id=${encodeURIComponent(p.id)}`;
  const pi = getPriceInfo(p);
  const out = Number(p.stock) <= 0;
  return `
    <li class="wish-card" data-id="${escapeHTML(String(p.id))}" style="--i:${i}">
      <a class="wish-card__media" href="${url}" tabindex="-1" aria-hidden="true">
        ${out ? `<span class="wish-card__stock">Hết hàng</span>` : ""}
        <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.imageAlt || p.name)}" width="400" height="500" loading="lazy" decoding="async" data-fallback>
      </a>
      <div class="wish-card__body">
        <a class="wish-card__name" href="${url}">${escapeHTML(p.name)}</a>
        ${p.scientificName ? `<p class="wish-card__sci">${escapeHTML(p.scientificName)}</p>` : ""}
        <p class="wish-card__price">${formatPrice(pi.price)}${pi.original ? `<s>${formatPrice(pi.original)}</s>` : ""}</p>
        <div class="wish-card__actions">
          <button class="btn ${out ? "btn--ghost" : "btn--primary"}" type="button" data-wish-add="${escapeHTML(String(p.id))}"
            ${out ? 'title="Hết hàng — đặt trước, giao khi có hàng"' : ""}><span class="btn__label">${out ? "Đặt trước" : "Thêm vào giỏ"}</span></button>
          <button class="btn btn--ghost" type="button" data-wish-remove="${escapeHTML(String(p.id))}">♥ Bỏ thích</button>
        </div>
      </div>
    </li>`;
}

async function render() {
  document.getElementById("wishlistEmpty")?.remove();
  grid.innerHTML = renderSkeletonCards(4); // khung chờ trong lúc tải
  let favIds = [];
  try {
    [favIds, products] = await Promise.all([getFavorites(), getProducts(), ensurePromotions().catch(() => {})]);
  } catch {
    grid.innerHTML = "";
    grid.insertAdjacentHTML("afterend", `<div class="state" id="wishlistEmpty"><p>Không tải được danh sách. Kiểm tra máy chủ dữ liệu rồi thử lại.</p><button class="btn btn--primary" type="button" id="wishRetry">Thử lại</button></div>`);
    document.getElementById("wishRetry")?.addEventListener("click", render);
    return;
  }
  // Giữ thứ tự: món thích gần nhất lên đầu; bỏ qua id của sản phẩm đã bị xóa khỏi shop
  const list = favIds.slice().reverse()
    .map((id) => products.find((p) => String(p.id) === String(id)))
    .filter(Boolean);
  setCount(list.length);
  if (!list.length) { emptyState(); return; }
  grid.innerHTML = list.map(cardHtml).join("");
  attachImageFallback(grid);
}

grid.addEventListener("click", async (e) => {
  const addBtn = e.target.closest("[data-wish-add]");
  const rmBtn = e.target.closest("[data-wish-remove]");

  if (addBtn && !addBtn.disabled) {
    if (!(await requireLogin())) return;
    const p = products.find((x) => String(x.id) === addBtn.dataset.wishAdd);
    if (!p) return;
    const res = await addToCart(p, 1, p.stock || Infinity);
    if (res.added === 0) { showToast(stockFullMessage(p), { icon: "alert" }); return; }
    animateAddButton(addBtn);
    flyToCart(addBtn.closest(".wish-card")?.querySelector("img")).then(async () => {
      await updateCartBadge();
      bumpCartIcon();
    });
    showToast(`Đã thêm "${p.name}" vào giỏ hàng`, { image: p.image, link: { href: "cart.html", label: "Xem giỏ" } });
    return;
  }

  if (rmBtn) {
    rmBtn.disabled = true;
    const id = rmBtn.dataset.wishRemove;
    const res = await toggleFavorite(id);
    if (res === null) { rmBtn.disabled = false; return; }
    if (res === true) { await toggleFavorite(id); } // phòng trường hợp lệch trạng thái: bấm "bỏ" thì kết quả phải là bỏ
    const card = rmBtn.closest(".wish-card");
    card.classList.add("is-removing");
    setTimeout(() => {
      card.remove();
      const left = grid.querySelectorAll(".wish-card").length;
      setCount(left);
      if (!left) emptyState();
    }, 300);
    showToast("Đã bỏ yêu thích");
  }
});

render();
import("./chat.js").then((m) => m.initCustomerChat()).catch(() => {});
