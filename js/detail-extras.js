// ==========================================================
// detail-extras.js — Phần bổ sung cho trang chi tiết sản phẩm (nạp động, lỗi cũng không ảnh hưởng trang):
//   1. Thanh mua hàng dính dưới header trên màn hình rộng, hiện khi nút "Thêm vào giỏ" chính trôi khỏi màn hình
//   2. "Lịch chăm sóc tuần đầu" — sinh từ chỉ số nước / ánh sáng của chính cây đang xem
//   3. "Thường mua cùng" — chậu & giá thể đi kèm, thêm vào giỏ ngay tại chỗ
// ==========================================================
import { addToCart, requireLogin, stockFullMessage } from "./storage.js";
import { formatPrice, escapeHTML, showToast, updateCartBadge, bumpCartIcon, attachImageFallback, imgAttrs } from "./ui.js";
import { getPriceInfo } from "./sale.js";
import { flyToCart } from "./fx.js";
import { careWeekHtml, initCareWeek } from "./care-week.js";

// ---------- 1. Thanh mua hàng dính (màn hình rộng) ----------
function initStickyBuyBar(product) {
  const bar = document.querySelector(".actionbar");
  const buy = document.querySelector(".buy");
  if (!bar || !buy || !("IntersectionObserver" in window)) return;
  if (!bar.querySelector(".actionbar__product")) {
    bar.insertAdjacentHTML("afterbegin", `
      <div class="actionbar__product">
        <img ${imgAttrs(product.image, { small: true })} alt="" width="40" height="50" data-fallback>
        <strong>${escapeHTML(product.name)}</strong>
      </div>`);
    attachImageFallback(bar);
  }
  // Nút mua chính còn trong màn hình thì ẩn thanh dính (không lặp 2 nút cùng lúc)
  new IntersectionObserver(([entry]) => {
    const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    bar.classList.toggle("is-stuck", past);
  }, { threshold: 0 }).observe(buy);
}

// ---------- 2. Lịch chăm sóc tuần đầu ----------
// Toàn bộ ở js/care-week.js: chọn ngày nhận cây → ngày thật, ô "Đã làm" (lưu theo tài khoản / trình duyệt), tải .ics.

// ---------- 3. Thường mua cùng ----------
function boughtTogetherHtml(product, allProducts) {
  if (!product.careLevel) return { html: "", picks: [] }; // đang xem phụ kiện → không gợi ý phụ kiện
  const picks = (allProducts || [])
    .filter((p) => !p.careLevel && !p.scientificName && Number(p.stock) > 0 && String(p.id) !== String(product.id)) // phụ kiện: không có tên khoa học, không có chỉ số chăm sóc
    .slice(0, 3);
  if (!picks.length) return { html: "", picks };
  const html = `
    <section class="together" aria-label="Thường mua cùng">
      <h2>Thường mua cùng</h2>
      <ul class="together__list">
        ${picks.map((p) => {
          const pi = getPriceInfo(p);
          const url = `product-detail.html?id=${encodeURIComponent(p.id)}`;
          return `
            <li class="together__item">
              <a href="${url}" tabindex="-1" aria-hidden="true"><img ${imgAttrs(p.image, { small: true })} alt="" width="72" height="90" loading="lazy" data-fallback></a>
              <div class="together__body">
                <a class="together__name" href="${url}">${escapeHTML(p.name)}</a>
                <span class="together__price">${formatPrice(pi.price)}</span>
              </div>
              <button type="button" class="btn btn--ghost btn--sm" data-together-add="${escapeHTML(String(p.id))}">+ Thêm</button>
            </li>`;
        }).join("")}
      </ul>
    </section>`;
  return { html, picks };
}

export function initDetailExtras(product, allProducts) {
  const container = document.getElementById("detailContainer");
  if (!container || !product) return;

  initStickyBuyBar(product);

  // Lịch chăm sóc: ngay dưới phiếu chăm sóc của cây
  const careCard = container.querySelector(".info .care-card");
  if (careCard && !container.querySelector(".care-week")) {
    careCard.insertAdjacentHTML("afterend", careWeekHtml(product));
    initCareWeek(container.querySelector(".care-week"), product).catch((err) => console.warn("Lịch chăm sóc:", err));
  }

  // Thường mua cùng: ngay dưới nút mua
  const buy = container.querySelector(".info .buy");
  if (buy && !container.querySelector(".together")) {
    const { html, picks } = boughtTogetherHtml(product, allProducts);
    if (html) {
      (container.querySelector(".info .backorder-note") || buy).insertAdjacentHTML("afterend", html);
      const box = container.querySelector(".together");
      attachImageFallback(box);
      box.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-together-add]");
        if (!btn || btn.disabled) return;
        if (!(await requireLogin())) return;
        const p = picks.find((x) => String(x.id) === btn.dataset.togetherAdd);
        if (!p) return;
        const res = await addToCart(p, 1, p.stock || Infinity);
        if (res.added === 0) { showToast(stockFullMessage(p), { icon: "alert" }); return; }
        btn.textContent = "✓ Đã thêm";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = "+ Thêm"; btn.disabled = false; }, 1400);
        flyToCart(btn.closest(".together__item")?.querySelector("img")).then(async () => {
          await updateCartBadge();
          bumpCartIcon();
        });
        showToast(`Đã thêm "${p.name}" vào giỏ hàng`, { image: p.image, link: { href: "cart.html", label: "Xem giỏ" } });
      });
    }
  }
}
