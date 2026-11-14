// ==========================================================
// nav.js — Thanh điều hướng dùng chung cho MỌI trang (một nơi định nghĩa).
//  - Mỗi mục nói rõ bấm vào sẽ tới đâu: Sản phẩm · Khuyến mãi · Gợi ý chọn cây · Liên hệ.
//  - Không mục nào chỉ tải lại trang đang đứng: mục trỏ tới phần trong cùng trang → cuộn mượt;
//    logo / mục của chính trang hiện tại → cuộn lên đầu.
//  - Mục đang xem được tô đậm (theo trang, và theo phần đang cuộn tới ở trang chủ).
//  - "Khuyến mãi" chỉ hiện khi đang có chương trình chạy (không dẫn tới chỗ trống).
//  - Trang chưa có menu ☰ / icon giỏ (Đơn hàng, Hồ sơ…) được bổ sung để điện thoại vẫn đi lại được.
// Giỏ hàng, Yêu thích, Đơn hàng, tài khoản đã có sẵn ở cụm nút bên phải header nên không lặp lại ở đây.
// ==========================================================
import { ensurePromotions } from "./sale.js";

const PAGE = (location.pathname.split("/").pop() || "index.html").toLowerCase();
const ON_HOME = PAGE === "index.html";
const BACKOFFICE = PAGE === "admin.html" || PAGE === "staff.html";

const ICON = {
  products: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  sale: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  quiz: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
  contact: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  shop: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  desk: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
};
const svg = (name) =>
  `<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

// Mục trỏ tới 1 phần của trang chủ: đang ở trang chủ thì là link neo (#…) → cuộn mượt, không tải lại
const home = (hash) => (ON_HOME ? `#${hash}` : `index.html#${hash}`);

function items() {
  if (BACKOFFICE) {
    return [
      { key: "shop", label: "Xem cửa hàng", href: "index.html", icon: "shop" },
      { key: "desk", label: PAGE === "admin.html" ? "Quản trị" : "Nghiệp vụ nhân viên", href: PAGE, icon: "desk", current: true },
    ];
  }
  return [
    { key: "catalog", label: "Sản phẩm", href: home("catalog"), icon: "products", title: "Xem tất cả cây cảnh & phụ kiện" },
    { key: "plantQuiz", label: "Gợi ý chọn cây", href: home("plantQuiz"), icon: "quiz", title: "Trả lời 3 câu hỏi — có ngay danh sách cây hợp với bạn" },
    { key: "footer", label: "Liên hệ", href: "#footer", icon: "contact", title: "Địa chỉ, điện thoại, giờ mở cửa" },
  ];
}
const SALE_ITEM = { key: "saleBanner", label: "Khuyến mãi", href: home("saleBanner"), icon: "sale", title: "Chương trình giảm giá đang diễn ra", sale: true };

const linkHtml = (it) =>
  `<a href="${it.href}" data-nav="${it.key}"${it.title ? ` title="${it.title}"` : ""}${it.sale ? ' class="nav-sale"' : ""}${it.current ? ' aria-current="page"' : ""}>${svg(it.icon)}<span>${it.label}</span>${it.sale ? '<i class="nav-sale__dot" aria-hidden="true"></i>' : ""}</a>`;

// ---------- Bổ sung phần còn thiếu ở một số trang ----------
// Trang có header nhưng chưa có menu ☰ (Đơn hàng, Hồ sơ, Nhân viên, Quản trị) → thêm để dùng được trên điện thoại.
export function ensureMobilePanel() {
  const actions = document.querySelector(".site-header .header-actions");
  if (!actions || !document.querySelector(".site-nav")) return;
  if (!actions.querySelector(".menu-toggle")) {
    actions.insertAdjacentHTML("beforeend", `
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobilePanel" aria-label="Mở menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>`);
  }
  if (!document.getElementById("mobilePanel")) {
    document.querySelector(".site-header").insertAdjacentHTML("afterend", `
      <div class="mobile-panel" id="mobilePanel" aria-hidden="true">
        <div class="mobile-panel__scrim" data-close></div>
        <div class="mobile-panel__sheet">
          <div class="mobile-panel__head">
            <span class="brand">Lá &amp; Sỏi</span>
            <button class="btn btn--ghost" type="button" data-close aria-label="Đóng menu">✕</button>
          </div>
          <nav></nav>
          <div class="account" data-account></div>
        </div>
      </div>`);
  }
}

// Trang mua sắm chưa có icon giỏ trên header (Đơn hàng, Hồ sơ) → thêm, để không phải đặt "Giỏ hàng" vào thanh nav.
export function ensureCartLink() {
  if (BACKOFFICE) return;
  const actions = document.querySelector(".site-header .header-actions");
  if (!actions || !document.querySelector(".site-nav") || actions.querySelector(".cart-link")) return;
  const a = document.createElement("a");
  a.className = "cart-link";
  a.href = "cart.html";
  a.setAttribute("aria-label", "Giỏ hàng");
  a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${ICON.cart}</svg><span class="cart-badge" data-cart-count hidden>0</span>`;
  const toggle = actions.querySelector(".menu-toggle");
  if (toggle) toggle.before(a); else actions.appendChild(a);
}

// ---------- Vẽ nav (desktop + menu ☰) ----------
function render() {
  const list = items();
  const desktop = document.querySelector(".site-nav");
  if (desktop) desktop.innerHTML = list.map(linkHtml).join("");
  const mobile = document.querySelector(".mobile-panel nav");
  if (mobile) {
    mobile.innerHTML = list.map(linkHtml).join("")
      + (BACKOFFICE ? "" : `<a href="cart.html" data-nav="cart"${PAGE === "cart.html" ? ' aria-current="page"' : ""}>${svg("cart")}<span>Giỏ hàng</span></a>`);
  }
}

async function addSaleItem() {
  if (BACKOFFICE) return;
  let active = [];
  try { active = await ensurePromotions(); } catch { return; }
  if (!Array.isArray(active) || !active.length) return;
  document.querySelectorAll('.site-nav, .mobile-panel nav').forEach((nav) => {
    if (nav.querySelector('[data-nav="saleBanner"]')) return;
    nav.querySelector('[data-nav="catalog"]')?.insertAdjacentHTML("afterend", linkHtml(SALE_ITEM));
  });
  spy?.();
}

// ---------- Tô đậm mục đang xem ----------
function setActive(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === "desk" || a.dataset.nav === "cart") return; // đã đặt cố định theo trang
    if (a.dataset.nav === key) a.setAttribute("aria-current", ON_HOME ? "location" : "page");
    else a.removeAttribute("aria-current");
  });
}

let spy = null;
function initActiveState() {
  if (BACKOFFICE) return;
  if (PAGE === "product-detail.html") { setActive("catalog"); return; }
  if (!ON_HOME) return;
  // Trang chủ: theo dõi phần đang cuộn tới (gom vào 1 khung hình, chỉ đọc toạ độ)
  const keys = ["saleBanner", "catalog", "footer"]; // "Gợi ý chọn cây" mở hộp thoại nên không tô theo vị trí cuộn
  let ticking = false;
  spy = () => {
    ticking = false;
    const line = (document.querySelector(".site-header")?.offsetHeight || 64) + 140;
    let current = "catalog"; // đầu trang chủ = đang ở cửa hàng
    for (const k of keys) {
      const el = document.getElementById(k);
      if (!el || el.hidden) continue;
      if (el.getBoundingClientRect().top <= line) current = k;
    }
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom && document.getElementById("footer")) current = "footer";
    if (current === "saleBanner" && !document.querySelector('[data-nav="saleBanner"]')) current = "catalog";
    setActive(current);
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(spy); }
  }, { passive: true });
  spy();
}

// ---------- Hành vi bấm: cuộn mượt, không tải lại trang đang đứng ----------
function scrollToTarget(id) {
  let el = document.getElementById(id);
  if (!el || el.hidden) el = document.getElementById("catalog") || el; // phần đang ẩn (hết khuyến mãi) → về danh sách sản phẩm
  if (!el || el.hidden) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}
const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

function initClicks() {
  document.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // "Gợi ý chọn cây" (nav, nút ở hero, dải mời trên trang chủ): mở hộp thoại ngay tại trang đang xem —
    // hỏi xong thấy kết quả luôn, không chuyển trang, không phải cuộn đi tìm.
    const quizTrigger = e.target.closest('[data-open-quiz], a[data-nav="plantQuiz"], a[href$="#plantQuiz"]');
    if (quizTrigger) {
      e.preventDefault();
      const fallback = quizTrigger.getAttribute("href");
      import("./quiz.js")
        .then((m) => m.openPlantQuiz())
        .catch(() => { if (fallback && !fallback.startsWith("#")) location.href = fallback; }); // lỗi tải → đi theo link cũ
      return;
    }

    const a = e.target.closest("a[data-nav], .site-header a.brand");
    if (!a) return;
    const href = a.getAttribute("href") || "";

    // Link neo trong cùng trang → cuộn mượt
    if (href.startsWith("#")) {
      e.preventDefault();
      // Menu ☰ đang mở sẽ tự đóng và trả focus → cuộn sau một nhịp để không bị giật ngược
      const inPanel = !!a.closest(".mobile-panel");
      setTimeout(() => {
        if (scrollToTarget(href.slice(1))) history.replaceState(null, "", href);
      }, inPanel ? 80 : 0);
      return;
    }
    // Link trỏ tới chính trang đang đứng (logo ở trang chủ, mục của trang hiện tại) → lên đầu trang, không tải lại
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin === location.origin && url.pathname === location.pathname && !url.hash && url.search === location.search) {
      e.preventDefault();
      toTop();
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    }
  });
}

// Từ trang khác tới "index.html#catalog": nội dung trang chủ nạp dần nên vị trí bị xê dịch →
// cuộn lại vài lần cho đúng chỗ, dừng ngay khi người dùng tự cuộn.
function settleHashScroll() {
  if (!ON_HOME || location.hash.length < 2) return;
  const id = decodeURIComponent(location.hash.slice(1));
  let userMoved = false;
  const stop = () => { userMoved = true; };
  ["wheel", "touchstart", "keydown", "mousedown"].forEach((ev) => window.addEventListener(ev, stop, { once: true, passive: true }));
  [350, 1000, 2000].forEach((ms) => setTimeout(() => {
    if (userMoved) return;
    const el = document.getElementById(id);
    // "instant": tới nơi ngay, không chạy lại hiệu ứng cuộn mượt mỗi lần chỉnh vị trí
    (el && !el.hidden ? el : document.getElementById("catalog"))?.scrollIntoView({ behavior: "instant", block: "start" });
    spy?.(); // tô đậm đúng mục vừa cuộn tới
  }, ms));
}

let inited = false;
export function initNav() {
  if (inited || !document.querySelector(".site-nav")) return;
  inited = true;
  render();
  initClicks();
  initActiveState();
  settleHashScroll();
  addSaleItem(); // không chặn render
}
