// ==========================================================
// fx.js — Hiệu ứng vi mô dùng chung (không thư viện ngoài).
//   flyToCart      : ảnh sản phẩm bay theo đường cong vào icon giỏ
//   heartBurst     : tim nảy + các tim nhỏ bay ra khi bấm yêu thích
//   celebrateOrder : dấu tick vẽ dần + confetti khi đặt hàng thành công
//   initMicroFx    : ripple cho nút + chuyển trang mờ dần
// Chỉ animate transform/opacity. Tôn trọng prefers-reduced-motion:
// khi người dùng tắt chuyển động, hiệu ứng được bỏ qua nhưng kết quả
// (badge giỏ, trạng thái tim, thông báo) vẫn cập nhật bình thường.
// ==========================================================

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// ---------- 1. Bay vào giỏ hàng ----------
// sourceEl: ảnh (hoặc phần tử chứa ảnh) của sản phẩm vừa thêm.
// Trả về Promise hoàn tất lúc ảnh "hạ cánh" → nơi gọi cập nhật badge + rung icon giỏ.
export function flyToCart(sourceEl) {
  return new Promise((resolve) => {
    const target = Array.from(document.querySelectorAll(".cart-link")).find(visible);
    const img = sourceEl?.tagName === "IMG" ? sourceEl : sourceEl?.querySelector?.("img");
    if (reduced() || !target || !img || !visible(img)) { resolve(false); return; }

    // Đọc toạ độ một lần (tránh layout thrashing), sau đó chỉ ghi transform
    const from = img.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const size = Math.min(from.width, from.height, 140);
    const startX = from.left + from.width / 2 - size / 2;
    const startY = from.top + from.height / 2 - size / 2;
    const dx = to.left + to.width / 2 - (startX + size / 2);
    const dy = to.top + to.height / 2 - (startY + size / 2);

    // 2 lớp lồng nhau: lớp ngoài đi ngang đều, lớp trong đi dọc theo đường cong
    // → quỹ đạo thành hình cung mà vẫn chỉ dùng transform.
    const flyer = document.createElement("div");
    flyer.className = "fly-item";
    flyer.style.cssText = `left:${startX}px;top:${startY}px;width:${size}px;height:${size}px`;
    const inner = document.createElement("div");
    inner.className = "fly-item__inner";
    const clone = document.createElement("img");
    clone.src = img.currentSrc || img.src;
    clone.alt = "";
    inner.appendChild(clone);
    flyer.appendChild(inner);
    document.body.appendChild(flyer);

    const duration = Math.min(900, Math.max(520, Math.hypot(dx, dy) * 0.9));
    const lift = Math.min(140, Math.max(60, Math.abs(dx) * 0.25)); // độ vồng của cung
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      flyer.remove();
      resolve(true);
    };

    requestAnimationFrame(() => {
      const a = flyer.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }],
        { duration, easing: "linear", fill: "forwards" },
      );
      inner.animate(
        [
          { transform: "translateY(0) scale(1)", opacity: 1, offset: 0 },
          { transform: `translateY(${Math.min(dy * 0.35, 0) - lift}px) scale(.62)`, opacity: 1, offset: 0.45 },
          { transform: `translateY(${dy}px) scale(.14)`, opacity: 0.35, offset: 1 },
        ],
        { duration, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" },
      );
      a.onfinish = finish;
    });
    // Phòng khi tab bị ẩn (rAF / onfinish không chạy) → vẫn phải kết thúc để badge giỏ được cập nhật
    setTimeout(finish, duration + 250);
  });
}

// ---------- 2. Yêu thích: tim nảy + hạt tim ----------
export function heartBurst(btn, active = true) {
  if (!btn) return;
  btn.classList.remove("is-popping");
  void btn.offsetWidth; // chạy lại animation từ đầu
  btn.classList.add("is-popping");
  setTimeout(() => btn.classList.remove("is-popping"), 520);
  if (!active || reduced() || !visible(btn)) return;

  const r = btn.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "heart-burst";
  layer.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px`;
  const N = 7;
  for (let i = 0; i < N; i++) {
    const angle = (-90 + (i - (N - 1) / 2) * 34 + (Math.random() * 16 - 8)) * (Math.PI / 180);
    const dist = 34 + Math.random() * 30;
    const s = document.createElement("span");
    s.textContent = "♥";
    s.style.setProperty("--hx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--hy", `${Math.sin(angle) * dist}px`);
    s.style.setProperty("--hs", (0.6 + Math.random() * 0.7).toFixed(2));
    s.style.setProperty("--hd", `${Math.round(Math.random() * 90)}ms`);
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1000);
}

// ---------- 3. Đặt hàng thành công: tick vẽ dần + confetti ----------
const CONFETTI_COLORS = ["#2F6B3C", "#8DBF8B", "#E8C56A", "#E07A5F", "#F2E8CF", "#5B9BD5"];

export function celebrateOrder({ title = "Đặt hàng thành công!", message = "", duration = 2600 } = {}) {
  document.querySelector(".order-success")?.remove();
  const box = document.createElement("div");
  box.className = "order-success";
  box.setAttribute("role", "status");
  box.innerHTML = `
    <div class="order-success__confetti" aria-hidden="true"></div>
    <div class="order-success__card">
      <svg class="order-success__check" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" pathLength="1"></circle>
        <path d="M25 41.5l10.5 10.5L56 30" pathLength="1"></path>
      </svg>
      <strong class="order-success__title"></strong>
      <p class="order-success__msg"></p>
    </div>`;
  box.querySelector(".order-success__title").textContent = title;
  const msg = box.querySelector(".order-success__msg");
  msg.textContent = message;
  msg.hidden = !message;

  if (!reduced()) {
    const layer = box.querySelector(".order-success__confetti");
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("i");
      p.style.setProperty("--cx", `${(Math.random() * 100).toFixed(1)}vw`);
      p.style.setProperty("--drift", `${Math.round(Math.random() * 160 - 80)}px`);
      p.style.setProperty("--rot", `${Math.round(Math.random() * 900 - 450)}deg`);
      p.style.setProperty("--dur", `${(1.5 + Math.random() * 1.3).toFixed(2)}s`);
      p.style.setProperty("--delay", `${(Math.random() * 0.5).toFixed(2)}s`);
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      if (i % 3 === 0) p.style.borderRadius = "50%";
      frag.appendChild(p);
    }
    layer.appendChild(frag);
  }

  document.body.appendChild(box);
  const close = () => {
    if (!box.isConnected) return;
    box.classList.add("is-leaving");
    setTimeout(() => box.remove(), 320);
  };
  box.addEventListener("click", close);
  setTimeout(close, duration);
}

// ---------- 4. Ripple + chuyển trang ----------
function initRipple() {
  document.addEventListener("pointerdown", (e) => {
    if (reduced()) return;
    const btn = e.target.closest?.(".btn, .hero-cta, .filter-chip, .sched-banner__cta");
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2;
    const ink = document.createElement("span");
    ink.className = "ripple-ink";
    ink.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    // Chỉ đặt position khi nút đang "static" — không đụng nút vốn đã absolute/fixed
    if (getComputedStyle(btn).position === "static") btn.classList.add("has-ripple-pos");
    btn.classList.add("has-ripple");
    btn.appendChild(ink);
    ink.addEventListener("animationend", () => ink.remove(), { once: true });
    setTimeout(() => ink.remove(), 800);
  }, { passive: true });
}

// Mờ dần khi rời trang (trang mới tự hiện dần bằng CSS). Chỉ áp dụng cho
// link nội bộ mở cùng tab; bỏ qua link neo (#...), tải file, phím bổ trợ.
function initPageTransition() {
  // Quay lại bằng nút Back (bfcache) → gỡ trạng thái "đang rời" kẻo trang bị mờ mãi
  window.addEventListener("pageshow", () => document.body.classList.remove("is-leaving"));

  // Trình duyệt đã tự hòa ảnh giữa 2 trang (@view-transition trong base.css) → không cần mờ dần bằng JS nữa
  if ("CSSViewTransitionRule" in window) return;

  document.addEventListener("click", (e) => {
    if (reduced() || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const raw = a.getAttribute("href");
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // cùng trang (chỉ khác #)
    e.preventDefault();
    document.body.classList.add("is-leaving");
    setTimeout(() => { location.href = a.href; }, 170);
  });
}

let inited = false;
export function initMicroFx() {
  if (inited) return;
  inited = true;
  initRipple();
  initPageTransition();
  // Chốt an toàn: khi cửa sổ bị che/thu nhỏ, trình duyệt ngừng vẽ nên animation "hiện dần" đứng ở
  // khung đầu (trong suốt). Hẹn giờ vẫn chạy → sau 0,7s tắt hẳn animation để trang luôn hiện rõ.
  setTimeout(() => document.body.classList.add("page-in-done"), 700);
}
