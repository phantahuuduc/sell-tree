// ==========================================================
// search-suggest.js — Gợi ý tức thì dưới ô tìm kiếm (trang chủ).
// Gõ là hiện tối đa 5 sản phẩm khớp (ảnh nhỏ + tên + giá); bấm vào đi thẳng tới trang chi tiết.
// Enter / nút kính lúp vẫn hoạt động như cũ (lọc lưới sản phẩm và cuộn tới kết quả).
// ==========================================================
import { formatPrice, escapeHTML, removeAccents, debounce, imgAttrs, attachImageFallback } from "./ui.js";
import { getPriceInfo } from "./sale.js";

export function initSearchSuggest(getProducts) {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  if (!form || !input || form.querySelector(".search-suggest")) return;

  const box = document.createElement("div");
  box.className = "search-suggest";
  box.id = "searchSuggest";
  box.setAttribute("role", "listbox");
  box.hidden = true;
  form.appendChild(box);
  input.setAttribute("aria-controls", "searchSuggest");
  input.setAttribute("autocomplete", "off");

  let active = -1;
  const items = () => Array.from(box.querySelectorAll("a"));
  const close = () => { box.hidden = true; active = -1; };

  function render() {
    const q = removeAccents(input.value).trim();
    if (q.length < 2) { close(); return; }
    const list = (getProducts() || []).filter((p) =>
      removeAccents(p.name).includes(q) || removeAccents(p.scientificName || "").includes(q)).slice(0, 5);
    box.innerHTML = list.length
      ? list.map((p) => `
        <a role="option" href="product-detail.html?id=${encodeURIComponent(p.id)}">
          <img ${imgAttrs(p.image, { small: true })} alt="" width="40" height="50" data-fallback>
          <span class="search-suggest__txt"><strong>${escapeHTML(p.name)}</strong>${p.scientificName ? `<em>${escapeHTML(p.scientificName)}</em>` : ""}</span>
          <span class="search-suggest__price">${formatPrice(getPriceInfo(p).price)}</span>
        </a>`).join("") + `<p class="search-suggest__hint">Nhấn Enter để xem tất cả kết quả</p>`
      : `<p class="search-suggest__hint">Không có cây nào khớp “${escapeHTML(input.value.trim())}”</p>`;
    attachImageFallback(box);
    active = -1;
    box.hidden = false;
  }

  input.addEventListener("input", debounce(render, 120));
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) render(); });
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    const list = items();
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!list.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list.forEach((a, i) => a.classList.toggle("is-active", i === active));
    } else if (e.key === "Enter" && active >= 0 && list[active]) {
      e.preventDefault();          // đang chọn 1 gợi ý → mở sản phẩm đó thay vì gửi tìm kiếm
      list[active].click();
    }
  });
  form.addEventListener("submit", close);
  // Bấm ra ngoài thì đóng (bấm vào gợi ý vẫn kịp điều hướng)
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) close(); });
}
