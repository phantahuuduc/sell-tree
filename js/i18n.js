// ==========================================================
// i18n.js — Hỗ trợ đa ngôn ngữ cho website.
// Dùng Google Website Translator (miễn phí, dịch được cả nội dung động
// từ db.json như tên sản phẩm, mô tả, thông báo...).
//
// Cách dùng: ui.js gọi `initI18n()` trong `initPage()`.
// - Nạp động script Google Translate (defer, không chặn render).
// - Hiện 1 nút tròn "🌐 VI" ở góc dưới trái; bấm vào mở menu chọn ngôn ngữ.
// - Ghi nhớ lựa chọn vào localStorage, lần sau tự dịch.
// - Nếu Google Translate không tải được (mạng chặn, offline...),
//   nút vẫn hiện nhưng im lặng không làm gì — KHÔNG làm hỏng trang.
// ==========================================================

const LANGS = [
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "zh-CN", label: "中文", flag: "🇨🇳" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

const STORAGE_KEY = "preferred_lang";
let initialized = false;

export function initI18n() {
  if (initialized) return;
  initialized = true;

  try {
    injectStyles();
    injectWidgetMount();
    buildToggleButton();
    loadGoogleScript();
    // Nếu người dùng đã chọn ngôn ngữ khác VI trước đó: chỉ cập nhật nhãn nút.
    // Cookie `googtrans` đã được đặt từ lần trước nên Google Translate tự dịch.
    // KHÔNG gọi applyLang ở đây (tránh set lại cookie + reload vòng lặp).
    const saved = getSavedLang();
    if (saved) updateButtonLabel(saved);
  } catch (_) {
    // Lặng lẽ bỏ qua: không làm hỏng trang nếu có lỗi
  }
}

function getSavedLang() {
  try { return localStorage.getItem(STORAGE_KEY) || "vi"; } catch { return "vi"; }
}
function setSavedLang(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

// Đặt mount point ẩn cho Google Translate widget
function injectWidgetMount() {
  if (document.getElementById("google_translate_element")) return;
  const el = document.createElement("div");
  el.id = "google_translate_element";
  el.style.cssText = "position:fixed;left:-9999px;top:-9999px;visibility:hidden;";
  document.body.appendChild(el);
}

// Khởi tạo TranslateElement (có thể gọi nhiều lần an toàn)
function initTranslateWidget() {
  try {
    if (!window.google?.translate?.TranslateElement) return false;
    // Nếu đã init (có select.goog-te-combo) thì thôi
    if (document.querySelector("select.goog-te-combo")) return true;
    new window.google.translate.TranslateElement(
      {
        pageLanguage: "vi",
        includedLanguages: LANGS.map((l) => l.code).join(","),
        autoDisplay: false,
      },
      "google_translate_element"
    );
    return true;
  } catch (_) { return false; }
}

// Nạp script Google Translate một lần
function loadGoogleScript() {
  if (document.getElementById("gt-script")) {
    // Script đã có — thử init lại (có thể chưa chạy callback)
    initTranslateWidget();
    return;
  }

  // Callback mà script Google sẽ gọi khi nạp xong
  window.googleTranslateElementInit = function () { initTranslateWidget(); };

  const s = document.createElement("script");
  s.id = "gt-script";
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  s.async = true;
  s.onload = () => {
    // Phòng trường hợp callback không được Google gọi (cached hoặc timing)
    // → chủ động thử init thêm vài lần
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (initTranslateWidget() || tries > 10) clearInterval(timer);
    }, 300);
  };
  s.onerror = () => { /* mạng chặn — không sao, nút vẫn hiện nhưng no-op */ };
  document.body.appendChild(s);
}

// Áp ngôn ngữ bằng cách thao tác dropdown ẩn của Google
function applyLang(code) {
  setSavedLang(code);
  updateButtonLabel(code);

  // Nếu chọn VI → reset: xoá cookie googtrans và reload nhẹ nhàng (chỉ khi đang khác VI)
  if (code === "vi") {
    const current = document.cookie.match(/googtrans=([^;]+)/)?.[1];
    if (current && current !== "/vi/vi") {
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      document.cookie = "googtrans=/vi/vi; path=/";
      location.reload();
    }
    return;
  }

  // Các ngôn ngữ khác: set cookie googtrans rồi reload (Google tự dịch khi thấy cookie).
  // Reload là chắc chắn nhất và chỉ chạy đúng 1 lần cho mỗi lần đổi ngôn ngữ.
  const current = document.cookie.match(/googtrans=([^;]+)/)?.[1];
  const target = `/vi/${code}`;
  document.cookie = `googtrans=${target}; path=/`;
  if (current !== target) location.reload();
}

// Nút tròn ở góc dưới trái
function buildToggleButton() {
  if (document.getElementById("i18nToggle")) return;

  const wrap = document.createElement("div");
  wrap.id = "i18nToggle";
  wrap.className = "i18n-toggle";
  wrap.setAttribute("aria-label", "Chọn ngôn ngữ / Choose language");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "i18n-toggle__btn";
  btn.innerHTML = `<span class="i18n-flag" aria-hidden="true">🌐</span><span class="i18n-code">VI</span>`;
  wrap.appendChild(btn);

  const menu = document.createElement("ul");
  menu.className = "i18n-toggle__menu";
  menu.hidden = true;
  LANGS.forEach((l) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "i18n-toggle__item";
    b.dataset.lang = l.code;
    b.innerHTML = `<span aria-hidden="true">${l.flag}</span> <span>${l.label}</span>`;
    b.addEventListener("click", () => {
      applyLang(l.code);
      menu.hidden = true;
    });
    li.appendChild(b);
    menu.appendChild(li);
  });
  wrap.appendChild(menu);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) menu.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu.hidden = true;
  });

  // Ưu tiên đặt trong header (không bao giờ che chat/chatbot); trang không có header thì nổi góc dưới trái
  const actions = document.querySelector(".header-actions");
  if (actions) {
    wrap.classList.add("i18n-toggle--header");
    actions.insertBefore(wrap, actions.firstChild);
  } else {
    document.body.appendChild(wrap);
  }
  updateButtonLabel(getSavedLang());
}

function updateButtonLabel(code) {
  const lang = LANGS.find((l) => l.code === code) || LANGS[0];
  const btn = document.querySelector("#i18nToggle .i18n-toggle__btn");
  if (!btn) return;
  btn.innerHTML = `<span class="i18n-flag" aria-hidden="true">${lang.flag}</span><span class="i18n-code">${code.toUpperCase().split("-")[0]}</span>`;
}

// CSS cho nút chọn ngôn ngữ + ẩn widget Google mặc định
function injectStyles() {
  if (document.getElementById("i18nStyles")) return;
  const s = document.createElement("style");
  s.id = "i18nStyles";
  s.textContent = `
/* Ẩn mọi khung/banner/tooltip xấu xí mặc định của Google Translate */
.goog-te-banner-frame,
.goog-te-banner-frame.skiptranslate,
iframe.goog-te-banner-frame,
#goog-gt-tt,
.goog-te-balloon-frame,
.goog-tooltip,
.goog-tooltip:hover,
.VIpgJd-ZVi9od-ORHb-OEVmcd,
.VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
.VIpgJd-ZVi9od-aZ2wEe { display: none !important; visibility: hidden !important; }
body { top: 0 !important; position: static !important; }
html { margin-top: 0 !important; }
.goog-text-highlight { background: transparent !important; box-shadow: none !important; }

/* Nút chọn ngôn ngữ — tròn, góc dưới trái, ĐẶT TRÊN widget "Nhắn shop" (bottom:20) */
/* Dạng nổi chỉ dùng ở trang không có header (đăng nhập/đăng ký…) — các trang này không có chat/chatbot */
.i18n-toggle {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 9998;
  font-family: inherit;
}
@media (max-width: 480px) {
  .i18n-toggle { right: 12px; bottom: 12px; }
}
/* Biến thể nằm trong header: nhỏ gọn, menu thả xuống */
.i18n-toggle.i18n-toggle--header { position: relative; left: auto; right: auto; bottom: auto; z-index: 60; }
.i18n-toggle.i18n-toggle--header .i18n-toggle__btn { padding: 6px 10px; font-size: 13px; box-shadow: none; border: 1px solid rgba(0,0,0,.14); background: transparent; color: var(--ink, #19241C); white-space: nowrap; }
.i18n-toggle.i18n-toggle--header .i18n-toggle__menu { background: #fff; }
/* Header chật (màn vừa/nhỏ): chỉ giữ cờ để không đẩy menu xuống dòng */
@media (max-width: 1200px) { .i18n-toggle--header .i18n-code { display: none; } }
.i18n-toggle.i18n-toggle--header .i18n-toggle__item { color: #19241C; }
.i18n-toggle.i18n-toggle--header .i18n-toggle__item:hover { background: #F3F0E7; }
.i18n-toggle.i18n-toggle--header .i18n-toggle__btn:hover { transform: none; box-shadow: none; background: rgba(0,0,0,.04); }
.i18n-toggle--header .i18n-toggle__menu { top: calc(100% + 8px); bottom: auto; left: auto; right: 0; }
.i18n-toggle__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  font-weight: 600;
  color: #19241C;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.i18n-toggle__btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2); }
.i18n-toggle__btn .i18n-flag { font-size: 16px; }
.i18n-toggle__menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  margin: 0;
  padding: 6px;
  list-style: none;
  min-width: 180px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  animation: i18nFadeIn 0.15s ease-out;
}
.i18n-toggle__menu li { margin: 0; }
.i18n-toggle__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 14px;
  color: #19241C;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}
.i18n-toggle__item:hover { background: #F3F0E7; }
@keyframes i18nFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 480px) {
  .i18n-toggle__btn { padding: 8px 12px; font-size: 13px; }
}
@media (prefers-color-scheme: dark) {
  .i18n-toggle__btn { background: rgba(30, 36, 32, 0.95); color: #F3F0E7; }
  .i18n-toggle__menu { background: #1E2420; }
  .i18n-toggle__item { color: #F3F0E7; }
  .i18n-toggle__item:hover { background: #2A322C; }
}
`;
  document.head.appendChild(s);
}
