// ==========================================================
// app.js — Logic trang chủ
// ==========================================================
import { backPage } from "./product-flow.js";
import { getCategories, getProducts, getPromotions, getOrders, getReviews, isNetworkError } from "./api.js";
import { initParticleField, initFloatingLeaves, initTopoField } from "./three-ambient.js";
import { addToCart, requireLogin, getUser, stockFullMessage } from "./storage.js";
import {
  initPage,
  renderProductCard,
  renderSkeletonCards,
  setCardRatings,
  revealOnScroll,
  markRevealed,
  showToast,
  animateAddButton,
  bumpCartIcon,
  updateCartBadge,
  removeAccents,
  debounce,
  setHighlightedText,
  prefersReducedMotion,
  attachImageFallback,
  escapeHTML,
  formatPrice,
  ICONS,
  PLACEHOLDER,
  specimenCode,
  cardRatingHtml,
} from "./ui.js";
import { getActivePromotions, getCountdown, getNewArrivals, getBestSellers, topSellers, setActivePromotions, getPriceInfo, isPlant } from "./sale.js";
import { markFavorites, initFavoriteButtons } from "./favorites.js";
import { flyToCart } from "./fx.js";
import { quizLightRange, quizWaterRange, quizLabels } from "./quiz.js";
import { ensureLabels, productLabels, labelChipsHtml } from "./labels.js";

// Số sản phẩm mỗi trang (phân trang)
const ITEMS_PER_PAGE = 8;

// State toàn cục trang chủ
const state = {
  allProducts: [],
  categories: [],
  orders: [],
  activePromotion: null,
  categoryId: "all", // "all" hoặc id dạng string
  searchQuery: "",
  sortBy: "default", // "default" | "best" | "newest" | "price-asc" | "price-desc" | "name-az"
  soldMap: {},       // số chậu đã bán theo mã cây (đơn đã thành doanh thu) — dùng cho sắp xếp "Bán chạy"
  petSafeOnly: false,
  quizAnswers: { light: null, water: null, pet: null },
  currentPage: 1, // trang hiện tại trong phân trang
};

// ===== Sale Banner + Countdown =====
let countdownInterval = null;

function renderSaleBanner(promotion) {
  const banner = document.getElementById("saleBanner");
  if (!banner || !promotion) return;

  document.getElementById("saleBannerTitle").textContent = promotion.banner;
  document.getElementById("saleBannerDesc").textContent = promotion.description;
  banner.hidden = false;

  function updateCountdown() {
    const cd = getCountdown(promotion.endDate);
    if (cd.expired) {
      banner.hidden = true;
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }
    // Số nào đổi thì "lật" số đó (chỉ gắn class; hiệu ứng nằm ở CSS)
    const setNum = (id, value) => {
      const el = document.getElementById(id);
      const text = String(value).padStart(2, "0");
      if (!el || el.textContent === text) return;
      el.textContent = text;
      el.classList.remove("is-flip");
      void el.offsetWidth;
      el.classList.add("is-flip");
    };
    setNum("countDays", cd.days);
    setNum("countHours", cd.hours);
    setNum("countMins", cd.minutes);
    setNum("countSecs", cd.seconds);
  }
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// ===== Hàng Mới Về =====
function renderNewArrivals(products) {
  const section = document.getElementById("newArrivals");
  const list = document.getElementById("newArrivalsList");
  if (!section || !list) return;

  const newProducts = getNewArrivals(products).slice(0, 6); // lưới 6 ô — sản phẩm đầy đủ ở danh mục bên dưới
  if (newProducts.length === 0) return;

  section.hidden = false;
  list.innerHTML = newProducts
    .map((p) => {
      const daysAgo = Math.floor((Date.now() - new Date(p.addedDate)) / (1000 * 60 * 60 * 24));
      const timeLabel = daysAgo === 0 ? "Hôm nay" : daysAgo === 1 ? "Hôm qua" : `${daysAgo} ngày trước`;
      return `
        <a href="product-detail.html?id=${encodeURIComponent(p.id)}" class="arrival-card">
          <div class="arrival-card__img">
            <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" data-fallback loading="lazy" width="200" height="250">
            <span class="arrival-card__badge">Mới</span>
          </div>
          <div class="arrival-card__info">
            <h3 class="arrival-card__name">${escapeHTML(p.name)}</h3>
            <p class="arrival-card__sci">${escapeHTML(p.scientificName || "")}</p>
            <span class="arrival-card__time">${timeLabel}</span>
            <span class="arrival-card__price">${priceHtml(p)}</span>
          </div>
        </a>`;
    })
    .join("");
  attachImageFallback(list);
}

function priceHtml(p) {
  const pi = getPriceInfo(p);
  return pi.original ? `${formatPrice(pi.price)} <s>${formatPrice(pi.original)}</s>` : formatPrice(pi.price);
}

// ===== "Bảng tin của tiệm": cây được khách thương nhất =====
// CÁCH TÍNH KHÔNG ĐỔI: topSellers() trong sale.js (đếm số chậu của đơn isCompletedSale — cùng nguồn với doanh thu,
// tối đa 3 cây, không cắt ngang nhóm hòa nhau). Ở đây chỉ lo phần trình bày:
//   • 1 cây → một khối ngang lớn · 2 cây → khối lớn + 1 thẻ đứng · 3 cây → khối lớn + 2 thẻ xếp chồng.
//   • Số bán chỉ nêu khi đủ lớn (LOVED_COUNT_FROM); còn thấp thì nói bằng lời ("khách hay chọn…") để không phản tác dụng.
//   • Chưa có cây nào phân được hạng → đổi thành "Tiệm chọn giúp bạn" (mấy chậu dễ chăm, còn hàng) thay vì để trống.
const LOVED_COUNT_FROM = 10;
const HEART_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

// Câu đầu của phần mô tả — đủ để thẻ có "câu chuyện" mà không dài dòng
function firstSentence(text, max = 140) {
  const parts = String(text || "").trim().match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g) || [];
  let out = "";
  for (const part of parts) {            // câu đầu quá cụt (vd "Gốc Đông Phi, họ Ráy.") thì lấy thêm câu kế
    if (out && (out.length >= 45 || (out + part).length > max)) break;
    out += part;
  }
  out = out.trim();
  if (out.length > max) out = out.slice(0, out.lastIndexOf(" ", max)).replace(/[,;:—–-]\s*$/, "") + "…";
  return out;
}

// Gợi ý của tiệm khi chưa có bảng xếp hạng: cây còn hàng, ưu tiên cây nổi bật rồi tới cây dễ chăm
function shopPicks(products, categories, max = 3) {
  const isEasy = (p) => productLabels(p, { groupId: "care" }).some((l) => l.id === "care-easy") || /^dễ/i.test(p.difficulty || "");
  return (products || [])
    .filter((p) => isPlant(p, categories) && Number(p.stock) > 0)
    .map((p) => ({ p, score: (p.isFeatured ? 2 : 0) + (isEasy(p) ? 1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name), "vi"))
    .slice(0, max)
    .map((x) => ({ product: x.p, totalSold: 0, rank: 0 }));
}

function lovedLine({ totalSold, rank, pick, product }) {
  if (pick) {                             // mỗi chậu một lý do riêng: hợp đặt ở đâu (không lặp lại nhãn "Dễ chăm")
    const places = (product.idealPlacement || []).slice(0, 2).map((x) => String(x).toLowerCase());
    if (places.length) return `Hợp ${escapeHTML(places.join(", "))}`;
    const care = productLabels(product, { groupId: "care" })[0];
    return escapeHTML(care?.description || "Tiệm dưỡng sẵn ba tuần, về nhà là xanh.");
  }
  if (totalSold >= LOVED_COUNT_FROM) return `<b>${totalSold}</b> chậu đã về nhà mới`;
  return rank === 1 ? "Khách ghé tiệm hay chọn nhất dạo này" : "Được nhiều khách mang về";
}

function lovedCardHtml(entry, i, pick) {
  const { product: p, rank } = entry;
  const hero = i === 0;
  const url = `product-detail.html?id=${encodeURIComponent(p.id)}`;
  const pi = getPriceInfo(p);
  const stock = Number(p.stock);
  const careChip = labelChipsHtml(p, { groupId: "care", limit: 1 });
  const facts = [
    p.specs?.light ? `<li>${ICONS.sun}<span>${escapeHTML(p.specs.light)}</span></li>` : "",
    p.specs?.water ? `<li>${ICONS.water}<span>Tưới ${escapeHTML(p.specs.water)}</span></li>` : "",
    careChip ? `<li>${careChip}</li>` : "",
  ].join("");
  const seal = pick
    ? `<span class="loved-seal loved-seal--pick" aria-hidden="true">${ICONS.leaf}</span>`
    : `<span class="loved-seal loved-seal--${rank}" aria-hidden="true"><small>Hạng</small><b>${rank}</b></span>`;
  const kicker = !hero ? "" : `<p class="loved-card__kicker">${pick ? "Tiệm gợi ý trước tiên" : "Được thương nhất tiệm"}</p>`;
  const pitch = hero ? firstSentence(p.description) : "";
  const button = stock <= 0
    ? `<button class="btn btn--ghost" type="button" data-add="${escapeHTML(p.id)}" data-backorder="1" title="Hết hàng — đặt trước, giao khi có hàng"><span class="btn__label">Đặt trước</span></button>`
    : `<button class="btn ${hero ? "btn--primary" : "btn--ghost"}" type="button" data-add="${escapeHTML(p.id)}"><span class="btn__label" aria-live="polite">Thêm vào giỏ</span></button>`;
  return `
      <li class="loved__item${hero ? " loved__item--hero" : ""}" style="--i:${i}">
        <article class="loved-card${hero ? " loved-card--hero" : ""}${pick ? " loved-card--pick" : ""}">
          <div class="loved-card__media">
            <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.imageAlt || p.name)}" data-fallback loading="lazy" decoding="async" width="400" height="500">
            ${seal}
            ${pi.percent > 0 ? `<span class="badge-sale loved-card__sale">−${pi.percent}%</span>` : ""}
            ${p.scientificName ? `<div class="specimen-tag" aria-hidden="true"><em>${escapeHTML(p.scientificName)}</em><span>${specimenCode(p.id)}</span></div>` : ""}
          </div>
          <div class="loved-card__body">
            ${kicker}
            <h3 class="loved-card__name"><a class="loved-card__link" href="${url}">${pick ? "" : `<span class="visually-hidden">Hạng ${rank}: </span>`}${escapeHTML(p.name)}</a></h3>
            ${p.scientificName ? `<p class="loved-card__sci"><em>${escapeHTML(p.scientificName)}</em></p>` : ""}
            ${pitch ? `<p class="loved-card__pitch">${escapeHTML(pitch)}</p>` : ""}
            ${facts ? `<ul class="loved-card__facts">${facts}</ul>` : ""}
            <p class="loved-card__love"><span class="loved-card__love-main">${HEART_ICON}<span>${lovedLine({ ...entry, pick })}</span></span>${cardRatingHtml(p.id)}${
              stock > 0 && stock <= 5 ? `<span class="loved-card__low">Chỉ còn ${stock} chậu</span>` : ""}</p>
            <div class="loved-card__foot">
              <p class="loved-card__price">${formatPrice(pi.price)}${pi.original ? ` <s>${formatPrice(pi.original)}</s>` : ""}</p>
              ${button}
              <span class="loved-card__more" aria-hidden="true">Xem chi tiết <i>→</i></span>
            </div>
          </div>
        </article>
      </li>`;
}

function renderBestSellers(products, orders, categories = []) {
  const section = document.getElementById("bestSellers");
  const list = document.getElementById("bestSellersList");
  if (!section || !list) return;

  let top = topSellers(products, orders, { max: 3, categories });
  const pick = !top.length;                 // chưa có cây nào bán nhiều hơn hẳn → tiệm chọn giúp
  if (pick) top = shopPicks(products, categories);
  if (!top.length) { section.hidden = true; return; } // không có gì để gợi ý thì ẩn hẳn, không hiện khung trống

  const one = top.length === 1;
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText("lovedEyebrow", pick ? "Tiệm chọn giúp bạn" : "Bảng tin của tiệm");
  setText("lovedTitle", pick ? (one ? "Một chậu dễ tính để bắt đầu" : "Mấy chậu dễ tính để bắt đầu") : "Cây được khách thương nhất");
  setText("lovedSub", pick
    ? "Chưa biết chọn cây nào? Mấy chậu này chịu được vài lần quên tưới, hợp người mới trồng."
    : one
      ? "Dạo này chậu này rời tiệm nhanh nhất — vừa gói xong lại có người hỏi."
      : "Mấy chậu rời tiệm nhanh nhất dạo gần đây — vừa gói xong lại có người hỏi.");
  const info = document.getElementById("lovedInfo");
  if (info) info.hidden = pick;             // chú thích cách xếp chỉ có nghĩa khi đang xếp hạng

  section.hidden = false;
  list.className = `loved__list loved__list--${top.length}`;
  list.innerHTML = top.map((entry, i) => lovedCardHtml(entry, i, pick)).join("");
  attachImageFallback(list);

  // Hiện dần khi cuộn tới (thẻ lớn đi trước). Không có IntersectionObserver / bật giảm chuyển động → hiện sẵn.
  if (!("IntersectionObserver" in window) || prefersReducedMotion()) return;
  section.classList.add("loved--anim");
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    section.classList.add("is-in");
    io.disconnect();
  }, { threshold: 0.12 });
  io.observe(section);
}

// Element DOM
const productGrid = document.getElementById("productGrid");
const categoryList = document.getElementById("categoryList");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const resultCount = document.getElementById("resultCount");
const activeFilterBar = document.getElementById("activeFilterBar");
const clearFilterBtn = document.getElementById("clearFilterBtn");
const paginationEl = document.getElementById("pagination");

// M1: Animation hero mở màn (chỉ chạy 1 lần khi tải trang)
function initHeroAnimation() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  // Gắn chỉ số --i cho từng dòng tiêu đề
  hero.querySelectorAll(".hero__title .line").forEach((line, index) => {
    line.style.setProperty("--i", index);
  });
  requestAnimationFrame(() => {
    hero.classList.add("is-ready");
  });
}

// Quy đổi câu trả lời quiz → khoảng careLevel: xem quizLightRange / quizWaterRange trong quiz.js

// Lọc mảng sản phẩm theo state hiện tại
function getFilteredProducts() {
  let list = [...state.allProducts];

  // 1. Lọc theo danh mục
  if (state.categoryId !== "all") {
    list = list.filter((p) => String(p.categoryId) === String(state.categoryId));
  }

  // 2. Lọc an toàn cho pet nếu từ Quiz
  if (state.petSafeOnly) {
    list = list.filter((p) => p.petSafe === true);
  }

  // 3. Lọc theo quiz: ánh sáng
  const lightRange = quizLightRange(state.quizAnswers.light);
  if (lightRange) {
    list = list.filter((p) => {
      if (!p.careLevel) return false; // phụ kiện không có careLevel → loại khỏi quiz
      return p.careLevel.light >= lightRange.min && p.careLevel.light <= lightRange.max;
    });
  }

  // 4. Lọc theo quiz: nước
  const waterRange = quizWaterRange(state.quizAnswers.water);
  if (waterRange) {
    list = list.filter((p) => {
      if (!p.careLevel) return false;
      return p.careLevel.water >= waterRange.min && p.careLevel.water <= waterRange.max;
    });
  }

  // 5. Tìm kiếm theo tên & tên khoa học (không dấu)
  const q = removeAccents(state.searchQuery).trim();
  if (q) {
    list = list.filter((p) => {
      const name = removeAccents(p.name);
      const sci = removeAccents(p.scientificName);
      return name.includes(q) || sci.includes(q);
    });
  }

  // 6. Sắp xếp
  switch (state.sortBy) {
    case "price-asc":
      list.sort((a, b) => getPriceInfo(a).price - getPriceInfo(b).price);
      break;
    case "price-desc":
      list.sort((a, b) => getPriceInfo(b).price - getPriceInfo(a).price);
      break;
    case "name-az":
      list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
      break;
    case "best":
      list.sort((a, b) => (state.soldMap[String(b.id)] || 0) - (state.soldMap[String(a.id)] || 0));
      break;
    case "newest":
      list.sort((a, b) => (new Date(b.addedDate || 0) - new Date(a.addedDate || 0)) || 0);
      break;
    default:
      // Mặc định giữ thứ tự trong db.json
      break;
  }

  return list;
}

// M4: Kỹ thuật FLIP để trượt mượt mà khi lọc / sắp xếp
function renderGridFLIP(filteredProducts) {
  if (!productGrid) return;

  // Empty state nếu 0 kết quả
  if (filteredProducts.length === 0) {
    const catName =
      state.categoryId === "all"
        ? ""
        : state.categories.find((c) => String(c.id) === String(state.categoryId))?.name || "";
    const catText = catName ? `trong '${catName}' ` : "";
    const queryText = state.searchQuery ? `khớp với '${state.searchQuery}'` : "";
    const quizText = hasAnyQuizAnswer() ? " theo điều kiện quiz" : "";

    productGrid.innerHTML = `
      <div class="state" role="status">
        ${ICONS.search}
        <h3>Không tìm thấy cây nào ${catText}${queryText}${quizText}</h3>
        <p>Thử tìm bằng tên khác hoặc gỡ bớt bộ lọc xem sao bạn nhé.</p>
        <button class="btn btn--ghost" id="emptyResetBtn" type="button">Xóa bộ lọc</button>
      </div>`;

    document.getElementById("emptyResetBtn")?.addEventListener("click", resetFilters);
    updateResultCount(0);
    renderPagination(0);  // ẩn pagination
    return;
  }

  // ===== Phân trang =====
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;
  const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = filteredProducts.slice(start, end);

  const reduceMotion = prefersReducedMotion();

  // 1. FIRST: Ghi lại vị trí các card đang có trong DOM
  const firstPositions = new Map();
  const oldCells = Array.from(productGrid.children);
  oldCells.forEach((cell) => {
    const id = cell.dataset.productId;
    if (id) {
      firstPositions.set(id, cell.getBoundingClientRect());
    }
  });

  // Build HTML mới một lần duy nhất (CHỈ sản phẩm của trang hiện tại)
  const isFirstLoad = productGrid.dataset.loaded !== "true";

  const newHtml = pageItems
    .map((p, idx) => {
      const cardHtml = renderProductCard(p, { eager: idx < 2 && isFirstLoad });
      return `<li class="card-cell" data-product-id="${p.id}">${cardHtml}</li>`;
    })
    .join("");

  productGrid.innerHTML = newHtml;
  productGrid.dataset.loaded = "true";
  attachImageFallback(productGrid);
  markFavorites(productGrid);

  // Highlight từ khóa khớp nếu có tìm kiếm
  if (state.searchQuery.trim()) {
    productGrid.querySelectorAll(".card").forEach((card) => {
      const nameEl = card.querySelector('[data-role="name"]');
      const sciEl = card.querySelector('[data-role="sci"]');
      if (nameEl) setHighlightedText(nameEl, nameEl.textContent, state.searchQuery);
      if (sciEl) setHighlightedText(sciEl, sciEl.textContent, state.searchQuery);
    });
  }

  const newCells = Array.from(productGrid.children);

  if (isFirstLoad || reduceMotion) {
    // Lần đầu tải trang -> dùng M2 IntersectionObserver
    revealOnScroll(newCells);
    updateResultCount(filteredProducts.length);
    renderPagination(totalPages);
    return;
  }

  // 2. LAST & INVERT & PLAY (FLIP)
  newCells.forEach((cell) => {
    const id = cell.dataset.productId;
    const firstPos = firstPositions.get(id);

    if (firstPos) {
      // Card cũ còn lại: tính khoảng cách di chuyển
      const lastPos = cell.getBoundingClientRect();
      const deltaX = firstPos.left - lastPos.left;
      const deltaY = firstPos.top - lastPos.top;

      if (deltaX !== 0 || deltaY !== 0) {
        cell.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        cell.style.transition = "none";
        markRevealed(cell);

        requestAnimationFrame(() => {
          cell.style.transition = "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)";
          cell.style.transform = "";
        });
      } else {
        markRevealed(cell);
      }
    } else {
      // Card mới vào
      cell.classList.add("is-entering");
      markRevealed(cell);
      requestAnimationFrame(() => {
        cell.classList.add("is-in");
      });
    }
  });

  updateResultCount(filteredProducts.length);
  renderPagination(totalPages);
}

// ===== Render phân trang =====
function renderPagination(totalPages) {
  if (!paginationEl) return;
  if (!totalPages || totalPages <= 1) {
    paginationEl.hidden = true;
    paginationEl.innerHTML = "";
    return;
  }
  paginationEl.hidden = false;

  const current = state.currentPage;
  // Tính các trang hiện ra (hiện trang đầu, cuối, và current ±1; ellipsis cho khoảng cách)
  const pagesToShow = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 1) {
      pagesToShow.push(i);
    } else if (pagesToShow[pagesToShow.length - 1] !== "...") {
      pagesToShow.push("...");
    }
  }

  const parts = [];
  parts.push(`<button class="pagination__btn pagination__nav" type="button" data-page="${current - 1}" ${current === 1 ? "disabled" : ""} aria-label="Trang trước">‹</button>`);
  pagesToShow.forEach((p) => {
    if (p === "...") {
      parts.push(`<span class="pagination__ellipsis" aria-hidden="true">…</span>`);
    } else {
      parts.push(`<button class="pagination__btn ${p === current ? "is-active" : ""}" type="button" data-page="${p}" aria-label="Trang ${p}" ${p === current ? "aria-current='page'" : ""}>${p}</button>`);
    }
  });
  parts.push(`<button class="pagination__btn pagination__nav" type="button" data-page="${current + 1}" ${current === totalPages ? "disabled" : ""} aria-label="Trang sau">›</button>`);
  parts.push(`<span class="pagination__info">Trang <strong>${current}</strong>/${totalPages}</span>`);

  paginationEl.innerHTML = parts.join("");
}

// Chuyển sang trang khác (không reset bộ lọc)
function goToPage(page) {
  state.currentPage = page;
  const filtered = getFilteredProducts();
  renderGridFLIP(filtered);
  // Cuộn lên đầu catalog
  const catalog = document.getElementById("catalog");
  if (catalog) catalog.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateResultCount(count) {
  if (resultCount) {
    resultCount.textContent = `${count} sản phẩm`;
  }
  // Cập nhật URL query param
  const url = new URL(window.location);
  if (state.categoryId !== "all") {
    url.searchParams.set("cat", state.categoryId);
  } else {
    url.searchParams.delete("cat");
  }
  history.replaceState(null, "", url);

  // Cập nhật dải active filter nếu có bớt/thêm
  if (activeFilterBar) {
    const hasFilter = state.categoryId !== "all" || state.searchQuery || state.petSafeOnly || state.sortBy !== "default" || hasAnyQuizAnswer();
    activeFilterBar.hidden = !hasFilter;
    // Đang lọc theo gợi ý chọn cây → nói rõ đang lọc theo điều kiện nào
    const note = activeFilterBar.querySelector("span");
    if (note) {
      const labels = quizLabels(state.quizAnswers);
      note.textContent = labels.length
        ? `Đang lọc theo gợi ý chọn cây: ${labels.join(" · ")}.`
        : "Đang áp dụng bộ lọc.";
    }
  }
}

// Ô tìm kiếm bị đổi giá trị bằng code (xóa bộ lọc…) → cập nhật nút xóa + chấm báo "đang có từ khóa"
function syncSearchBox() {
  const form = document.getElementById("searchForm");
  if (!form || !searchInput) return;
  const has = searchInput.value.length > 0;
  form.classList.toggle("has-value", has);
  const clear = form.querySelector(".header-search__clear");
  if (clear) clear.hidden = !has;
}

// Kiểm tra đã trả lời quiz nào chưa
function hasAnyQuizAnswer() {
  return state.quizAnswers.light || state.quizAnswers.water || state.quizAnswers.pet;
}

// Kiểm tra đã trả lời ĐỦ 3 câu quiz chưa
function hasAllQuizAnswers() {
  return state.quizAnswers.light && state.quizAnswers.water && state.quizAnswers.pet;
}

function resetFilters() {
  state.categoryId = "all";
  state.searchQuery = "";
  state.sortBy = "default";
  state.petSafeOnly = false;
  state.quizAnswers = { light: null, water: null, pet: null };
  if (searchInput) { searchInput.value = ""; syncSearchBox(); }
  if (sortSelect) sortSelect.value = "default";

  // Cập nhật tab UI
  document.querySelectorAll("#categoryList .tab").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.catId === "all" ? "true" : "false");
  });

  // Reset quiz buttons
  document.querySelectorAll(".quiz__opt").forEach((opt) => opt.setAttribute("aria-pressed", "false"));

  applyFilters();
}

// Lần vẽ đầu tiên sau khi bấm "quay lại" từ trang chi tiết: mở đúng trang phân trang đang xem lúc rời đi
let firstPage = backPage();

function applyFilters() {
  // Khi lọc/sắp xếp/tìm kiếm thay đổi → quay về trang 1
  state.currentPage = firstPage;
  firstPage = 1;
  const filtered = getFilteredProducts();
  renderGridFLIP(filtered);
  updateTabCounts();
}

// Cập nhật số lượng trên mỗi tab danh mục theo bộ lọc hiện tại
// (trừ filter category để tab vẫn hiện đúng số SP trong mỗi danh mục)
function getPreCategoryFiltered() {
  let list = [...state.allProducts];
  // Áp dụng tất cả filter NGOẠI TRỪ category
  if (state.petSafeOnly) list = list.filter((p) => p.petSafe === true);
  const lr = quizLightRange(state.quizAnswers.light);
  if (lr) list = list.filter((p) => p.careLevel && p.careLevel.light >= lr.min && p.careLevel.light <= lr.max);
  const wr = quizWaterRange(state.quizAnswers.water);
  if (wr) list = list.filter((p) => p.careLevel && p.careLevel.water >= wr.min && p.careLevel.water <= wr.max);
  const q = removeAccents(state.searchQuery).trim();
  if (q) list = list.filter((p) => removeAccents(p.name).includes(q) || removeAccents(p.scientificName).includes(q));
  return list;
}

function updateTabCounts() {
  if (!categoryList) return;
  const base = getPreCategoryFiltered();
  categoryList.querySelectorAll(".tab").forEach((btn) => {
    const catId = btn.dataset.catId;
    const count = catId === "all" ? base.length : base.filter((p) => String(p.categoryId) === String(catId)).length;
    const countEl = btn.querySelector(".tab__count");
    if (countEl) countEl.textContent = `(${count})`;
  });
}

// Render các tab danh mục
function renderCategories(categories) {
  if (!categoryList) return;

  const allTab = `
    <button class="tab" type="button" role="tab" data-cat-id="all" aria-selected="${state.categoryId === "all" ? "true" : "false"}">
      Tất cả <span class="tab__count">(${state.allProducts.length})</span>
    </button>`;

  const itemsHtml = categories
    .map((cat) => {
      const count = state.allProducts.filter((p) => String(p.categoryId) === String(cat.id)).length;
      const isSelected = String(state.categoryId) === String(cat.id);
      if (count === 0 && !isSelected) return ""; // danh mục chưa có sản phẩm → không hiện tab trống cho khách
      return `
        <button class="tab" type="button" role="tab" data-cat-id="${cat.id}" aria-selected="${isSelected ? "true" : "false"}">
          ${cat.name} <span class="tab__count">(${count})</span>
        </button>`;
    })
    .join("");

  categoryList.innerHTML = allTab + itemsHtml;

  // Event delegation cho danh mục
  categoryList.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const catId = btn.dataset.catId;
    if (catId === state.categoryId) return;

    state.categoryId = catId;
    categoryList.querySelectorAll(".tab").forEach((t) => {
      t.setAttribute("aria-selected", t === btn ? "true" : "false");
    });
    applyFilters();
  });
}

// Gợi ý chọn cây: câu hỏi + kết quả nằm trong hộp thoại (quiz.js).
// Ở đây chỉ nhận yêu cầu "Lọc cả cửa hàng theo kết quả" để lọc lưới sản phẩm.
const QUIZ_VALUES = { light: ["direct", "indirect", "low"], water: ["forget", "weekly", "eager"], pet: ["yes", "no"] };

function applyQuizAnswers(answers, { scroll = true } = {}) {
  const pickValid = (key) => (QUIZ_VALUES[key].includes(answers?.[key]) ? answers[key] : null);
  state.quizAnswers = { light: pickValid("light"), water: pickValid("water"), pet: pickValid("pet") };
  state.petSafeOnly = state.quizAnswers.pet === "yes";
  // Kết quả gợi ý tính trên toàn bộ cây → bỏ lọc danh mục / từ khóa đang có để không ra danh sách rỗng khó hiểu
  state.categoryId = "all";
  state.searchQuery = "";
  if (searchInput) { searchInput.value = ""; syncSearchBox(); }
  document.querySelectorAll("#categoryList .tab").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.catId === "all" ? "true" : "false");
  });
  applyFilters();
  if (scroll) document.getElementById("catalog")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

function initPlantQuiz() {
  // Bấm trong hộp thoại khi đang ở trang chủ
  window.addEventListener("quiz:apply", (e) => applyQuizAnswers(e.detail));

  // Tới từ trang khác: index.html?ql=…&qw=…&qp=…#catalog
  const params = new URLSearchParams(location.search);
  if (params.has("ql") || params.has("qw") || params.has("qp")) {
    applyQuizAnswers({ light: params.get("ql"), water: params.get("qw"), pet: params.get("qp") }, { scroll: false });
    ["ql", "qw", "qp"].forEach((k) => params.delete(k));
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash); // F5 không lọc lại ngoài ý muốn
  }
}

// Event delegation cho nút "Thêm vào giỏ" trên lưới sản phẩm (async)
function initAddToCartHandler() {
  if (!productGrid) return;
  const onAdd = async (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn || btn.disabled) return;

    if (!(await requireLogin())) return;

    const productId = btn.dataset.add;
    const product = state.allProducts.find((p) => String(p.id) === String(productId));
    if (!product) return;

    const res = await addToCart(product, 1, product.stock || Infinity);
    if (res.added === 0) { showToast(stockFullMessage(product), { icon: "alert" }); return; }
    animateAddButton(btn);
    // Ảnh sản phẩm bay vào icon giỏ; "hạ cánh" xong mới rung icon + nhảy số
    flyToCart(btn.closest(".card, .loved-card")?.querySelector(".card__media img, .loved-card__media img")).then(async () => {
      await updateCartBadge();
      bumpCartIcon();
    });
    showToast(`Đã thêm "${product.name}" vào giỏ hàng`, {
      image: product.image,
      link: { href: "cart.html", label: "Xem giỏ" },
    });
  };
  productGrid.addEventListener("click", onAdd);
  document.getElementById("bestSellersList")?.addEventListener("click", onAdd); // thẻ ở "Bảng tin của tiệm"
}

// Khởi tạo trang chủ
async function initApp() {
  await initPage();
  initHeroAnimation();

  // Đọc ?cat= từ URL nếu người dùng lưu bookmark
  const urlCat = new URLSearchParams(window.location.search).get("cat");
  if (urlCat) state.categoryId = urlCat;

  // Hiển thị skeleton trong lúc tải dữ liệu
  if (productGrid) {
    productGrid.innerHTML = renderSkeletonCards(8);
  }

  try {
    // Promise.all tải song song dữ liệu
    const [categories, products, promotions, orders, reviews] = await Promise.all([
      getCategories(),
      getProducts(),
      getPromotions().catch(() => []),
      getOrders().catch(() => []),
      getReviews().catch(() => []),
      ensureLabels(),   // nhãn sản phẩm (độ khó, an toàn…) — cần có trước khi vẽ thẻ
    ]);
    setCardRatings(reviews); // sao + số đánh giá hiện ngay trên thẻ sản phẩm
    // Gợi ý tức thì dưới ô tìm kiếm (nạp động, lỗi cũng không ảnh hưởng trang)
    import("./search-suggest.js").then((m) => m.initSearchSuggest(() => state.allProducts)).catch(() => {});
    state.categories = categories;
    state.allProducts = products;
    state.orders = orders;

    // Số loài trên hero lấy từ dữ liệu thật: thêm/xóa cây ở admin là số tự đổi
    const plants = products.filter((p) => isPlant(p, categories));
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText("heroSpeciesCount", plants.length);
    setText("heroFactNum1", plants.length);
    setText("heroCtaCount", plants.filter((p) => Number(p.stock) > 0).length);

    // Giá trên mọi thẻ sản phẩm tự giảm theo khuyến mãi đang chạy
    setActivePromotions(promotions);

    // Sale banner — chỉ hiện nếu có promotion đang active
    const activePromos = getActivePromotions(promotions);
    if (activePromos.length > 0) {
      state.activePromotion = activePromos[0];
      renderSaleBanner(state.activePromotion);
    }

    // Banner theo lịch (vd Giáng sinh tự bật đúng dịp) — nạp động, không chặn
    import("./banner.js").then((m) => m.initScheduledBanner()).catch(() => {});

    // Hàng mới về + Bán chạy
    renderNewArrivals(products);
    renderBestSellers(products, orders, categories);
    state.soldMap = Object.fromEntries(
      getBestSellers(products, orders, Infinity, 0).map(({ product, totalSold }) => [String(product.id), totalSold]));

    renderCategories(categories);
    applyFilters();
    // Đảm bảo đánh dấu tim yêu thích sau khi lưới đã render (await để chắc chắn)
    await markFavorites(productGrid);
  } catch (err) {
    console.error("Lỗi tải sản phẩm:", err);
    if (productGrid) {
      const isNetErr = isNetworkError(err);
      productGrid.innerHTML = `
        <div class="state" role="status">
          ${ICONS.alert}
          <h2>Không kết nối được dữ liệu</h2>
          <p>${
            isNetErr
              ? `Vui lòng mở Terminal và chạy lệnh: <code>node tools/start-db.mjs</code>`
              : `Có lỗi xảy ra: ${err.message}`
          }</p>
          <button class="btn btn--primary" type="button" onclick="location.reload()">Thử lại</button>
        </div>`;
    }
  }

  // Gắn sự kiện tìm kiếm & sắp xếp
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      debounce((e) => {
        state.searchQuery = e.target.value;
        applyFilters();
      }, 180)
    );
  }

  // Bấm nút tìm hoặc Enter → lọc ngay + cuộn tới khu kết quả
  const searchForm = document.getElementById("searchForm");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault(); // tránh reload trang khi Enter
      state.searchQuery = searchInput.value;
      applyFilters();
      const catalog = document.getElementById("catalog");
      if (catalog) catalog.scrollIntoView({ behavior: "smooth", block: "start" });
      searchInput.blur();
    });
  }

  // Ô tìm kiếm: nút xóa, trạng thái có-từ-khóa, và trên điện thoại thì mở/thu bằng class .is-open
  const searchBtn = document.querySelector(".header-search__btn");
  if (searchForm && searchBtn && searchInput) {
    const phone = window.matchMedia("(max-width: 599px)");
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "header-search__clear";
    clearBtn.setAttribute("aria-label", "Xóa từ khóa");
    clearBtn.textContent = "✕";
    clearBtn.hidden = true;
    searchBtn.before(clearBtn);

    const sync = () => {
      const has = searchInput.value.length > 0;
      searchForm.classList.toggle("has-value", has);
      clearBtn.hidden = !has;
    };
    // .search-open trên header: điện thoại dùng để ẨN các nút khác của header khi ô tìm kiếm mở rộng
    // (nếu không, nút ngôn ngữ / tim / giỏ nằm đè lên ô và che mất chữ đang gõ).
    const header = searchForm.closest(".site-header");
    const open = () => { searchForm.classList.add("is-open"); header?.classList.add("search-open"); };
    const close = () => { searchForm.classList.remove("is-open"); header?.classList.remove("search-open"); };

    searchInput.addEventListener("focus", open);
    searchInput.addEventListener("input", () => { sync(); open(); });
    // Rời khỏi cả cụm tìm kiếm (không phải bấm sang nút xóa / nút tìm) thì thu lại
    searchForm.addEventListener("focusout", () => setTimeout(() => {
      if (!searchForm.contains(document.activeElement)) close();
    }, 120));
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true })); // bộ lọc + gợi ý cập nhật theo
      searchInput.focus();
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !searchInput.value) searchInput.blur();
    });
    // Điện thoại: ô đang thu gọn → chạm nút kính lúp là MỞ ô (không gửi tìm kiếm)
    searchBtn.addEventListener("click", (e) => {
      if (phone.matches && !searchForm.classList.contains("is-open")) {
        e.preventDefault();
        open();
        searchInput.focus();
      }
    });
    sync();
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      applyFilters();
    });
  }

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", resetFilters);
  }

  // Event delegation cho nút phân trang
  if (paginationEl) {
    paginationEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-page]");
      if (!btn || btn.disabled) return;
      const page = Number(btn.dataset.page);
      if (!isNaN(page) && page >= 1) goToPage(page);
    });
  }

  initPlantQuiz();
  initAddToCartHandler();
  initFavoriteButtons(productGrid);
  initScrollAnimations();

  const hero = document.querySelector('.hero');
  if (hero) initParticleField(hero);
  initFloatingLeaves(document.body);
  const quizSection = document.getElementById('plantQuiz');
  if (quizSection) initTopoField(quizSection);

  // Dynamic import: chatbot chỉ tải khi cần → trang chủ load nhanh hơn
  try {
    const { initChatbot } = await import("./chatbot.js");
    await initChatbot();
  } catch (err) {
    console.warn("Chatbot load failed:", err);
  }

  // Chat với nhân viên
  try {
    const { initCustomerChat } = await import("./chat.js");
    await initCustomerChat();
  } catch (err) {
    console.warn("Chat load failed:", err);
  }
}

// ===== Animate.css: scroll-triggered animations =====
function initScrollAnimations() {
  if (prefersReducedMotion()) return;

  // Các section cần animate khi cuộn đến
  const animateTargets = [
    { selector: ".catalog__head", animation: "animate__fadeInUp" },
    { selector: ".first-plant__head", animation: "animate__fadeInUp" },
    { selector: ".quiz fieldset", animation: "animate__fadeInUp", stagger: 120 },
    { selector: ".site-footer__grid > div", animation: "animate__fadeInUp", stagger: 80 },
  ];

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const delay = Number(entry.target.dataset.animDelay) || 0;
        setTimeout(() => {
          entry.target.style.opacity = "";
          entry.target.classList.add("animate__animated", entry.target.dataset.anim);
        }, delay);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  animateTargets.forEach(({ selector, animation, stagger }) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      el.style.opacity = "0";
      el.dataset.anim = animation;
      if (stagger) el.dataset.animDelay = String(i * stagger);
      observer.observe(el);
    });
  });
}

document.addEventListener("DOMContentLoaded", initApp);
