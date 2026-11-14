// ==========================================================
// shop-extras.js — Tiện ích mua sắm trên header (nạp động từ ui.js; lỗi cũng không ảnh hưởng trang):
//   1. Giỏ hàng trượt: bấm icon giỏ (hoặc "Xem giỏ" trên thông báo) → ngăn kéo trượt từ cạnh phải,
//      xem nhanh / đổi số lượng / xóa mà không rời trang. Giá tính lại theo khuyến mãi đang chạy,
//      cùng công thức với trang giỏ hàng.
//   2. Menu danh mục thả xuống dưới mục "Sản phẩm" trên thanh điều hướng (màn hình rộng).
// ==========================================================
import { getCart, updateCartQuantity, removeFromCart, getUser, cartProductId } from "./storage.js";
import { getProducts, getCategories, getSettings } from "./api.js";
import { formatPrice, escapeHTML, updateCartBadge, attachImageFallback, imgAttrs } from "./ui.js";
import { ensurePromotions, getPriceInfo } from "./sale.js";

const PAGE = (location.pathname.split("/").pop() || "index.html").toLowerCase();

// ---------- 1. Giỏ hàng trượt ----------
let drawer = null;
let lastFocus = null;

// Cùng cách tính với priceCart ở cart.html: giá niêm yết hiện tại (theo size) trừ khuyến mãi đang chạy
async function pricedCart() {
  const [items, products] = await Promise.all([getCart(), getProducts().catch(() => []), ensurePromotions().catch(() => {})]);
  return items.map((it) => {
    const p = products.find((x) => String(x.id) === String(it.productId || it.id));
    if (!p) return { ...it, unitPrice: Number(it.price) || 0, max: Infinity };
    const variant = it.variantLabel ? (p.variants || []).find((v) => v.label === it.variantLabel) : null;
    const base = variant ? variant.price : (it.variantLabel ? Number(it.price) || p.price : p.price);
    return { ...it, unitPrice: getPriceInfo(p, base).price, max: Number(p.stock) > 0 ? Number(p.stock) : Infinity };
  });
}

function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove("is-open");
  document.body.classList.remove("is-locked");
  document.removeEventListener("keydown", onDrawerKey);
  const el = drawer;
  drawer = null;
  setTimeout(() => el.remove(), 300);
  lastFocus?.focus?.();
}
function onDrawerKey(e) {
  if (e.key === "Escape" && !document.querySelector(".modal-overlay")) closeDrawer();
}

async function renderDrawer() {
  if (!drawer) return;
  const body = drawer.querySelector(".mini-cart__body");
  const foot = drawer.querySelector(".mini-cart__foot");
  let items;
  try { items = await pricedCart(); } catch { items = null; }
  if (!drawer) return;
  if (!items) {
    body.innerHTML = `<p class="mini-cart__empty">Không tải được giỏ hàng. Vui lòng thử lại.</p>`;
    foot.hidden = true;
    return;
  }
  if (!items.length) {
    body.innerHTML = `<div class="mini-cart__empty"><p>Giỏ hàng chưa có chậu cây nào.</p><a class="btn btn--primary" href="index.html#catalog">Xem sản phẩm</a></div>`;
    foot.hidden = true;
    return;
  }
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  body.innerHTML = `<ul class="mini-cart__list">${items.map((it) => `
    <li class="mini-cart__item" data-id="${escapeHTML(String(it.id))}">
      <img ${imgAttrs(it.image, { small: true })} alt="" width="56" height="70" data-fallback>
      <div class="mini-cart__info">
        <strong>${escapeHTML(it.name)}</strong>
        ${it.variantLabel ? `<small>${escapeHTML(it.variantLabel)}</small>` : ""}
        <span class="mini-cart__price">${formatPrice(it.unitPrice)}</span>
      </div>
      <div class="mini-cart__qty">
        <button type="button" data-mini-qty="-1" aria-label="Giảm số lượng">−</button>
        <span aria-live="polite">${it.quantity}</span>
        <button type="button" data-mini-qty="1" aria-label="Tăng số lượng" data-max="${Number.isFinite(it.max) ? it.max : ""}"
          ${items.filter((x) => cartProductId(x) === cartProductId(it)).reduce((s, x) => s + x.quantity, 0) >= it.max ? `disabled title="Đã chọn hết ${it.max} chậu còn trong kho"` : ""}>+</button>
      </div>
      <button type="button" class="mini-cart__remove" data-mini-remove aria-label="Xóa ${escapeHTML(it.name)} khỏi giỏ">✕</button>
    </li>`).join("")}</ul>`;
  attachImageFallback(body);

  // Thanh tiến độ miễn phí giao hàng (cùng ngưỡng với trang giỏ hàng)
  const settings = (await getSettings().catch(() => null)) || {};
  if (!drawer) return;
  const free = Number(settings.freeShipThreshold ?? 300000);
  const done = free > 0 && subtotal >= free;
  foot.hidden = false;
  foot.querySelector(".mini-cart__ship").innerHTML = free > 0 ? `
    <p>${done ? "🎉 Đơn được <strong>miễn phí giao hàng</strong>" : `🚚 Mua thêm <strong>${formatPrice(free - subtotal)}</strong> để được miễn phí giao hàng`}</p>
    <div class="ship-progress__track${done ? " is-done" : ""}" aria-hidden="true"><i style="transform:scaleX(${Math.min(1, subtotal / free).toFixed(3)})"></i></div>` : "";
  foot.querySelector(".mini-cart__total strong").textContent = formatPrice(subtotal);
}

async function openDrawer() {
  if (drawer) return;
  lastFocus = document.activeElement;
  drawer = document.createElement("div");
  drawer.className = "mini-cart";
  drawer.innerHTML = `
    <div class="mini-cart__scrim" data-mini-close></div>
    <aside class="mini-cart__panel" role="dialog" aria-modal="true" aria-label="Giỏ hàng">
      <header class="mini-cart__head">
        <h2>Giỏ hàng</h2>
        <button type="button" class="mini-cart__close" data-mini-close aria-label="Đóng giỏ hàng">✕</button>
      </header>
      <div class="mini-cart__body"><p class="mini-cart__empty">Đang tải giỏ hàng…</p></div>
      <footer class="mini-cart__foot" hidden>
        <div class="mini-cart__ship"></div>
        <p class="mini-cart__total"><span>Tạm tính</span><strong></strong></p>
        <small>Phí giao và mã giảm giá được tính ở bước thanh toán.</small>
        <a class="btn btn--primary" href="cart.html">Xem giỏ hàng &amp; thanh toán</a>
        <button type="button" class="btn btn--ghost" data-mini-close>Tiếp tục mua sắm</button>
      </footer>
    </aside>`;
  document.body.appendChild(drawer);
  document.body.classList.add("is-locked");
  document.addEventListener("keydown", onDrawerKey);
  setTimeout(() => drawer?.classList.add("is-open"), 20);
  drawer.querySelector(".mini-cart__close").focus({ preventScroll: true });

  drawer.addEventListener("click", async (e) => {
    if (e.target.closest("[data-mini-close]")) { closeDrawer(); return; }
    const li = e.target.closest(".mini-cart__item");
    if (!li) return;
    const id = li.dataset.id;
    const qtyBtn = e.target.closest("[data-mini-qty]");
    if (qtyBtn && !qtyBtn.disabled) {
      const cur = Number(li.querySelector(".mini-cart__qty span").textContent) || 1;
      const next = cur + Number(qtyBtn.dataset.miniQty);
      // Tăng thì chặn theo tồn kho (tính chung mọi size của cây); giảm thì không chặn
      const max = Number(qtyBtn.dataset.max) || Infinity;
      if (next <= 0) await removeFromCart(id); else await updateCartQuantity(id, next, next > cur ? max : Infinity);
    } else if (e.target.closest("[data-mini-remove]")) {
      await removeFromCart(id);
    } else return;
    await updateCartBadge();
    await renderDrawer();
  });

  await renderDrawer();
}

function initMiniCart() {
  if (PAGE === "cart.html") return; // đang ở trang giỏ hàng thì không cần ngăn kéo
  // Bắt ở pha capture để chạy trước hiệu ứng chuyển trang
  document.addEventListener("click", async (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('.site-header a.cart-link, .toast a[href="cart.html"]');
    if (!a) return;
    const user = await getUser().catch(() => null);
    if (user && (user.role === "staff" || user.role === "admin")) return;
    openDrawer();
  }, true);
  // preventDefault phải gọi đồng bộ (trước khi await) → tách riêng một listener capture
  document.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.target.closest('.site-header a.cart-link, .toast a[href="cart.html"]')) e.preventDefault();
  }, true);
}

// ---------- 2. Menu danh mục dưới "Sản phẩm" ----------
function initCategoryMenu() {
  const trigger = document.querySelector('.site-nav a[data-nav="catalog"]');
  if (!trigger || !window.matchMedia("(hover: hover) and (min-width: 900px)").matches) return;
  let menu = null;
  let hideTimer = null;
  let loaded = null;

  const load = () => loaded || (loaded = Promise.all([getCategories(), getProducts()]).then(([cats, products]) =>
    cats.map((c) => ({ ...c, count: products.filter((p) => String(p.categoryId) === String(c.id)).length })).filter((c) => c.count > 0)));

  const place = () => {
    const r = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(12, r.left - 14)}px`;
    menu.style.top = `${r.bottom + 6}px`;
  };
  const show = async () => {
    clearTimeout(hideTimer);
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "nav-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Danh mục sản phẩm");
      document.body.appendChild(menu);
      menu.addEventListener("mouseenter", () => clearTimeout(hideTimer));
      menu.addEventListener("mouseleave", hide);
      menu.addEventListener("focusout", (e) => { if (!menu.contains(e.relatedTarget) && e.relatedTarget !== trigger) hide(); });
      menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideNow(); trigger.focus(); } });
      // Đang ở trang chủ: chọn danh mục ngay tại chỗ (bấm tab tương ứng) thay vì tải lại trang
      menu.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-cat]");
        if (!a) return;
        const tab = document.querySelector(`#categoryList .tab[data-cat-id="${CSS.escape(a.dataset.cat)}"]`);
        if (!tab) return; // trang khác → đi theo link index.html?cat=…#catalog
        e.preventDefault();
        tab.click();
        document.getElementById("catalog")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        hideNow();
      });
    }
    let cats;
    try { cats = await load(); } catch { loaded = null; return; }
    const home = PAGE === "index.html";
    menu.innerHTML = `<a role="menuitem" href="${home ? "#catalog" : "index.html#catalog"}" data-cat="all"><span>Tất cả sản phẩm</span></a>`
      + cats.map((c) => `<a role="menuitem" href="index.html?cat=${encodeURIComponent(c.id)}#catalog" data-cat="${escapeHTML(String(c.id))}"><span>${escapeHTML(c.name)}</span><small>${c.count}</small></a>`).join("");
    place();
    menu.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  };
  const hideNow = () => { menu?.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false"); };
  function hide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideNow, 180); }

  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("mouseenter", show);
  trigger.addEventListener("mouseleave", hide);
  trigger.addEventListener("focus", show);
  trigger.addEventListener("blur", (e) => { if (!menu || !menu.contains(e.relatedTarget)) hide(); });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && menu?.classList.contains("is-open")) { e.preventDefault(); menu.querySelector("a")?.focus(); }
    if (e.key === "Escape") hideNow();
  });
  window.addEventListener("scroll", hideNow, { passive: true });
}

let inited = false;
export function initShopExtras() {
  if (inited || !document.querySelector(".site-nav")) return;
  if (PAGE === "admin.html" || PAGE === "staff.html") return;
  inited = true;
  initMiniCart();
  initCategoryMenu();
}
