// ==========================================================
// quiz.js — "Gợi ý chọn cây": hộp thoại 3 câu hỏi, từng bước một.
// Trả lời xong → KẾT QUẢ HIỆN NGAY trong hộp thoại (ảnh, giá, Xem chi tiết, Thêm vào giỏ),
// không phải cuộn đi tìm. Mở được từ mọi trang (nav, nút ở hero, dải gợi ý trên trang chủ).
// Muốn xem rộng hơn: "Lọc cả cửa hàng theo kết quả" → lưới sản phẩm trang chủ lọc theo đúng câu trả lời.
// ==========================================================
import { getProducts } from "./api.js";
import { addToCart, requireLogin, stockFullMessage } from "./storage.js";
import { formatPrice, escapeHTML, showToast, updateCartBadge, bumpCartIcon, attachImageFallback } from "./ui.js";
import { ensurePromotions, getPriceInfo } from "./sale.js";
import { flyToCart } from "./fx.js";
import { ensureLabels, productLabels } from "./labels.js";

// ----- Quy đổi câu trả lời → khoảng chỉ số chăm sóc (dùng chung với bộ lọc ở trang chủ) -----
export function quizLightRange(val) {
  switch (val) {
    case "direct":   return { min: 55, max: 100 }; // nắng trực tiếp → cây ưa nắng
    case "indirect": return { min: 30, max: 70 };  // sáng gián tiếp → trung bình
    case "low":      return { min: 0, max: 50 };   // râm → cây chịu bóng
    default:         return null;
  }
}
export function quizWaterRange(val) {
  switch (val) {
    case "forget": return { min: 0, max: 45 };     // hay quên tưới → cây ít nước
    case "weekly": return { min: 30, max: 70 };    // tưới mỗi tuần
    case "eager":  return { min: 45, max: 100 };   // thích tưới → cây ưa ẩm
    default:       return null;
  }
}

export const QUIZ_STEPS = [
  {
    key: "light", title: "Phòng bạn có ánh sáng thế nào?",
    options: [
      { val: "direct", icon: "☀️", label: "Có nắng chiếu trực tiếp", hint: "Bậu cửa hướng Nam/Đông có 4+ tiếng nắng", short: "Nắng trực tiếp" },
      { val: "indirect", icon: "🌤️", label: "Chỉ có sáng gián tiếp", hint: "Gần cửa sổ, sáng dịu không gắt", short: "Sáng gián tiếp" },
      { val: "low", icon: "🌥️", label: "Khá râm / chỉ có đèn", hint: "Phòng trọ bí, ít cửa sổ", short: "Phòng râm" },
    ],
  },
  {
    key: "water", title: "Thói quen tưới nước của bạn?",
    options: [
      { val: "forget", icon: "😅", label: "Rất hay quên (2–3 tuần mới nhớ)", hint: "Hay đi công tác, bận rộn cả tuần", short: "Hay quên tưới" },
      { val: "weekly", icon: "🗓️", label: "Nhớ tưới mỗi cuối tuần", hint: "Có lịch cố định 1 lần/tuần", short: "Tưới mỗi tuần" },
      { val: "eager", icon: "💧", label: "Rảnh là muốn tưới ngay", hint: "Thích chăm sóc mỗi ngày", short: "Thích tưới" },
    ],
  },
  {
    key: "pet", title: "Trong nhà có thú cưng không?",
    options: [
      { val: "yes", icon: "🐱", label: "Có nuôi mèo hoặc chó", hint: "Chỉ gợi ý cây hoàn toàn không độc", short: "An toàn thú cưng" },
      { val: "no", icon: "🏠", label: "Không có thú cưng", hint: "Phù hợp với tất cả loài cây", short: "Không nuôi thú cưng" },
    ],
  },
];

export function quizLabels(answers) {
  return QUIZ_STEPS.map((s) => s.options.find((o) => o.val === answers?.[s.key])?.short).filter(Boolean);
}

// Chấm điểm: cây nằm trong cả 2 khoảng (sáng, nước) = "rất hợp"; ngoài khoảng thì tính độ lệch.
// Có thú cưng → tuyệt đối chỉ lấy cây an toàn (không nới lỏng điều kiện này).
export function recommendPlants(products, answers, limit = 6) {
  const lr = quizLightRange(answers.light);
  const wr = quizWaterRange(answers.water);
  const gap = (v, r) => (!r ? 0 : v < r.min ? r.min - v : v > r.max ? v - r.max : 0);
  const center = (v, r) => (!r ? 0 : Math.abs(v - (r.min + r.max) / 2));
  const pool = (products || []).filter((p) => p.careLevel && (answers.pet !== "yes" || p.petSafe === true));
  const scored = pool.map((p) => {
    const miss = gap(p.careLevel.light, lr) + gap(p.careLevel.water, wr);
    return { product: p, exact: miss === 0, miss, tie: center(p.careLevel.light, lr) + center(p.careLevel.water, wr) };
  });
  const inStockFirst = (a, b) => (Number(b.product.stock) > 0) - (Number(a.product.stock) > 0);
  const exact = scored.filter((s) => s.exact).sort((a, b) => inStockFirst(a, b) || a.tie - b.tie);
  // Chưa đủ 3 cây khớp hẳn → bù thêm cây lệch ít nhất (ghi rõ là "gần phù hợp")
  const near = exact.length >= 3 ? [] : scored.filter((s) => !s.exact && s.miss <= 25)
    .sort((a, b) => a.miss - b.miss || inStockFirst(a, b)).slice(0, 3 - exact.length);
  return [...exact, ...near].slice(0, limit);
}

// ---------- Hộp thoại ----------
let products = null;
let lastFocus = null;

export async function openPlantQuiz() {
  if (document.getElementById("quizModal")) return;
  lastFocus = document.activeElement;
  const answers = { light: null, water: null, pet: null };
  let step = 0; // 0..2 = câu hỏi, 3 = kết quả

  const modal = document.createElement("div");
  modal.className = "quiz-modal";
  modal.id = "quizModal";
  modal.innerHTML = `
    <div class="quiz-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="quizModalTitle">
      <header class="quiz-modal__head">
        <button type="button" class="quiz-modal__back" data-quiz-back aria-label="Quay lại câu trước" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <div class="quiz-modal__progress" aria-hidden="true"><i></i></div>
        <button type="button" class="quiz-modal__close" data-quiz-close aria-label="Đóng">✕</button>
      </header>
      <div class="quiz-modal__body" id="quizModalBody" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add("is-locked");
  requestAnimationFrame(() => modal.classList.add("is-open"));
  setTimeout(() => modal.classList.add("is-open"), 60); // phòng khi rAF không chạy

  const body = modal.querySelector("#quizModalBody");
  const bar = modal.querySelector(".quiz-modal__progress i");
  const backBtn = modal.querySelector("[data-quiz-back]");

  // Tải sẵn sản phẩm trong lúc người dùng trả lời → tới bước kết quả là có ngay
  const loading = (products ? Promise.resolve(products) : Promise.all([getProducts(), ensurePromotions().catch(() => {}), ensureLabels()])
    .then(([list]) => { products = list; return list; })).catch(() => null);

  function close() {
    modal.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => modal.remove(), 260);
    lastFocus?.focus?.();
  }

  function swap(html, dir = 1) {
    body.classList.remove("is-in-next", "is-in-prev");
    void body.offsetWidth; // chạy lại animation chuyển bước
    body.innerHTML = html;
    body.classList.add(dir >= 0 ? "is-in-next" : "is-in-prev");
    body.scrollTop = 0;
  }

  function renderStep(dir = 1) {
    const s = QUIZ_STEPS[step];
    bar.style.transform = `scaleX(${(step + 1) / (QUIZ_STEPS.length + 1)})`;
    backBtn.hidden = step === 0;
    swap(`
      <p class="quiz-modal__eyebrow">Câu ${step + 1} / ${QUIZ_STEPS.length}</p>
      <h2 class="quiz-modal__title" id="quizModalTitle">${s.title}</h2>
      <div class="quiz-modal__opts" role="group" aria-label="${s.title}">
        ${s.options.map((o, i) => `
          <button type="button" class="quiz-choice${answers[s.key] === o.val ? " is-picked" : ""}" data-quiz-pick="${o.val}" style="--i:${i}">
            <span class="quiz-choice__ic" aria-hidden="true">${o.icon}</span>
            <span class="quiz-choice__txt"><strong>${o.label}</strong><small>${o.hint}</small></span>
            <svg class="quiz-choice__go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </button>`).join("")}
      </div>`, dir);
    body.querySelector(".quiz-choice.is-picked, .quiz-choice")?.focus({ preventScroll: true });
  }

  async function renderResult() {
    bar.style.transform = "scaleX(1)";
    backBtn.hidden = false;
    swap(`<div class="quiz-modal__loading"><svg class="leaf-loader" viewBox="0 0 48 48" aria-hidden="true"><path class="leaf-loader__leaf" pathLength="1" d="M22 40A14 14 0 0 1 19.6 12.2C31 10 34 9 38 4c2 4 4 8.4 4 16 0 11-9.6 20-20 20Z"/><path class="leaf-loader__vein" pathLength="1" d="M4 42c0-6 3.7-10.7 10.2-12C19 29 24 26 26 24"/></svg><p>Đang tìm cây hợp với bạn…</p></div>`);
    const list = await loading;
    if (!modal.isConnected || step !== QUIZ_STEPS.length) return;
    if (!list) {
      swap(`<div class="quiz-modal__loading"><p>Không tải được danh sách cây. Kiểm tra kết nối rồi thử lại.</p>
        <button type="button" class="btn btn--primary" data-quiz-retry>Thử lại</button></div>`);
      return;
    }
    const picks = recommendPlants(list, answers);
    const chips = quizLabels(answers).map((t) => `<span class="quiz-chip">${escapeHTML(t)}</span>`).join("");
    const query = `ql=${answers.light}&qw=${answers.water}&qp=${answers.pet}`;
    const cards = picks.map(({ product: p, exact }, i) => {
      const pi = getPriceInfo(p);
      const out = Number(p.stock) <= 0;
      const url = `product-detail.html?id=${encodeURIComponent(p.id)}`;
      return `
        <li class="quiz-result" style="--i:${i}">
          <a class="quiz-result__media" href="${url}" tabindex="-1" aria-hidden="true">
            <img src="${escapeHTML(p.image)}" alt="" width="200" height="250" loading="lazy" data-fallback>
            <span class="quiz-result__tag${exact ? "" : " is-near"}">${exact ? "Rất hợp" : "Gần phù hợp"}</span>
          </a>
          <div class="quiz-result__body">
            <a class="quiz-result__name" href="${url}">${escapeHTML(p.name)}</a>
            <p class="quiz-result__meta">${escapeHTML(productLabels(p).map((l) => l.name).join(" · "))}${out ? " · Hết hàng" : ""}</p>
            <p class="quiz-result__price">${formatPrice(pi.price)}${pi.original ? `<s>${formatPrice(pi.original)}</s>` : ""}</p>
            <div class="quiz-result__actions">
              <button type="button" class="btn btn--primary btn--sm" data-quiz-add="${escapeHTML(String(p.id))}">${out ? "Đặt trước" : "Thêm vào giỏ"}</button>
              <a class="btn btn--ghost btn--sm" href="${url}">Xem chi tiết</a>
            </div>
          </div>
        </li>`;
    }).join("");

    // Số cây khớp HẲN cả 3 điều kiện — nút "Lọc cả cửa hàng" chỉ có nghĩa khi con số này > 0
    // (bộ lọc ở trang chủ lọc chặt, nên nếu chỉ có cây "gần phù hợp" thì lọc sẽ ra rỗng).
    const exactCount = picks.filter((x) => x.exact).length;
    const heading = exactCount === picks.length
      ? `${picks.length} cây hợp với nhà bạn`
      : exactCount > 0
        ? `${exactCount} cây rất hợp, ${picks.length - exactCount} cây gần phù hợp`
        : `${picks.length} cây gần hợp nhất với bạn`;
    const nearNote = exactCount === 0
      ? `<p class="quiz-modal__note">Chưa có cây khớp hẳn cả 3 điều kiện — đây là những cây lệch ít nhất, vẫn sống tốt nếu bạn để ý thêm một chút.</p>`
      : "";

    swap(picks.length ? `
      <p class="quiz-modal__eyebrow">Kết quả cho bạn</p>
      <h2 class="quiz-modal__title" id="quizModalTitle">${heading}</h2>
      <div class="quiz-chips">${chips}</div>
      ${nearNote}
      <ul class="quiz-results">${cards}</ul>
      <div class="quiz-modal__foot">
        <button type="button" class="btn btn--ghost" data-quiz-restart>↺ Làm lại</button>
        ${exactCount > 0
          ? `<a class="btn btn--primary" href="index.html?${query}#catalog" data-quiz-apply>Lọc cả cửa hàng theo kết quả</a>`
          : `<a class="btn btn--primary" href="index.html#catalog" data-quiz-browse>Xem tất cả sản phẩm</a>`}
      </div>` : `
      <p class="quiz-modal__eyebrow">Kết quả cho bạn</p>
      <h2 class="quiz-modal__title" id="quizModalTitle">Chưa có cây khớp hoàn toàn</h2>
      <div class="quiz-chips">${chips}</div>
      <p class="quiz-modal__empty">Điều kiện này hơi khó — thử đổi một câu trả lời, hoặc nhắn shop để được tư vấn riêng.</p>
      <div class="quiz-modal__foot">
        <button type="button" class="btn btn--primary" data-quiz-restart>↺ Làm lại</button>
        <a class="btn btn--ghost" href="index.html#catalog" data-quiz-browse>Xem tất cả sản phẩm</a>
      </div>`);
    attachImageFallback(body);
  }

  const go = (n, dir) => { step = n; if (step >= QUIZ_STEPS.length) renderResult(); else renderStep(dir); };

  modal.addEventListener("click", async (e) => {
    if (e.target === modal || e.target.closest("[data-quiz-close]")) { close(); return; }
    // "Xem tất cả sản phẩm": đang ở trang chủ → đóng rồi cuộn tới danh sách; trang khác → đi theo link
    if (e.target.closest("[data-quiz-browse]")) {
      const catalog = document.getElementById("productGrid") && document.getElementById("catalog");
      close();
      if (catalog) {
        e.preventDefault();
        catalog.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
      return;
    }
    if (e.target.closest("[data-quiz-back]")) { go(Math.max(0, step - 1), -1); return; }
    if (e.target.closest("[data-quiz-restart]")) {
      answers.light = answers.water = answers.pet = null;
      go(0, -1);
      return;
    }
    if (e.target.closest("[data-quiz-retry]")) { products = null; close(); openPlantQuiz(); return; }

    const pick = e.target.closest("[data-quiz-pick]");
    if (pick) {
      answers[QUIZ_STEPS[step].key] = pick.dataset.quizPick;
      body.querySelectorAll(".quiz-choice").forEach((b) => b.classList.toggle("is-picked", b === pick));
      setTimeout(() => go(step + 1, 1), 180); // kịp thấy lựa chọn sáng lên rồi mới sang câu sau
      return;
    }

    const add = e.target.closest("[data-quiz-add]");
    if (add && !add.disabled) {
      if (!(await requireLogin())) return;
      const p = (products || []).find((x) => String(x.id) === add.dataset.quizAdd);
      if (!p) return;
      const res = await addToCart(p, 1, p.stock || Infinity);
      if (res.added === 0) { showToast(stockFullMessage(p), { icon: "alert" }); return; }
      const old = add.textContent;
      add.textContent = "✓ Đã thêm";
      add.disabled = true;
      setTimeout(() => { add.textContent = old; add.disabled = false; }, 1400);
      flyToCart(add.closest(".quiz-result")?.querySelector("img")).then(async () => {
        await updateCartBadge();
        bumpCartIcon();
      });
      showToast(`Đã thêm "${p.name}" vào giỏ hàng`, { image: p.image, link: { href: "cart.html", label: "Xem giỏ" } });
      return;
    }

    // "Lọc cả cửa hàng theo kết quả": đang ở trang chủ thì lọc tại chỗ (không tải lại trang)
    const apply = e.target.closest("[data-quiz-apply]");
    if (apply && document.getElementById("productGrid") && document.getElementById("catalog")) {
      e.preventDefault();
      close();
      window.dispatchEvent(new CustomEvent("quiz:apply", { detail: { ...answers } }));
    }
  });

  function onKey(e) {
    if (document.querySelector(".modal-overlay")) return; // đang mở hộp mời đăng nhập phía trên
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    const f = Array.from(modal.querySelectorAll('button:not([disabled]):not([hidden]), a[href]')).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener("keydown", onKey);

  renderStep(1);
}
