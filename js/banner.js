// ==========================================================
// banner.js — Banner theo lịch ở trang chủ.
// Tự chọn banner phù hợp với NGÀY HÔM NAY:
//  - Banner có lịch (startDate/endDate) và hôm nay nằm trong khoảng → ưu tiên
//    (vd banner Giáng sinh 20→26/12 tự bật đúng dịp, hết dịp tự tắt).
//  - Nhiều banner cùng đúng dịp → carousel tự chuyển (6 giây), có chấm, mũi tên, vuốt.
//  - Không có banner dịp nào → không hiện (trang chủ gọn, hero bên dưới làm chủ đạo).
// ==========================================================
import { getBanners, getPromotions } from "./api.js";
import { getActivePromotions } from "./sale.js";
import { attachImageFallback } from "./ui.js";

export async function initScheduledBanner() {
  const el = document.getElementById("scheduledBanner");
  if (!el) return;

  let banners = [];
  let promos = [];
  try {
    [banners, promos] = await Promise.all([getBanners(), getPromotions().catch(() => [])]);
  } catch { return; }
  if (!Array.isArray(banners) || !banners.length) return;

  const activePromos = getActivePromotions(promos);
  const promoOf = (b) => activePromos.find((p) => String(p.id) === String(b.promotionId));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inRange = (b) => {
    const start = b.startDate ? new Date(b.startDate + "T00:00:00") : null;
    const end = b.endDate ? new Date(b.endDate + "T23:59:59") : null;
    return (!start || today >= start) && (!end || today <= end);
  };

  // Quy tắc (đồng bộ với bannerVisibility trong admin):
  //  - Banner có ngày riêng → hiện đúng những ngày admin đặt (admin quyết định).
  //  - Banner không có ngày nhưng gắn khuyến mãi → hiện theo lịch khuyến mãi.
  //  - Không ngày, không gắn → không hiện dải lớn (tránh choán trang chủ).
  const pool = banners.filter((b) => {
    if (b.isActive === false) return false;
    if (b.startDate || b.endDate) return inRange(b);
    if (b.promotionId) return !!promoOf(b);
    return false;
  });
  if (!pool.length) return; // ngày thường → không hiện banner, trang chủ gọn gàng

  // Dịp đang diễn ra: lấy banner sắp kết thúc sớm nhất, rồi theo thứ tự hiển thị.
  const endOf = (b) => (b.startDate || b.endDate) ? b.endDate : promoOf(b)?.endDate;
  pool.sort((a, b) => {
    const ae = endOf(a) ? new Date(endOf(a)).getTime() : Infinity;
    const be = endOf(b) ? new Date(endOf(b)).getTime() : Infinity;
    if (ae !== be) return ae - be;
    return (a.order || 0) - (b.order || 0);
  });
  // ----- Dựng slide: 1 banner → ảnh tĩnh; nhiều banner cùng dịp → carousel tự chuyển -----
  const occasion = (b) => {
    const t = b.title || "";
    return /giáng sinh|noel|christmas|giang sinh/i.test(t) ? "xmas" : /tết|xuân|lunar/i.test(t) ? "tet" : "sale";
  };
  const safeHref = (href) => (/^(https?:\/\/|[\w./#?=&%-]+$)/i.test(href || "") ? href : "index.html");
  const track = document.getElementById("schedBannerTrack");
  track.innerHTML = pool.map((b, i) => {
    const linked = promoOf(b);
    const occ = occasion(b);
    const label = (occ === "xmas" ? "Giáng Sinh" : occ === "tet" ? "Tết đến" : "Ưu đãi đặc biệt") + (linked ? ` · −${linked.discountPercent}%` : "");
    return `
      <a class="sched-slide${i === 0 ? " is-active" : ""}" href="${escapeHtml(safeHref(b.link))}" data-slide="${i}"
         aria-roledescription="slide" aria-label="${i + 1} / ${pool.length}: ${escapeHtml(b.title || "")}" ${i === 0 ? "" : 'tabindex="-1" aria-hidden="true"'}>
        <img class="sched-banner__img" src="${escapeHtml(b.image || "")}" alt="" data-fallback ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
        <div class="sched-banner__overlay">
          <span class="sched-banner__eyebrow"><span class="sched-banner__spark">✦</span> ${escapeHtml(label)}</span>
          <strong class="sched-banner__title">${escapeHtml(b.title || "")}</strong>
          ${b.description ? `<span class="sched-banner__desc">${escapeHtml(b.description)}</span>` : ""}
          <span class="sched-banner__cta">Khám phá ngay <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
        </div>
      </a>`;
  }).join("");
  el.hidden = false; // KHÔNG có nút đóng — banner luôn hiển thị khi đúng dịp
  attachImageFallback(track);

  const slides = Array.from(track.children);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (slides.length > 1) {
    const dots = document.getElementById("schedBannerDots");
    const prev = document.getElementById("schedBannerPrev");
    const next = document.getElementById("schedBannerNext");
    dots.innerHTML = slides.map((_, i) =>
      `<button type="button" class="sched-banner__dot${i === 0 ? " is-active" : ""}" data-go="${i}" aria-label="Xem banner ${i + 1}"></button>`).join("");
    dots.hidden = prev.hidden = next.hidden = false;
    el.classList.add("has-nav"); // chừa chỗ cho 2 mũi tên, chữ không bị đè

    let current = 0;
    let timer = null;
    const INTERVAL = 6000;
    const go = (n) => {
      current = (n + slides.length) % slides.length;
      slides.forEach((s, i) => {
        const on = i === current;
        s.classList.toggle("is-active", on);
        s.toggleAttribute("aria-hidden", !on);
        if (on) s.removeAttribute("tabindex"); else s.setAttribute("tabindex", "-1");
      });
      // FLIP: đổi kích thước chấm tức thì rồi trượt / co giãn từ vị trí cũ về vị trí mới bằng transform
      // (không animate width → không reflow từng khung hình). Tắt chuyển động → chỉ đổi lớp.
      const btns = [...dots.querySelectorAll("button")];
      const before = reduced ? null : btns.map((d) => d.getBoundingClientRect());
      btns.forEach((d, i) => d.classList.toggle("is-active", i === current));
      if (!before || typeof Element.prototype.animate !== "function") return;
      // Bấm liên tục: bỏ hiệu ứng FLIP cũ trước khi đo vị trí mới (vị trí cũ đã đo ở trên, tính cả chỗ đang trượt dở)
      btns.forEach((d) => d.getAnimations().forEach((a) => { if (a.id === "dot-flip") a.cancel(); }));
      const dur = parseFloat(getComputedStyle(dots).getPropertyValue("--dur-mid")) || 260;
      btns.forEach((d, i) => {
        const a = before[i], b = d.getBoundingClientRect();
        if (!b.width || (a.left === b.left && a.width === b.width)) return;
        d.animate(
          [{ transform: `translateX(${a.left - b.left}px) scaleX(${a.width / b.width})` }, { transform: "none" }],
          { duration: dur, easing: "cubic-bezier(.22,1,.36,1)", id: "dot-flip" }
        );
      });
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      stop();
      if (reduced || document.hidden) return; // người dùng tắt chuyển động → không tự chuyển
      timer = setInterval(() => go(current + 1), INTERVAL);
    };
    prev.addEventListener("click", () => { go(current - 1); start(); });
    next.addEventListener("click", () => { go(current + 1); start(); });
    dots.addEventListener("click", (e) => {
      const d = e.target.closest("[data-go]");
      if (d) { go(Number(d.dataset.go)); start(); }
    });
    // Tạm dừng khi rê chuột / đang focus / tab ẩn — để người dùng kịp đọc
    el.addEventListener("mouseenter", stop);
    el.addEventListener("mouseleave", start);
    el.addEventListener("focusin", stop);
    el.addEventListener("focusout", start);
    document.addEventListener("visibilitychange", start);
    // Vuốt trái/phải trên điện thoại
    let touchX = null;
    el.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 45) { go(current + (dx < 0 ? 1 : -1)); start(); }
    }, { passive: true });
    start();
  }

  // Parallax nhẹ: ảnh trôi chậm hơn trang khi cuộn (chỉ transform, gom vào 1 khung hình)
  if (!reduced) {
    let ticking = false;
    const apply = () => {
      ticking = false;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      el.style.setProperty("--parallax", `${Math.round(Math.max(0, -r.top) * 0.25)}px`);
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  // Hiệu ứng Three.js: tuyết trắng cho Giáng Sinh, lấp lánh vàng/hồng cho dịp khác
  const occ0 = occasion(pool[0]);
  const fx = document.getElementById("schedBannerFx");
  if (fx && !fx.dataset.inited) {
    fx.dataset.inited = "1";
    import("./three-ambient.js")
      .then((m) => m.initBannerParticles(fx, occ0 === "xmas"
        ? { color: 0xffffff, snow: true, count: 120 }
        : occ0 === "tet"
          ? { color: 0xffc46b, snow: false, count: 90 }
          : { color: 0xffe08a, snow: false, count: 80 }))
      .catch(() => {});
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
