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
} from "./ui.js";
import { getActivePromotions, getCountdown, getNewArrivals, getBestSellers, topSellers, setActivePromotions, getPriceInfo, isPlant } from "./sale.js";
import { markFavorites, initFavoriteButtons } from "./favorites.js";
import { flyToCart } from "./fx.js";
import { quizLightRange, quizWaterRange, quizLabels } from "./quiz.js";
import { ensureLabels } from "./labels.js";

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

// ===== Sản Phẩm Bán Chạy: tối đa 3 cây, không cắt ngang nhóm hòa nhau (xem topSellers trong sale.js) =====
function renderBestSellers(products, orders, categories = []) {
  const section = document.getElementById("bestSellers");
  const list = document.getElementById("bestSellersList");
  if (!section || !list) return;

  const top = topSellers(products, orders, { max: 3, categories });
  if (!top.length) { section.hidden = true; return; } // chưa có cây nào bán nhiều hơn hẳn các cây khác

  const most = top[0].totalSold;
  const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const RANK_NAME = { 1: "Bán chạy nhất", 2: "Hạng 2", 3: "Hạng 3" };
  section.hidden = false;
  list.className = `podium podium--${top.length}`;
  list.innerHTML = top.map(({ product: p, totalSold, rank }, i) => `
      <li class="podium__item podium__item--r${rank}" style="--i:${i};--share:${(totalSold / most).toFixed(3)}">
        <a href="product-detail.html?id=${encodeURIComponent(p.id)}" class="seller-card">
          <div class="seller-card__img">
            <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" data-fallback loading="lazy" width="200" height="250">
            <span class="seller-card__rank" aria-hidden="true">${MEDAL[rank] || `#${rank}`}</span>
          </div>
          <div class="seller-card__info">
            <span class="seller-card__tag">${RANK_NAME[rank] || `Hạng ${rank}`}${top.filter((x) => x.rank === rank).length > 1 ? " (đồng hạng)" : ""}</span>
            <h3 class="seller-card__name">${escapeHTML(p.name)}</h3>
            <span class="seller-card__sold">Đã bán <strong>${totalSold}</strong> chậu</span>
            <span class="seller-card__bar" aria-hidden="true"><i></i></span>
            <span class="seller-card__price">${priceHtml(p)}</span>
          </div>
        </a>
      </li>`).join("");
  const note = document.getElementById("bestSellersNote");
  if (note) {
    note.hidden = top.length >= 3;
    note.textContent = top.length < 3
      ? `Chỉ hiện ${top.length} cây vì các cây tiếp theo đang bán bằng nhau — chưa phân được hạng.`
      : "";
  }
  attachImageFallback(list);
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
  productGrid.addEventListener("click", async (e) => {
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
    flyToCart(btn.closest(".card")?.querySelector(".card__media img")).then(async () => {
      await updateCartBadge();
      bumpCartIcon();
    });
    showToast(`Đã thêm "${product.name}" vào giỏ hàng`, {
      image: product.image,
      link: { href: "cart.html", label: "Xem giỏ" },
    });
  });
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
