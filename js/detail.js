// ==========================================================
// detail.js — Logic trang chi tiết sản phẩm
// ==========================================================
import { getProductById, getCategories, getProducts, getReviews, createReview, updateReview, deleteReview, getUsers, getStockAlerts, createStockAlert, getOrdersByUser } from "./api.js";
import { initImageViewer } from "./image-viewer.js";
import { initFloatingLeaves } from "./three-ambient.js";
import { addToCart, requireLogin, getUser, stockFullMessage } from "./storage.js";
import { markFavorites, initFavoriteButtons } from "./favorites.js";
import { flyToCart } from "./fx.js";
import { ensureLabels, labelChipsHtml } from "./labels.js";
import { ensurePromotions, getPriceInfo } from "./sale.js";
import { careCardHtml, accessoryCardHtml, initCareCard } from "./care-card.js";
import {
  initPage,
  renderProductCard,
  formatPrice,
  specimenCode,
  showToast,
  animateAddButton,
  bumpCartIcon,
  updateCartBadge,
  attachImageFallback,
  escapeHTML,
  ICONS,
  PLACEHOLDER,
  imgAttrs,
} from "./ui.js";

const detailContainer = document.getElementById("detailContainer");

function detailPriceHtml(product, basePrice) {
  const pi = getPriceInfo(product, basePrice);
  return `<span>${formatPrice(pi.price)}</span>${pi.original ? ` <s>${formatPrice(pi.original)}</s>` : ""}${
    pi.percent > 0 ? ` <span class="badge-sale info__sale">−${pi.percent}%</span>` : ""
  }${pi.promo ? `<small class="info__promo">🔥 ${escapeHTML(pi.promo.name)}</small>` : ""}`;
}

// Phiếu chăm sóc: hiệu ứng chạy một lần khi cuộn tới (xem js/care-card.js). Giữ tên cũ để nơi gọi không đổi.
function initCareBars(container) {
  initCareCard(container);
}

// Bố cục chi tiết sản phẩm
function renderDetailView(product, categoryName, relatedProducts) {
  const isAccessory = !product.careLevel || !product.specs;
  const isOutOfStock = Number(product.stock) <= 0;

  // Khối chỉ số chăm sóc (M5 — ngôi sao của trang này): phiếu kiểu nhãn tiêu bản, mỗi chỉ số một hình vẽ (js/care-card.js)
  const careSection = isAccessory
    ? accessoryCardHtml(product, specimenCode(product.id))
    : careCardHtml(product, specimenCode(product.id));

  // Khối 4 sản phẩm cùng danh mục
  const relatedHtml = relatedProducts.length
    ? `
      <section class="related">
        <h2>Cây hợp gu với bạn</h2>
        <div class="product-grid">
          ${relatedProducts.map((p) => renderProductCard(p)).join("")}
        </div>
      </section>`
    : "";

  // Variant selector (chỉ khi có variants)
  let variantHtml = "";
  if (product.variants && product.variants.length > 0) {
    variantHtml = `
      <div class="variant-selector" id="variantSelector">
        <h3>Chọn kích thước</h3>
        <div class="variant-options">
          ${product.variants.map((v, i) => `
            <button class="variant-btn ${i === 0 ? "is-active" : ""}" type="button" data-idx="${i}" data-price="${v.price}">
              <span class="variant-btn__label">${escapeHTML(v.label)}</span>
              <span class="variant-btn__price">${formatPrice(getPriceInfo(product, v.price).price)}</span>
            </button>
          `).join("")}
        </div>
      </div>`;
  }

  // Bảng thông tin chi tiết (chỉ cho cây)
  let specsTableHtml = "";
  if (!isAccessory) {
    const specsRows = [
      product.origin && ["Xuất xứ", product.origin],
      product.maxHeight && ["Chiều cao tối đa", product.maxHeight],
      product.growthRate && ["Tốc độ phát triển", product.growthRate],
      product.lifespan && ["Tuổi thọ", product.lifespan],
      product.potMaterial && ["Chất liệu chậu", product.potMaterial],
      product.idealPlacement && product.idealPlacement.length && ["Vị trí phù hợp", product.idealPlacement.join(", ")],
    ].filter(Boolean);

    if (specsRows.length > 0) {
      specsTableHtml = `
        <section class="detail-specs">
          <h2>Thông tin chi tiết</h2>
          <table class="specs-table">
            ${specsRows.map(([th, td]) => `<tr><th>${escapeHTML(th)}</th><td>${escapeHTML(td)}</td></tr>`).join("")}
          </table>
        </section>`;
    }
  }

  // Sản phẩm bao gồm
  let includesHtml = "";
  if (product.includes && product.includes.length > 0) {
    includesHtml = `
      <section class="detail-includes">
        <h3>Sản phẩm bao gồm</h3>
        <ul class="includes-list">
          ${product.includes.map((item) => `<li>${ICONS.check} ${escapeHTML(item)}</li>`).join("")}
        </ul>
      </section>`;
  }

  // Tags
  let tagsHtml = "";
  if (product.tags && product.tags.length > 0) {
    tagsHtml = `
      <div class="detail-tags">
        ${product.tags.map((t) => `<span class="tag">#${escapeHTML(t.replace(/\s+/g, "_"))}</span>`).join("")}
      </div>`;
  }

  return `
    <nav class="breadcrumb" aria-label="Đường dẫn">
      <ol>
        <li><a href="index.html">Trang chủ</a></li>
        <li><a href="index.html?cat=${product.categoryId}">${escapeHTML(categoryName)}</a></li>
        <li><span aria-current="page">${escapeHTML(product.name)}</span></li>
      </ol>
    </nav>

    <div class="detail__grid">
      <!-- Cột trái: Gallery ảnh -->
      <div class="gallery">
        <div class="gallery__main" id="galleryMain">
          <img id="mainGalleryImg" ${imgAttrs(product.image)} alt="${escapeHTML(product.imageAlt || product.name)}" data-fallback width="600" height="750">
          <div class="specimen-tag">
            <em>${escapeHTML(product.scientificName || "Phụ kiện")}</em>
            <span>${specimenCode(product.id)}</span>
          </div>
          <button class="gallery__zoom-hint" type="button" aria-label="Phóng to ảnh">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg>
            Phóng to
          </button>
        </div>
      </div>

      <!-- Cột phải: Thông tin & Đặt hàng -->
      <div class="info">
        <div class="info__titlerow">
          <h1 class="info__title">${escapeHTML(product.name)}</h1>
          <button class="fav-btn" type="button" data-fav="${escapeHTML(product.id)}" aria-label="Yêu thích" aria-pressed="false" title="Lưu vào yêu thích">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>
        ${
          product.scientificName
            ? `<p class="info__sci"><em class="sci">${escapeHTML(product.scientificName)}</em></p>`
            : ""
        }

        <div class="info__price" id="infoPrice">${detailPriceHtml(product, product.variants?.[0]?.price ?? product.price)}</div>

        <div class="info__meta">
          ${labelChipsHtml(product) || (product.careLevel ? "" : `<span class="chip chip--plain">Phụ kiện trồng</span>`)}
          <span class="${product.stock <= 5 ? "stock-low" : ""}">${isOutOfStock ? "Tạm hết hàng" : `Còn ${product.stock} chậu`}</span>
        </div>

        ${variantHtml}

        ${careSection}

        ${specsTableHtml}

        ${includesHtml}

        <div class="info__desc">
          <p>${escapeHTML(product.description)}</p>
        </div>

        ${tagsHtml}

        <!-- Chọn số lượng & Nút bấm mua -->
        <div class="buy">
          <div class="qty">
            <button type="button" id="qtyMinus" aria-label="Giảm số lượng">−</button>
            <input type="number" id="qtyInput" value="1" min="1" max="${product.stock > 0 ? product.stock : 99}">
            <button type="button" id="qtyPlus" aria-label="Tăng số lượng">+</button>
          </div>
          <button class="btn ${isOutOfStock ? "btn--ghost" : "btn--primary"}" id="detailAddBtn" type="button" ${isOutOfStock ? 'data-backorder="1"' : ""}>
            <span class="btn__label" aria-live="polite">${isOutOfStock ? "Đặt trước (hết hàng)" : "Thêm vào giỏ"}</span>
          </button>
        </div>
        ${isOutOfStock ? `
        <div class="backorder-note">
          <p>⚠️ Sản phẩm đang hết hàng. Bạn có thể <strong>đặt trước</strong> (giao khi có hàng) hoặc đăng ký nhận thông báo:</p>
          <button class="btn btn--text" id="notifyStockBtn" type="button">🔔 Báo tôi khi có hàng lại</button>
        </div>` : ""}
      </div>
    </div>

    <!-- Thanh hành động cố định đáy trên Mobile -->
    <div class="actionbar" aria-label="Thanh mua nhanh">
      <div class="actionbar__price">${formatPrice(getPriceInfo(product, product.variants?.[0]?.price ?? product.price).price)}</div>
      <button class="btn btn--primary" id="actionbarAddBtn" type="button" ${isOutOfStock ? "disabled" : ""}>
        ${isOutOfStock ? "Tạm hết" : "Thêm giỏ hàng"}
      </button>
    </div>

    <!-- Đánh giá & bình luận -->
    <section class="reviews" id="reviewsSection" aria-label="Đánh giá sản phẩm">
      <div class="state"><p>Đang tải đánh giá...</p></div>
    </section>

    ${relatedHtml}`;
}

async function initDetail() {
  await initPage();
  document.body.classList.add("page-detail");

  const id = new URLSearchParams(window.location.search).get("id");

  // 1. Không có ?id= trên URL -> Empty state
  if (!id) {
    renderNotFound("Không tìm thấy cây bạn chọn", "Đường dẫn không hợp lệ hoặc thiếu mã sản phẩm.");
    return;
  }

  // Trạng thái đang tải: product-detail.html đã tự vẽ khung xương đúng hình dạng trang (kèm ảnh của thẻ vừa bấm).
  // Chỉ khi không có khung xương mới dùng vòng lá tải.
  if (detailContainer && !detailContainer.querySelector(".pd-skel")) {
    detailContainer.innerHTML = `<div class="state" role="status"><svg class="leaf-loader" viewBox="0 0 48 48" aria-hidden="true"><path class="leaf-loader__leaf" pathLength="1" d="M22 40A14 14 0 0 1 19.6 12.2C31 10 34 9 38 4c2 4 4 8.4 4 16 0 11-9.6 20-20 20Z"/><path class="leaf-loader__vein" pathLength="1" d="M4 42c0-6 3.7-10.7 10.2-12C19 29 24 26 26 24"/></svg><p>Đang tải thông tin cây...</p></div>`;
  }

  try {
    // Tải song song: lấy sản phẩm theo ID + danh mục + tất cả SP
    // Sử dụng cả getProductById VÀ getProducts để fallback
    const [productById, categories, allProducts] = await Promise.all([
      getProductById(id).catch(() => null),
      getCategories(),
      getProducts(),
      ensurePromotions(),
      ensureLabels(),   // nhãn sản phẩm do admin quản lý
    ]);

    // Fallback: nếu getProductById thất bại (CORS, json-server version),
    // tìm trong danh sách toàn bộ sản phẩm đã tải thành công
    let product = productById;
    if (!product && allProducts && allProducts.length > 0) {
      product = allProducts.find((p) => String(p.id) === String(id)) || null;
    }

    // 2. ID không tồn tại -> Empty state
    if (!product) {
      renderNotFound("Không tìm thấy cây này", `Mã sản phẩm "${id}" không tồn tại trong hệ thống.`);
      return;
    }

    // Đổi title trang
    document.title = `${product.name} — Tiệm cây Lá & Sỏi`;

    const categoryName = categories.find((c) => String(c.id) === String(product.categoryId))?.name || "Cây cảnh";

    // 4 sản phẩm liên quan (cùng categoryId, loại trừ chính nó)
    const relatedProducts = allProducts
      .filter((p) => String(p.categoryId) === String(product.categoryId) && String(p.id) !== String(product.id))
      .slice(0, 4);

    // Ảnh của thẻ vừa bấm đang "bay" tới khung ảnh lớn (xem product-flow.js): chờ nó hạ cánh rồi mới thay nội dung
    const landing = (window.__pdReady || 0) - performance.now();
    if (landing > 0) await new Promise((done) => setTimeout(done, Math.min(landing, 450)));
    const hintSrc = window.__pdHint?.src && detailContainer.querySelector(".pd-skel__img") ? window.__pdHint.src : "";

    detailContainer.innerHTML = renderDetailView(product, categoryName, relatedProducts);
    attachImageFallback(detailContainer);

    // Hiện theo lớp: ảnh trước, rồi tên → giá → nhãn → … → nút mua lần lượt trượt lên
    const gallery = detailContainer.querySelector(".gallery");
    const info = detailContainer.querySelector(".info");
    if (hintSrc) {
      // Ảnh nhỏ của thẻ nằm sẵn làm nền, ảnh lớn tải xong thì phủ lên → không chớp trắng
      const main = detailContainer.querySelector("#galleryMain");
      if (main) main.style.background = `url("${hintSrc.replace(/["\\\n]/g, "")}") center / cover no-repeat`;
    } else if (gallery) gallery.classList.add("pd-fade");
    if (info) [...info.children].forEach((el, i) => el.style.setProperty("--pd-i", Math.min(i, 9)));
    detailContainer.classList.add("pd-stage");
    setTimeout(() => detailContainer.classList.remove("pd-stage"), 1400);

    initCareBars(detailContainer);
    const getVariant = initVariantSelector(product);
    initQuantityHandlers(product, getVariant);
    initImageViewer('.gallery__main');
    initFloatingLeaves(document.body);

    // Yêu thích
    markFavorites(detailContainer);
    initFavoriteButtons(detailContainer);

    // Đánh giá & bình luận
    loadReviews(product);

    // Thanh mua dính (màn hình rộng) + lịch chăm sóc tuần đầu + "thường mua cùng" — nạp động, lỗi cũng không sao
    import("./detail-extras.js").then((m) => m.initDetailExtras(product, allProducts)).catch(() => {});

    // Đăng ký báo khi có hàng lại
    const notifyBtn = document.getElementById("notifyStockBtn");
    if (notifyBtn) {
      notifyBtn.addEventListener("click", async () => {
        const user = await getUser();
        if (!user) { showToast("Vui lòng đăng nhập để nhận thông báo", { icon: "alert" }); return; }
        try {
          const existing = await getStockAlerts({ userId: user.id, productId: String(product.id) }).catch(() => []);
          if (existing.length) { showToast("Bạn đã đăng ký nhận thông báo cho sản phẩm này rồi."); return; }
          await createStockAlert({
            userId: String(user.id),
            productId: String(product.id),
            productName: product.name,
            email: user.email,
            notified: false,
            createdAt: new Date().toISOString(),
          });
          notifyBtn.textContent = "✓ Đã đăng ký — sẽ báo qua email khi có hàng";
          notifyBtn.disabled = true;
          showToast("✓ Sẽ gửi email cho bạn khi sản phẩm có hàng lại");
        } catch (err) {
          showToast("Lỗi đăng ký: " + err.message, { icon: "alert" });
        }
      });
    }

    // Dynamic import chatbot — lazy load
    try {
      const { initChatbot } = await import("./chatbot.js");
      await initChatbot();
    } catch (err) {
      console.warn("Chatbot load failed:", err);
    }
    try {
      const { initCustomerChat } = await import("./chat.js");
      await initCustomerChat();
    } catch (err) {
      console.warn("Chat load failed:", err);
    }
  } catch (err) {
    console.error("Lỗi trang chi tiết:", err);
    if (detailContainer) {
      detailContainer.innerHTML = `
        <div class="state" role="status">
          ${ICONS.alert}
          <h2>Không thể nạp dữ liệu</h2>
          <p>Vui lòng kiểm tra JSON-Server đã chạy ở cổng 3000 chưa.</p>
          <button class="btn btn--primary" type="button" onclick="location.reload()">Thử lại</button>
        </div>`;
    }
  }
}

function renderNotFound(title, message) {
  if (!detailContainer) return;
  detailContainer.innerHTML = `
    <div class="state" role="status">
      ${ICONS.search}
      <h2>${escapeHTML(title)}</h2>
      <p>${escapeHTML(message)}</p>
      <a class="btn btn--primary" href="index.html">Về trang chủ</a>
    </div>`;
}

// Variant selector — trả về hàm lấy variant hiện tại
function initVariantSelector(product) {
  const selector = document.getElementById("variantSelector");
  if (!selector || !product.variants || !product.variants.length) {
    return () => null;
  }

  let selectedIdx = 0;

  selector.addEventListener("click", (e) => {
    const btn = e.target.closest(".variant-btn");
    if (!btn) return;

    selectedIdx = Number(btn.dataset.idx);
    const variant = product.variants[selectedIdx];

    selector.querySelectorAll(".variant-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    // Cập nhật giá hiển thị (đã trừ khuyến mãi đang chạy)
    const priceBox = document.getElementById("infoPrice");
    if (priceBox) priceBox.innerHTML = detailPriceHtml(product, variant.price);

    const actionPrice = document.querySelector(".actionbar__price");
    if (actionPrice) actionPrice.textContent = formatPrice(getPriceInfo(product, variant.price).price);
  });

  return () => product.variants[selectedIdx];
}

// Xử lý tăng giảm số lượng & Thêm vào giỏ
function initQuantityHandlers(product, getVariant) {
  const input = document.getElementById("qtyInput");
  const btnMinus = document.getElementById("qtyMinus");
  const btnPlus = document.getElementById("qtyPlus");
  const addBtn = document.getElementById("detailAddBtn");
  const actionbarAddBtn = document.getElementById("actionbarAddBtn");

  const maxStock = Number(product.stock) || Infinity;

  function updateQty(newVal) {
    let v = parseInt(newVal, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > maxStock) v = maxStock;
    if (input) input.value = v;
    if (btnMinus) btnMinus.disabled = v <= 1;
    if (btnPlus) btnPlus.disabled = v >= maxStock;
    return v;
  }

  btnMinus?.addEventListener("click", () => updateQty(Number(input.value) - 1));
  btnPlus?.addEventListener("click", () => updateQty(Number(input.value) + 1));
  input?.addEventListener("change", () => updateQty(input.value));

  async function handleAdd() {
    if (!(await requireLogin())) return;

    const qty = updateQty(input ? input.value : 1);
    const variant = getVariant ? getVariant() : null;
    const res = await addToCart(product, qty, maxStock, variant);
    if (res.added === 0) { showToast(stockFullMessage(product), { icon: "alert" }); return; }
    if (addBtn) animateAddButton(addBtn);
    // Ảnh sản phẩm bay vào icon giỏ; "hạ cánh" xong mới rung icon + nhảy số
    flyToCart(document.getElementById("mainGalleryImg")).then(async () => {
      await updateCartBadge();
      bumpCartIcon();
    });
    const variantSuffix = variant ? ` (${variant.label})` : "";
    const got = Number(res.added) || qty; // có thể ít hơn số chọn nếu giỏ đã có sẵn vài chậu cùng cây
    showToast(`Đã thêm ${got} "${product.name}${variantSuffix}" vào giỏ${got < qty ? ` (kho chỉ còn ${maxStock} chậu)` : ""}`, {
      image: product.image,
      link: { href: "cart.html", label: "Xem giỏ" },
    });
  }

  addBtn?.addEventListener("click", handleAdd);
  actionbarAddBtn?.addEventListener("click", handleAdd);
}

/* ==================== ĐÁNH GIÁ & BÌNH LUẬN ==================== */

// Vẽ dãy sao (filled theo rating, hỗ trợ nửa sao bằng làm tròn)
function starsHTML(rating, interactive = false) {
  const r = Math.round(Number(rating) || 0);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const on = i <= r;
    if (interactive) {
      out += `<button type="button" class="star-input ${on ? "on" : ""}" data-star="${i}" aria-label="${i} sao">★</button>`;
    } else {
      out += `<span class="star ${on ? "on" : ""}">★</span>`;
    }
  }
  return out;
}

async function loadReviews(product) {
  const section = document.getElementById("reviewsSection");
  if (!section) return;

  const [allReviews, users] = await Promise.all([
    getReviews().catch(() => []),
    getUsers().catch(() => []),
  ]);
  const userName = (uid) => users.find((u) => String(u.id) === String(uid))?.name || "Khách";
  const userAvatar = (uid) => users.find((u) => String(u.id) === String(uid))?.avatar || "";

  const reviews = allReviews
    .filter((r) => String(r.productId) === String(product.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const count = reviews.length;
  const avg = count ? (reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count) : 0;

  const currentUser = await getUser();
  const myReview = currentUser ? reviews.find((r) => String(r.userId) === String(currentUser.id)) : null;
  const isShop = currentUser && (currentUser.role === "staff" || currentUser.role === "admin");

  // Chỉ khách đã mua VÀ đã xác nhận nhận được cây này mới được đánh giá.
  // Đơn mới "đã giao" nhưng khách chưa bấm xác nhận thì chưa tính — tránh đánh giá khi chưa cầm hàng.
  let hasBought = false;
  let waitingConfirm = false;
  if (currentUser && !isShop) {
    const myOrders = await getOrdersByUser(currentUser.id).catch(() => []);
    const mine = (o) => (o.items || []).some((it) => String(it.productId) === String(product.id));
    hasBought = myOrders.some((o) => o.status === "completed" && mine(o));
    waitingConfirm = !hasBought && myOrders.some((o) => ["delivered", "delivery_issue"].includes(o.status) && mine(o));
  }

  const roleOf = (uid) => users.find((u) => String(u.id) === String(uid))?.role || "user";
  const repliesHTML = (r) => {
    const replies = Array.isArray(r.replies) ? r.replies : [];
    const items = replies.map((rp) => {
      const fromShop = roleOf(rp.userId) === "staff" || roleOf(rp.userId) === "admin";
      const canDel = currentUser && (String(rp.userId) === String(currentUser.id) || currentUser.role === "admin");
      return `
        <li class="review-reply ${fromShop ? "review-reply--shop" : ""}">
          <div class="review-reply__head">
            <strong>${escapeHTML(userName(rp.userId))}</strong>
            ${fromShop ? `<span class="review-reply__badge">Phản hồi từ shop</span>` : ""}
            <time>${new Date(rp.createdAt).toLocaleDateString("vi-VN")}</time>
            ${canDel ? `<button class="review__del" type="button" data-del-reply="${escapeHTML(String(r.id))}|${escapeHTML(String(rp.id))}" title="Xóa trả lời">×</button>` : ""}
          </div>
          <p>${escapeHTML(rp.text)}</p>
        </li>`;
    }).join("");
    const form = currentUser
      ? `<form class="review-reply-form" data-reply-form="${escapeHTML(String(r.id))}" hidden>
           <input type="text" maxlength="300" placeholder="${isShop ? "Phản hồi với tư cách shop..." : "Viết câu trả lời..."}" required>
           <button class="btn btn--primary btn--sm" type="submit">Gửi</button>
         </form>`
      : "";
    return `${items ? `<ul class="review-replies">${items}</ul>` : ""}${form}`;
  };

  // Thống kê số sao
  const dist = [0, 0, 0, 0, 0];
  reviews.forEach((r) => { const k = Math.round(r.rating); if (k >= 1 && k <= 5) dist[k - 1]++; });

  const listHTML = count
    ? reviews.map((r) => {
        const ava = userAvatar(r.userId);
        const avatarEl = ava
          ? `<img class="review__avatar" src="${escapeHTML(ava)}" alt="" width="40" height="40">`
          : `<span class="review__avatar review__avatar--ph">${escapeHTML((userName(r.userId) || "?").charAt(0).toUpperCase())}</span>`;
        const canDelete = currentUser && (String(r.userId) === String(currentUser.id) || currentUser.role === "admin");
        return `
          <li class="review" data-review-id="${escapeHTML(String(r.id))}">
            ${avatarEl}
            <div class="review__body">
              <div class="review__head">
                <strong>${escapeHTML(userName(r.userId))}</strong>
                <span class="review__stars">${starsHTML(r.rating)}</span>
                <time>${new Date(r.createdAt).toLocaleDateString("vi-VN")}</time>
                ${canDelete ? `<button class="review__del" type="button" data-del-review="${escapeHTML(String(r.id))}" title="Xóa đánh giá">×</button>` : ""}
              </div>
              <p class="review__text">${escapeHTML(r.comment || "")}</p>
              ${currentUser ? `<button class="review__reply-btn" type="button" data-reply-toggle="${escapeHTML(String(r.id))}">↩ Trả lời${(r.replies || []).length ? ` (${r.replies.length})` : ""}</button>` : ""}
              ${repliesHTML(r)}
            </div>
          </li>`;
      }).join("")
    : `<li class="review-empty"><p>Chưa có đánh giá nào. Hãy là người đầu tiên!</p></li>`;

  // Form đánh giá
  let formHTML;
  if (!currentUser) {
    formHTML = `<div class="review-form review-form--guest"><p>Vui lòng <a href="login.html">đăng nhập</a> để viết đánh giá.</p></div>`;
  } else if (isShop) {
    formHTML = `<div class="review-form review-form--guest"><p>Bạn đang đăng nhập với vai trò <strong>${currentUser.role === "admin" ? "quản trị" : "nhân viên"}</strong> — có thể phản hồi đánh giá của khách bằng nút "Trả lời".</p></div>`;
  } else if (myReview) {
    formHTML = `<div class="review-form review-form--done"><p>✓ Bạn đã đánh giá sản phẩm này ${starsHTML(myReview.rating)}. Có thể xóa đánh giá cũ để viết lại.</p></div>`;
  } else if (waitingConfirm) {
    formHTML = `<div class="review-form review-form--guest"><p>📦 Đơn của bạn đang ở bước <strong>chờ xác nhận đã nhận hàng</strong>. Vào <a href="donhang.html">Đơn hàng của tôi</a> bấm <strong>Đã nhận được hàng</strong> là viết đánh giá được ngay.</p></div>`;
  } else if (!hasBought) {
    formHTML = `<div class="review-form review-form--guest"><p>🛒 Chỉ khách <strong>đã mua và đã nhận</strong> cây này mới có thể viết đánh giá. Bạn vẫn có thể trả lời đánh giá của người khác.</p></div>`;
  } else {
    formHTML = `
      <form class="review-form" id="reviewForm">
        <h3>Viết đánh giá của bạn</h3>
        <div class="review-form__stars" id="starInput" role="radiogroup" aria-label="Chọn số sao">
          ${starsHTML(0, true)}
        </div>
        <input type="hidden" id="ratingValue" value="0">
        <textarea id="reviewComment" rows="3" placeholder="Chia sẻ cảm nhận của bạn về sản phẩm..." maxlength="500"></textarea>
        <button class="btn btn--primary" type="submit">Gửi đánh giá</button>
      </form>`;
  }

  section.innerHTML = `
    <div class="reviews__head">
      <h2>Đánh giá sản phẩm</h2>
      <div class="reviews__summary">
        <div class="reviews__avg">
          <span class="reviews__avg-num">${avg.toFixed(1)}</span>
          <span class="reviews__avg-stars">${starsHTML(avg)}</span>
          <span class="reviews__avg-count">${count} đánh giá</span>
        </div>
        <div class="reviews__dist">
          ${[5, 4, 3, 2, 1].map((s) => {
            const n = dist[s - 1];
            const pct = count ? Math.round((n / count) * 100) : 0;
            return `<div class="dist-row"><span>${s}★</span><div class="dist-bar"><span style="width:${pct}%"></span></div><span>${n}</span></div>`;
          }).join("")}
        </div>
      </div>
    </div>
    ${formHTML}
    <ul class="review-list">${listHTML}</ul>`;

  // Wire trả lời đánh giá
  section.querySelectorAll("[data-reply-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = section.querySelector(`[data-reply-form="${CSS.escape(btn.dataset.replyToggle)}"]`);
      if (!f) return;
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector("input").focus();
    });
  });
  section.querySelectorAll("[data-reply-form]").forEach((f) => {
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = f.querySelector("input").value.trim();
      if (!text) return;
      const review = reviews.find((r) => String(r.id) === f.dataset.replyForm);
      if (!review) return;
      const replies = [...(review.replies || []), {
        id: Date.now().toString(36),
        userId: String(currentUser.id),
        text,
        createdAt: new Date().toISOString(),
      }];
      try {
        await updateReview(review.id, { replies });
        showToast("✓ Đã gửi trả lời");
        loadReviews(product);
      } catch (err) {
        showToast("Lỗi gửi trả lời: " + err.message, { icon: "alert" });
      }
    });
  });
  section.querySelectorAll("[data-del-reply]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const [rid, replyId] = btn.dataset.delReply.split("|");
      const review = reviews.find((r) => String(r.id) === rid);
      if (!review || !confirm("Xóa câu trả lời này?")) return;
      try {
        await updateReview(review.id, { replies: (review.replies || []).filter((x) => String(x.id) !== replyId) });
        showToast("Đã xóa trả lời");
        loadReviews(product);
      } catch (err) {
        showToast("Lỗi: " + err.message, { icon: "alert" });
      }
    });
  });

  // Wire form
  if (currentUser && !myReview && !isShop && hasBought) {
    const starInput = section.querySelector("#starInput");
    const ratingValue = section.querySelector("#ratingValue");
    starInput.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-star]");
      if (!btn) return;
      const val = Number(btn.dataset.star);
      ratingValue.value = val;
      starInput.querySelectorAll(".star-input").forEach((s, i) => s.classList.toggle("on", i < val));
    });

    section.querySelector("#reviewForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const rating = Number(ratingValue.value);
      const comment = section.querySelector("#reviewComment").value.trim();
      if (!rating) { showToast("Vui lòng chọn số sao", { icon: "alert" }); return; }
      if (!comment) { showToast("Vui lòng viết vài dòng cảm nhận", { icon: "alert" }); return; }
      try {
        await createReview({
          productId: String(product.id),
          userId: String(currentUser.id),
          rating,
          comment,
          createdAt: new Date().toISOString(),
        });
        showToast("✓ Cảm ơn đánh giá của bạn!");
        loadReviews(product); // render lại
      } catch (err) {
        showToast("Lỗi gửi đánh giá: " + err.message, { icon: "alert" });
      }
    });
  }

  // Wire xóa đánh giá
  section.querySelectorAll("[data-del-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa đánh giá này?")) return;
      try {
        await deleteReview(btn.dataset.delReview);
        showToast("Đã xóa đánh giá");
        loadReviews(product);
      } catch (err) {
        showToast("Lỗi xóa: " + err.message, { icon: "alert" });
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", initDetail);
