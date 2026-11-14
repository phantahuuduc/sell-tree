// ==========================================================
// slide-marker.js — Dấu "đang chọn" trượt từ mục cũ sang mục mới.
//
// Dùng cho: dải thẻ phân trang của trang Quản trị / Nhân viên, và thanh chọn kỳ (Tháng / Quý / Năm…).
// Cách làm: chèn MỘT phần tử chỉ báo nằm sau các mục; mỗi khi mục đang chọn đổi thì đo lại vị trí,
// kích thước của mục đó rồi ghi vào biến CSS (--mx, --my, --mw, --mh). Phần chuyển động do CSS lo
// (transition trên transform) nên tự tắt khi người dùng bật "giảm chuyển động".
//
// Tự cập nhật khi: đổi mục (theo dõi thuộc tính aria-selected / class), đổi kích thước cửa sổ,
// chữ dài ngắn đi (đổi ngôn ngữ, huy hiệu số hiện / ẩn) — nhờ ResizeObserver trên từng mục.
// Không dùng thư viện ngoài.
// ==========================================================

// Vị trí gần nhất theo "key" — khi cả cụm bị dựng lại (innerHTML) dấu vẫn trượt tiếp từ chỗ cũ
const lastRect = new Map();

/**
 * @param {HTMLElement} container  phần tử bao các mục (cần position khác static)
 * @param {object} opt
 *   item      — selector của các mục
 *   isActive  — (el) => boolean: mục nào đang được chọn
 *   key       — tên để nhớ vị trí qua các lần dựng lại (tùy chọn)
 *   hover     — true: thêm một vệt nhạt đi theo chuột
 */
export function attachMarker(container, { item, isActive, key = "", hover = false } = {}) {
  if (!container || !item || typeof isActive !== "function") return null;
  container.querySelectorAll(":scope > .slide-marker").forEach((el) => el.remove());

  const make = (cls) => {
    const el = document.createElement("span");
    el.className = cls;
    el.setAttribute("aria-hidden", "true");
    return el;
  };
  const marker = make("slide-marker");
  const trail = hover ? make("slide-marker slide-marker--hover") : null;
  container.prepend(marker);
  if (trail) container.prepend(trail);
  container.classList.add("has-slide-marker");

  const items = () => Array.from(container.querySelectorAll(item));

  // Tọa độ của mục so với vùng nội dung của container (không đổi khi container cuộn)
  const rectOf = (el) => {
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    return {
      x: r.left - c.left - container.clientLeft + container.scrollLeft,
      y: r.top - c.top - container.clientTop + container.scrollTop,
      w: r.width, h: r.height,
    };
  };
  const place = (el, rect, animate) => {
    if (!animate) el.classList.add("is-instant");
    el.style.setProperty("--mx", `${rect.x}px`);
    el.style.setProperty("--my", `${rect.y}px`);
    el.style.setProperty("--mw", `${rect.w}px`);
    el.style.setProperty("--mh", `${rect.h}px`);
    if (!animate) { void el.offsetWidth; el.classList.remove("is-instant"); } // chốt vị trí rồi mới bật lại chuyển động
  };

  let current = null;   // mục đang được đánh dấu
  let ready = false;    // đã đặt lần đầu chưa (lần đầu không trượt)

  function update({ animate = true } = {}) {
    const active = items().find(isActive) || null;
    if (!active || !active.getClientRects().length) { marker.classList.remove("is-on"); current = active; return; }
    const rect = rectOf(active);
    const changed = active !== current;

    if (!ready) {
      // Lần đầu: nếu cụm vừa bị dựng lại thì đặt ở chỗ cũ rồi trượt tới; còn không thì đặt sẵn đúng chỗ
      const prev = key ? lastRect.get(key) : null;
      if (prev) { place(marker, prev, false); marker.classList.add("is-on"); void marker.offsetWidth; place(marker, rect, true); }
      else { place(marker, rect, false); marker.classList.add("is-on"); }
      ready = true;
    } else {
      // Đổi mục → trượt; chỉ đổi kích thước (resize, đổi ngôn ngữ) → nhảy thẳng cho khỏi lệch
      place(marker, rect, animate && changed);
      marker.classList.add("is-on");
    }
    if (key) lastRect.set(key, rect);

    // Dải có thanh cuộn ngang: đưa mục vừa chọn vào giữa tầm nhìn
    if (changed && current && container.scrollWidth > container.clientWidth + 1) {
      const left = rect.x - (container.clientWidth - rect.w) / 2;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      container.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
    }
    current = active;
  }

  // Đổi mục đang chọn (aria-selected / class do code khác đặt) → trượt
  const mo = new MutationObserver((list) => {
    if (list.some((m) => m.target !== marker && m.target !== trail)) update();
  });
  mo.observe(container, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "class", "hidden"] });

  // Kích thước đổi (cửa sổ, ngôn ngữ, huy hiệu) → đặt lại, không trượt
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => update({ animate: false }));
    ro.observe(container);
    items().forEach((el) => ro.observe(el));
  }
  document.fonts?.ready?.then(() => update({ animate: false })).catch(() => {});

  // Vệt nhạt đi theo chuột
  if (trail) {
    let shown = false;
    container.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      const el = e.target.closest?.(item);
      if (!el || !container.contains(el)) return;
      place(trail, rectOf(el), shown);
      trail.classList.add("is-on");
      shown = true;
    });
    container.addEventListener("pointerleave", () => { trail.classList.remove("is-on"); shown = false; });
  }

  update();
  return { update, destroy() { mo.disconnect(); ro?.disconnect(); marker.remove(); trail?.remove(); } };
}
