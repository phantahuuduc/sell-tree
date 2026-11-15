// ==========================================================
// ui.js — Các hàm giao diện dùng chung cho MỌI trang:
// định dạng giá, toast, header (tên user + badge giỏ), menu mobile,
// reveal khi cuộn, và hàm dựng card sản phẩm.
// ==========================================================
import { getCartCount, getUser, logout } from "./storage.js";
import { getPriceInfo } from "./sale.js";
import { initMicroFx } from "./fx.js";
import { WEBP_READY } from "./img-manifest.js";
import { labelChipsHtml } from "./labels.js";
import { initNav, ensureMobilePanel, ensureCartLink } from "./nav.js";
import { initProductFlow } from "./product-flow.js";

export const PLACEHOLDER = "assets/placeholder.svg";

// ---------- Icon SVG inline (bộ Lucide, dán trực tiếp, không gọi CDN) ----------
const svg = (paths, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

export const ICONS = {
  water: svg('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  humidity: svg('<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  leaf: svg('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  pot: svg('<path d="M5 10h14l-1.5 10h-11z"/><path d="M4 10h16"/><path d="M12 10V4M12 7c-2 0-3-1.5-3-3 2 0 3 1.5 3 3zM12 6c2 0 3-1.5 3-3-2 0-3 1.5-3 3z"/>'),
};

// ---------- Tiện ích ----------

// Chống chèn HTML: mọi dữ liệu đưa vào template string đều phải qua hàm này
export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// json-server giới hạn mỗi request 100KB → ảnh base64 phải được nén trước khi lưu.
// Thu nhỏ cạnh dài + giảm chất lượng JPEG cho tới khi chuỗi base64 <= maxChars.
export function compressImageToDataURL(file, { maxChars = 80000, maxSide = 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let side = maxSide;
      for (let i = 0; i < 8; i++) {
        const scale = Math.min(1, side / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const q of [0.75, 0.6, 0.45]) {
          const data = canvas.toDataURL("image/jpeg", q);
          if (data.length <= maxChars) return resolve(data);
        }
        side = Math.round(side * 0.75);
      }
      reject(new Error("Không nén được ảnh xuống đủ nhỏ"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh")); };
    img.src = url;
  });
}

// 145000 -> "145.000 ₫"
export function formatPrice(value) {
  return Number(value).toLocaleString("vi-VN", { style: "currency", currency: "VND" });
}

// Số điện thoại Việt Nam: bỏ khoảng trắng / dấu chấm / gạch, "+84…" → "0…"; hợp lệ khi gồm 10 số bắt đầu bằng 0
export function normalizePhone(value) {
  let s = String(value || "").replace(/[\s.\-()]/g, "");
  if (s.startsWith("+84")) s = "0" + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = "0" + s.slice(2);
  return s;
}
export function isValidPhone(value) {
  return /^0\d{9}$/.test(normalizePhone(value));
}

// Mã nhãn tiêu bản: 1 -> "BL-001"
export function specimenCode(id) {
  return "BL-" + String(id).padStart(3, "0");
}

// Bỏ dấu tiếng Việt để so sánh: "Trầu Bà" -> "trau ba"
export function removeAccents(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// Debounce: chỉ chạy fn sau khi người dùng ngừng gõ `wait` ms
export function debounce(fn, wait = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Promise-based delay — thay thế setTimeout callback
// Dùng: await delay(500) thay vì setTimeout(() => {...}, 500)
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Kiểm tra độ mạnh mật khẩu ----------
// Trả về { score 0-5, level 'weak'|'medium'|'strong', label, issues[], ok }
// ok = true nếu đủ điều kiện tối thiểu (>=8 ký tự, score>=3).
export function checkPasswordStrength(pw) {
  pw = String(pw || "");
  const issues = [];
  const checks = {
    length: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  if (!checks.length) issues.push("Ít nhất 8 ký tự");
  if (!checks.lower) issues.push("Có chữ thường (a-z)");
  if (!checks.upper) issues.push("Có chữ HOA (A-Z)");
  if (!checks.digit) issues.push("Có chữ số (0-9)");
  if (!checks.special) issues.push("Có ký tự đặc biệt (!@#...)");

  const score = Object.values(checks).filter(Boolean).length;
  let level = "weak", label = "Yếu";
  if (score >= 5) { level = "strong"; label = "Mạnh"; }
  else if (score >= 3 && checks.length) { level = "medium"; label = "Trung bình"; }

  // Đủ điều kiện tối thiểu: >= 8 ký tự VÀ score >= 3
  const ok = checks.length && score >= 3;
  return { score, level, label, issues, ok };
}

// Gắn thanh đo độ mạnh mật khẩu realtime vào 1 input.
// barEl: phần tử chứa thanh (sẽ được set class strength-bar--weak/medium/strong + text).
export function attachPasswordStrengthMeter(inputEl, barEl, textEl) {
  if (!inputEl) return;
  const update = () => {
    const { level, label, issues } = checkPasswordStrength(inputEl.value);
    if (barEl) {
      barEl.className = "pw-meter__bar pw-meter__bar--" + (inputEl.value ? level : "empty");
    }
    if (textEl) {
      textEl.textContent = inputEl.value
        ? `Độ mạnh: ${label}` + (issues.length ? ` — cần: ${issues.join(", ")}` : " ✓")
        : "";
    }
  };
  inputEl.addEventListener("input", update);
  update();
}

// Ảnh sản phẩm có bản WebP nhẹ (tạo bởi tools/make-webp.py) thì dùng bản đó; ảnh khác giữ đường dẫn gốc.
// small = true → bản rộng 480px cho thẻ sản phẩm. Trả về chuỗi thuộc tính để chèn vào thẻ <img>:
// src = WebP, data-orig = ảnh gốc (nếu WebP lỗi sẽ tự quay về ảnh gốc — xem attachImageFallback).
export function imgAttrs(src, { small = false } = {}) {
  const orig = String(src || "");
  if (!WEBP_READY.has(orig)) return `src="${escapeHTML(orig)}"`;
  const stem = orig.slice(orig.lastIndexOf("/") + 1).replace(/\.[a-z]+$/i, "");
  return `src="assets/img/webp/${escapeHTML(stem)}${small ? "-480" : ""}.webp" data-orig="${escapeHTML(orig)}"`;
}

// Ảnh lỗi -> thử ảnh gốc (nếu đang dùng bản WebP) rồi mới thay bằng placeholder nội bộ.
// Kèm hiệu ứng "mờ → nét" khi ảnh tải xong (chỉ thêm bằng JS; có hẹn giờ chốt để ảnh không bao giờ kẹt ở trạng thái mờ).
export function attachImageFallback(root = document) {
  root.querySelectorAll("img[data-fallback]").forEach((img) => {
    if (img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = "1";
    const fail = () => {
      if (img.dataset.orig && !img.dataset.origTried) { img.dataset.origTried = "1"; img.src = img.dataset.orig; return; }
      if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
    };
    img.addEventListener("error", fail);
    // Ảnh đã lỗi trước khi kịp gắn sự kiện
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) fail();

    if (!img.complete && !prefersReducedMotion()) {
      img.classList.add("img-fade");
      const done = () => img.classList.add("is-loaded");
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      setTimeout(done, 2500);
    }
  });
}

// ---------- Highlight từ khóa bằng DOM (không nối chuỗi HTML từ input) ----------

// Tìm vị trí khớp trong chuỗi gốc, so sánh không dấu
function findMatchRange(original, query) {
  const q = removeAccents(query).trim();
  if (!q) return null;
  let normalized = "";
  const map = []; // map[i] = vị trí ký tự gốc ứng với ký tự thứ i trong chuỗi không dấu
  for (let i = 0; i < original.length; i++) {
    const n = removeAccents(original[i]);
    for (let k = 0; k < n.length; k++) {
      normalized += n[k];
      map.push(i);
    }
  }
  const idx = normalized.indexOf(q);
  if (idx === -1) return null;
  return { start: map[idx], end: map[idx + q.length - 1] + 1 };
}

// Ghi text vào element, bọc phần khớp trong <mark>
export function setHighlightedText(el, text, query) {
  el.textContent = "";
  const range = query ? findMatchRange(text, query) : null;
  if (!range) {
    el.textContent = text;
    return;
  }
  const mark = document.createElement("mark");
  mark.textContent = text.slice(range.start, range.end);
  el.append(text.slice(0, range.start), mark, text.slice(range.end));
}

// ---------- Card sản phẩm (dùng ở trang chủ + mục "Cây hợp gu" của trang chi tiết) ----------

// Chip trên thẻ sản phẩm: nhãn đầu tiên theo thứ tự nhóm (mặc định là mức "Độ khó chăm sóc").
// Nhãn do admin quản lý (js/labels.js); sản phẩm không có nhãn nào và không phải cây → "Phụ kiện trồng".
function primaryLabelChip(product) {
  const chip = labelChipsHtml(product, { limit: 1 });
  if (chip) return chip;
  return product.careLevel ? "" : `<span class="chip chip--plain">Phụ kiện trồng</span>`;
}

// Đổi số 0–100 thành 3 chấm (1–3 chấm đậm)
function dots(level) {
  const on = level >= 67 ? 3 : level >= 34 ? 2 : 1;
  return [1, 2, 3].map((i) => `<i class="${i <= on ? "on" : ""}"></i>`).join("");
}

function careMini(careLevel) {
  if (!careLevel) {
    return `<div class="care-mini">Dùng kèm khi trồng cây</div>`;
  }
  return `
    <div class="care-mini" aria-label="Nhu cầu nước ${careLevel.water}%, ánh sáng ${careLevel.light}%">
      <span class="care-mini__item"><span class="care-mini__label">Nước</span><span class="care-mini__dots">${dots(careLevel.water)}</span></span>
      <span class="care-mini__item"><span class="care-mini__label">Nắng</span><span class="care-mini__dots">${dots(careLevel.light)}</span></span>
    </div>`;
}

// Điểm đánh giá hiện trên thẻ sản phẩm. Trang nào có dữ liệu đánh giá thì gọi setCardRatings(reviews)
// trước khi vẽ thẻ; không gọi thì thẻ vẫn hiện bình thường, chỉ không có sao.
let cardRatings = new Map(); // productId → { avg, count }
export function setCardRatings(reviews) {
  const acc = new Map();
  (reviews || []).forEach((r) => {
    const rating = Number(r.rating);
    if (!r.productId || !(rating >= 1 && rating <= 5)) return;
    const cur = acc.get(String(r.productId)) || { sum: 0, count: 0 };
    cur.sum += rating; cur.count += 1;
    acc.set(String(r.productId), cur);
  });
  cardRatings = new Map([...acc].map(([id, v]) => [id, { avg: v.sum / v.count, count: v.count }]));
}
export function cardRatingHtml(productId) {
  const r = cardRatings.get(String(productId));
  if (!r) return "";
  return `<span class="card__rating" title="${r.avg.toFixed(1)} / 5 từ ${r.count} đánh giá"><span aria-hidden="true">★</span> ${r.avg.toFixed(1)} <small>(${r.count})</small></span>`;
}

// Trả về chuỗi HTML của 1 card. eager = ảnh nằm ngay màn hình đầu.
export function renderProductCard(product, { eager = false } = {}) {
  const url = `product-detail.html?id=${encodeURIComponent(product.id)}`;
  const pi = getPriceInfo(product);
  const sale = pi.percent > 0
    ? `<span class="badge-sale card__sale"${pi.promo ? ` title="${escapeHTML(pi.promo.name)}"` : ""}>−${pi.percent}%</span>`
    : "";
  const sci = product.scientificName
    ? `<p class="card__sci"><em class="sci" data-role="sci">${escapeHTML(product.scientificName)}</em></p>`
    : `<p class="card__sci"><span class="sci">Phụ kiện</span></p>`;
  const tag = product.scientificName
    ? `<div class="specimen-tag" aria-hidden="true"><em>${escapeHTML(product.scientificName)}</em><span>${specimenCode(product.id)}</span></div>`
    : `<div class="specimen-tag" aria-hidden="true"><em>Phụ kiện vườn</em><span>${specimenCode(product.id)}</span></div>`;
  const outOfStock = Number(product.stock) <= 0;
  const button = outOfStock
    ? `<button class="btn btn--ghost" type="button" data-add="${escapeHTML(product.id)}" data-backorder="1" title="Hết hàng — đặt trước, giao khi có hàng"><span class="btn__label">Đặt trước</span></button>`
    : `<button class="btn btn--primary" type="button" data-add="${escapeHTML(product.id)}"><span class="btn__label" aria-live="polite">Thêm vào giỏ</span></button>`;

  return `
    <article class="card" aria-labelledby="card-title-${escapeHTML(product.id)}">
      <a class="card__link" href="${url}" aria-hidden="true" tabindex="-1"></a>
      <div class="card__media">
        ${sale}
        <button class="card__fav" type="button" data-fav="${escapeHTML(product.id)}" aria-label="Thêm vào yêu thích" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <img ${imgAttrs(product.image, { small: true })} alt="${escapeHTML(product.imageAlt || product.name)}"
             width="400" height="500" data-fallback
             ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async">
        ${tag}
      </div>
      <div class="card__body">
        <h3 class="card__title" id="card-title-${escapeHTML(product.id)}"><a href="${url}" data-role="name">${escapeHTML(product.name)}</a></h3>
        ${sci}
        ${careMini(product.careLevel)}
        <div class="card__meta">${primaryLabelChip(product)}${cardRatingHtml(product.id)}${
          Number(product.stock) > 0 && Number(product.stock) <= 3 ? `<span class="card__low">Chỉ còn ${Number(product.stock)} chậu</span>` : ""
        }</div>
        <div class="card__foot">
          <p class="price">${formatPrice(pi.price)}${pi.original ? ` <s>${formatPrice(pi.original)}</s>` : ""}</p>
          ${button}
        </div>
      </div>
    </article>`;
}

// Card skeleton đúng kích thước card thật (không layout shift)
export function renderSkeletonCards(count = 8) {
  const one = `
    <li class="card-cell" aria-hidden="true">
      <div class="card skeleton">
        <div class="card__media"></div>
        <div class="card__body">
          <div class="sk-line w80"></div>
          <div class="sk-line w60"></div>
          <div class="sk-line w40"></div>
          <div class="sk-line tall"></div>
        </div>
      </div>
    </li>`;
  return Array.from({ length: count }, () => one).join("");
}

// ---------- M2: reveal khi cuộn, mỗi phần tử chỉ chạy MỘT lần ----------
let revealObserver = null;

export function revealOnScroll(elements) {
  const list = Array.from(elements);
  if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
    list.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        // Gom các phần tử cùng lúc xuất hiện để stagger 45ms theo thứ tự
        const visible = entries.filter((e) => e.isIntersecting);
        visible.forEach((entry, i) => {
          entry.target.style.setProperty("--delay", `${i * 45}ms`);
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target); // chỉ chạy một lần
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
  }
  list.forEach((el) => {
    el.classList.add("reveal");
    revealObserver.observe(el);
  });
}

// Đánh dấu hiện ngay (dùng cho card được thêm vào lúc lọc)
export function markRevealed(el) {
  el.classList.add("reveal", "is-visible");
  if (revealObserver) revealObserver.unobserve(el);
}

// ---------- M6: Toast (tối đa 1 cái cùng lúc) ----------
let toastTimer = null;

export function showToast(message, { image = null, link = null, icon = "check" } = {}) {
  let region = document.getElementById("toastRegion");
  if (!region) {
    region = document.createElement("div");
    region.id = "toastRegion";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("role", "status");
    document.body.appendChild(region);
  }
  clearTimeout(toastTimer);
  region.innerHTML = ""; // toast mới thay toast cũ

  const toast = document.createElement("div");
  toast.className = "toast";
  if (image) {
    const img = document.createElement("img");
    img.src = image;
    img.alt = "";
    toast.appendChild(img);
  } else {
    toast.insertAdjacentHTML("beforeend", ICONS[icon] || ICONS.check);
  }
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    toast.appendChild(a);
  }
  // Thanh thời gian: cho biết toast sắp tự đóng
  const DURATION = link ? 3600 : 2800;
  const bar = document.createElement("i");
  bar.className = "toast__bar";
  bar.style.animationDuration = `${DURATION}ms`;
  toast.appendChild(bar);
  region.appendChild(toast);

  const dismiss = () => {
    if (!toast.isConnected || toast.classList.contains("is-leaving")) return;
    toast.classList.remove("is-shown");
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 320);
  };
  // Bấm vào toast (không phải link) để đóng sớm
  toast.addEventListener("click", (e) => { if (!e.target.closest("a")) dismiss(); });
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("is-shown")));
  toastTimer = setTimeout(dismiss, DURATION);
}

// ---------- M6: hiệu ứng nút "Thêm vào giỏ" + icon giỏ ----------
export function animateAddButton(btn) {
  const label = btn.querySelector(".btn__label");
  btn.classList.remove("is-released");
  btn.classList.add("is-pressed");
  setTimeout(() => {
    btn.classList.remove("is-pressed");
    btn.classList.add("is-released", "is-added");
  }, 100);
  if (label) {
    clearTimeout(btn._labelTimer);
    label.textContent = "Đã thêm";
    btn._labelTimer = setTimeout(() => {
      label.textContent = "Thêm vào giỏ";
      btn.classList.remove("is-added");
    }, 1200);
  }
}

export function bumpCartIcon() {
  document.querySelectorAll(".cart-link").forEach((link) => {
    link.classList.remove("is-bumped");
    void link.offsetWidth; // ép trình duyệt tính lại để animation chạy lại từ đầu
    link.classList.add("is-bumped");
  });
}

// ---------- Header: badge giỏ + vùng tài khoản (async) ----------
export async function updateCartBadge() {
  const count = await getCartCount();
  document.querySelectorAll("[data-cart-count]").forEach((badge) => {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
  });
  document.querySelectorAll(".cart-link").forEach((link) => {
    link.setAttribute("aria-label", count ? `Giỏ hàng, ${count} sản phẩm` : "Giỏ hàng trống");
  });
}

// Icon trái tim (Yêu thích) trên header — chèn bằng JS cạnh icon giỏ để có mặt ở MỌI trang
// mà không phải sửa từng file HTML. Khách chưa đăng nhập vẫn dùng được (lưu trên máy).
function ensureFavLink(shopRole) {
  // Mỗi header có đúng 1 icon tim: đứng ngay trước icon giỏ; trang không có icon giỏ thì đứng cuối cụm nút
  document.querySelectorAll(".site-header .header-actions").forEach((box) => {
    let fav = box.querySelector(".fav-link");
    if (!fav) {
      fav = document.createElement("a");
      fav.className = "fav-link";
      fav.href = "wishlist.html";
      fav.setAttribute("aria-label", "Sản phẩm yêu thích");
      fav.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="cart-badge fav-badge" data-fav-count hidden>0</span>`;
      const anchor = box.querySelector(".cart-link") || box.querySelector(".menu-toggle");
      if (anchor) anchor.before(fav); else box.appendChild(fav);
    }
    fav.hidden = shopRole;
  });
  document.querySelectorAll('.mobile-panel nav a[href="cart.html"]').forEach((cartA) => {
    let favA = cartA.parentElement.querySelector('a[href="wishlist.html"]');
    if (!favA) {
      favA = document.createElement("a");
      favA.href = "wishlist.html";
      favA.innerHTML = `<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>Yêu thích</span><span class="mobile-fav-count" data-fav-count hidden>0</span>`;
      if (location.pathname.endsWith("wishlist.html")) favA.setAttribute("aria-current", "page");
      cartA.before(favA);
    }
    favA.hidden = shopRole;
  });
}

export async function updateFavBadge(count = null) {
  if (count === null) {
    try { count = await (await import("./favorites.js")).getFavoriteCount(); } catch { count = 0; }
  }
  document.querySelectorAll("[data-fav-count]").forEach((badge) => {
    const changed = badge.textContent !== String(count);
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    if (changed && count > 0) {
      const link = badge.closest(".fav-link");
      link?.classList.remove("is-bumped");
      void link?.offsetWidth;
      link?.classList.add("is-bumped");
    }
  });
  document.querySelectorAll(".fav-link").forEach((a) =>
    a.setAttribute("aria-label", count ? `Yêu thích, ${count} sản phẩm` : "Sản phẩm yêu thích"));
}

export async function renderHeaderUser() {
  const user = await getUser();
  // Nhân viên / quản trị không mua hàng → ẩn biểu tượng giỏ
  const shopRole = !!user && (user.role === "staff" || user.role === "admin");
  document.querySelectorAll(".cart-link").forEach((a) => { a.hidden = shopRole; });
  document.querySelectorAll('.mobile-panel nav a[href="cart.html"]').forEach((a) => { a.hidden = shopRole; });
  ensureFavLink(shopRole);
  document.querySelectorAll("[data-account]").forEach((box) => {
    if (!box) return;
    box.textContent = "";
    if (user) {
      if (user.role === "admin") {
        const adminLink = document.createElement("a");
        adminLink.href = "admin.html";
        adminLink.className = "account__admin";
        adminLink.textContent = "Quản trị";
        box.appendChild(adminLink);
      } else if (user.role === "staff") {
        const staffLink = document.createElement("a");
        staffLink.href = "staff.html";
        staffLink.className = "account__admin";
        staffLink.textContent = "Nhân viên";
        box.appendChild(staffLink);
      }

      // Link "Đơn hàng" cho khách hàng
      if (user.role === "user") {
        const ordersLink = document.createElement("a");
        ordersLink.href = "donhang.html";
        ordersLink.className = "account__orders";
        ordersLink.textContent = "Đơn hàng";
        box.appendChild(ordersLink);
      }

      // Link hồ sơ (kèm avatar nếu có)
      const profileLink = document.createElement("a");
      profileLink.href = "profile.html";
      profileLink.className = "account__profile";
      profileLink.title = "Hồ sơ của bạn";
      if (user.avatar) {
        const img = document.createElement("img");
        img.className = "account__avatar";
        img.src = user.avatar;
        img.alt = "";
        img.width = 28; img.height = 28;
        profileLink.appendChild(img);
      } else {
        const ava = document.createElement("span");
        ava.className = "account__avatar account__avatar--placeholder";
        ava.textContent = (user.name || "?").trim().charAt(0).toUpperCase();
        profileLink.appendChild(ava);
      }
      const name = document.createElement("span");
      name.className = "account__name";
      name.textContent = user.name;
      profileLink.appendChild(name);
      box.appendChild(profileLink);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "account__logout";
      btn.textContent = "Đăng xuất";
      btn.title = "Đăng xuất";
      btn.addEventListener("click", async () => {
        await logout();
        window.location.reload();
      });
      box.appendChild(btn);
    } else {
      box.innerHTML = `<a href="login.html">Đăng nhập</a><a href="dangky.html">Đăng ký</a>`;
    }
  });
}

// Header thêm nền mờ + đường kẻ khi cuộn quá 40px
function initHeaderScroll() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

// Menu mobile: khóa cuộn body, Esc để đóng, giữ focus trong panel
function initMobileMenu() {
  const toggle = document.querySelector(".menu-toggle");
  const panel = document.getElementById("mobilePanel");
  if (!toggle || !panel) return;
  const sheet = panel.querySelector(".mobile-panel__sheet");
  let lastFocus = null;

  const focusables = () =>
    Array.from(sheet.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'));

  function open() {
    lastFocus = document.activeElement;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-locked");
    setTimeout(() => focusables()[0]?.focus(), 50);
  }
  function close() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
    lastFocus?.focus();
  }

  toggle.addEventListener("click", open);
  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target.closest(".mobile-panel nav a")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!panel.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

// Nạp thông tin shop (địa chỉ, phone, email, giờ, hero facts) và
// bơm vào mọi element có [data-site="key"]. Không chặn trang nếu lỗi.
export async function applySiteSettings() {
  try {
    const { getSettings } = await import("./api.js");
    const s = await getSettings();
    if (!s) return;
    document.querySelectorAll("[data-site]").forEach((el) => {
      const key = el.dataset.site;
      const val = s[key];
      if (val !== undefined && val !== null && val !== "") {
        el.textContent = String(val);
      }
    });
    // Nếu có title động của trang
    if (s.shopName) {
      document.querySelectorAll("[data-site-brand]").forEach((el) => {
        el.textContent = s.shopName;
      });
    }
    // Cache lại cho các module khác (invoice.js) đọc đồng bộ nếu cần
    window.__siteSettings = s;
  } catch (err) {
    console.warn("Không nạp được cài đặt shop:", err?.message);
  }
}

// Gọi một lần ở đầu mỗi trang (async)
// ----- Ô nhập số (type=number) trên toàn web -----
// Firefox cho gõ chữ vào ô number và chỉ báo lỗi khi lưu → chặn ký tự lạ ngay khi gõ/dán,
// hiện lỗi dưới ô, và chặn submit nếu ô số còn sai. Dùng event delegation nên áp cả form vẽ động.
let numberGuardReady = false;
function numberErrorEl(input) {
  let el = input.nextElementSibling;
  if (!el || !el.classList?.contains("num-error")) {
    el = document.createElement("small");
    el.className = "num-error";
    el.setAttribute("aria-live", "polite");
    input.insertAdjacentElement("afterend", el);
  }
  return el;
}
function validateNumberInput(input) {
  const v = input.validity;
  let msg = "";
  if (v.badInput) msg = "Chỉ được nhập số.";
  else if (input.required && input.value === "") msg = "Vui lòng nhập số.";
  else if (v.rangeUnderflow) msg = `Giá trị nhỏ nhất là ${input.min}.`;
  else if (v.rangeOverflow) msg = `Giá trị lớn nhất là ${input.max}.`;
  else if (v.stepMismatch) msg = "Chỉ nhập số nguyên.";
  const el = numberErrorEl(input);
  el.textContent = msg;
  el.hidden = !msg;
  input.classList.toggle("is-invalid", !!msg);
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  return !msg;
}
function initNumberInputGuard() {
  if (numberGuardReady) return;
  numberGuardReady = true;
  const isNum = (t) => t instanceof HTMLInputElement && t.type === "number" && !t.readOnly;
  const allowsDecimal = (t) => t.step === "any" || /\./.test(t.step || "");
  document.addEventListener("beforeinput", (e) => {
    if (!isNum(e.target) || !e.data) return;
    const ok = allowsDecimal(e.target) ? /^[0-9.]+$/ : /^[0-9]+$/;
    if (!ok.test(e.data)) {
      e.preventDefault();
      const el = numberErrorEl(e.target);
      el.textContent = "Chỉ được nhập số.";
      el.hidden = false;
      e.target.classList.add("is-invalid");
    }
  });
  document.addEventListener("input", (e) => { if (isNum(e.target)) validateNumberInput(e.target); });
  document.addEventListener("blur", (e) => { if (isNum(e.target)) validateNumberInput(e.target); }, true);
  // Trình duyệt tự kiểm tra form (không có novalidate) → bắt sự kiện invalid để vẫn hiện lỗi dưới ô
  document.addEventListener("invalid", (e) => { if (isNum(e.target)) validateNumberInput(e.target); }, true);
  // Pha capture: chạy TRƯỚC handler submit của từng form → chặn được mọi form
  document.addEventListener("submit", (e) => {
    const bad = Array.from(e.target.querySelectorAll('input[type="number"]')).filter((i) => !i.readOnly && !i.disabled && !validateNumberInput(i));
    if (bad.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      bad[0].focus();
    }
  }, true);
}

export async function initPage() {
  // Thanh điều hướng dùng chung: bổ sung menu ☰ / icon giỏ cho trang còn thiếu, rồi vẽ các mục nav
  ensureMobilePanel();
  ensureCartLink();
  initNav();
  initProductFlow();               // chuyển cảnh thẻ sản phẩm → trang chi tiết (và quay lại đúng chỗ cũ)
  initHeaderScroll();
  initMobileMenu();
  initNumberInputGuard();
  await renderHeaderUser();
  await updateCartBadge();
  initMicroFx();                 // ripple nút bấm + chuyển trang mờ dần
  updateFavBadge();              // số trên icon trái tim (không chặn render)
  // Giỏ hàng trượt + menu danh mục dưới "Sản phẩm" — nạp động, lỗi cũng không ảnh hưởng trang
  import("./shop-extras.js").then((m) => m.initShopExtras()).catch(() => {});
  window.addEventListener("favorites:change", (e) => updateFavBadge(e.detail?.count ?? null));
  attachImageFallback();
  applySiteSettings();  // chạy song song, không await — nếu chậm không chặn render
  // Chuông thông báo (chỉ khách) — nạp động, không chặn render
  import("./notify.js").then((m) => m.initNotificationCenter()).catch(() => {});
  // Hỗ trợ đa ngôn ngữ (Google Translate) — nạp động, nút ở góc dưới trái
  import("./i18n.js").then((m) => m.initI18n()).catch(() => {});
  window.addEventListener("storage", async (e) => {
    if (e.key && e.key.startsWith("cart")) await updateCartBadge();
    if (e.key === "user") {
      await renderHeaderUser();
      await updateCartBadge();
    }
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && document.activeElement) {
      document.activeElement.blur();
    }
  });
}
