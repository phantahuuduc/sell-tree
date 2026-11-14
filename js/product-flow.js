// ==========================================================
// product-flow.js — Chuyển cảnh liền mạch từ một thẻ sản phẩm sang trang chi tiết (và quay lại).
//
// Dùng chung cho MỌI chỗ dẫn vào product-detail.html (lưới sản phẩm, hàng mới về, bán chạy, sản phẩm liên quan,
// thường mua cùng, yêu thích, quiz gợi ý, gợi ý ở giỏ hàng…) nhờ bắt sự kiện bấm ở cấp document.
//
//   1. Lúc bấm: thẻ được bấm nhấn nhẹ xuống, các thẻ còn lại mờ đi; ghi lại ảnh + vị trí của thẻ vào sessionStorage.
//   2. Ảnh của thẻ được đặt tên view-transition "pd-image" → trình duyệt hỗ trợ View Transitions liên trang
//      (đã bật sẵn trong base.css) tự cho ảnh "bay" và phóng to tới khung ảnh lớn của trang chi tiết.
//      Trình duyệt chưa hỗ trợ: trang chi tiết tự làm hiệu ứng bay bằng Web Animations (đoạn script đầu product-detail.html).
//   3. Trang chi tiết hiện khung xương đúng hình dạng kèm sẵn ảnh vừa bấm, không còn trang trắng trong lúc chờ dữ liệu.
//   4. Bấm "quay lại": ảnh lớn bay ngược về thẻ; trang danh sách về đúng vị trí cuộn và đúng trang phân trang cũ.
// Không chặn hay làm chậm việc chuyển trang; tắt hết khi máy bật "giảm chuyển động".
// ==========================================================
const FROM = "pd_from";   // { id, src, rect: [left, top, width, height], at }
const BACK = "pd_back";   // { path, y, page }
const NAME = "pd-image";
const CARD = ".card, .wish-card, .quiz-result, .arrival-card, .seller-card, .together__item, .cart-suggest__item";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const read = (key) => { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } };
const save = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* không lưu được thì chỉ mất hiệu ứng */ } };
const here = () => location.pathname + location.search;
const isBackNav = () => performance.getEntriesByType?.("navigation")[0]?.type === "back_forward";

function detailUrl(a) {
  try {
    const u = new URL(a.href, location.href);
    return u.origin === location.origin && /product-detail\.html$/.test(u.pathname) && u.searchParams.get("id") ? u : null;
  } catch { return null; }
}

const inView = (r) => r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;

function setName(el) { el.style.viewTransitionName = NAME; el.dataset.pdVt = "1"; }
function clearNames() {
  document.querySelectorAll("[data-pd-vt]").forEach((el) => { el.style.viewTransitionName = ""; delete el.dataset.pdVt; });
}
function clearMarks() {
  document.querySelectorAll(".pd-picked").forEach((el) => el.classList.remove("pd-picked"));
  document.querySelectorAll(".pd-dim").forEach((el) => el.classList.remove("pd-dim"));
}

let goingToProduct = false;

function onClick(e) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  const url = detailUrl(a);
  if (!url || (url.pathname === location.pathname && url.search === location.search)) return;

  const card = a.closest(CARD);
  const img = a.querySelector("img") || card?.querySelector("img");
  const hint = { id: url.searchParams.get("id"), at: Date.now() };
  let rect = null;
  const src = img && (img.currentSrc || img.src);
  if (src && !src.startsWith("data:")) {
    hint.src = src; // ảnh nhỏ của thẻ (thường đã nằm trong bộ nhớ đệm) → trang chi tiết hiện ngay trong khung xương
    const box = img.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) { rect = box; hint.rect = [box.left, box.top, box.width, box.height]; }
  }
  save(FROM, hint);
  save(BACK, { path: here(), y: Math.round(window.scrollY), page: Number(document.querySelector(".pagination__btn.is-active")?.dataset.page) || 1 });

  if (reduced()) return;
  goingToProduct = true;
  clearNames();
  // Mỗi trang chỉ được có MỘT phần tử mang tên chuyển cảnh: chỉ đặt cho ảnh của thẻ vừa bấm
  if (img && rect && inView(rect)) setName(img);
  if (card) {
    card.classList.add("pd-picked");
    card.closest("ul, ol, .product-grid")?.classList.add("pd-dim");
  }
  // Chốt an toàn: nếu vì lý do nào đó không rời trang thì trả các thẻ về bình thường
  setTimeout(() => { clearMarks(); goingToProduct = false; }, 1500);
}

// Trang nạp lại từ đầu sau khi bấm "quay lại" (không còn trong bfcache): nội dung vẽ bằng JS sau khi tải dữ liệu
// nên trình duyệt không tự cuộn về chỗ cũ được → chờ trang đủ cao rồi cuộn; người dùng tự cuộn thì thôi.
function restoreScroll(y) {
  let stopped = false;
  const stop = () => { stopped = true; };
  ["wheel", "touchstart", "keydown", "mousedown"].forEach((t) => window.addEventListener(t, stop, { once: true, passive: true }));
  const started = Date.now();
  let hits = 0;
  const timer = setInterval(() => {
    if (stopped || Date.now() - started > 4000) { clearInterval(timer); return; }
    if (document.documentElement.scrollHeight - window.innerHeight < y - 2) return; // trang chưa đủ cao
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: "instant" });
    if (++hits >= 6) clearInterval(timer); // giữ thêm ~0,6s vì các khối phía trên còn nạp và đẩy trang xuống
  }, 100);
}

// Trang phân trang đang xem lúc rời đi — trang chủ dùng để mở lại đúng trang khi người dùng bấm "quay lại"
export function backPage() {
  const b = read(BACK);
  return isBackNav() && b && b.path === here() ? Math.max(1, Number(b.page) || 1) : 1;
}

let inited = false;
export function initProductFlow() {
  if (inited) return;
  inited = true;
  document.addEventListener("click", onClick, true);

  // Trở lại trang này (kể cả từ bfcache): gỡ trạng thái "đang rời"
  window.addEventListener("pageshow", () => { clearMarks(); goingToProduct = false; });

  // Chuyển cảnh xong thì gỡ tên, kẻo ảnh dính tên sang lần chuyển trang khác
  window.addEventListener("pagereveal", (e) => {
    if (e.viewTransition) e.viewTransition.finished.then(clearNames, clearNames);
    else clearNames();
  });

  // Rời trang chi tiết về lại danh sách: đặt tên cho ảnh lớn để nó bay ngược về thẻ
  window.addEventListener("pageswap", (e) => {
    if (!e.viewTransition || goingToProduct || reduced()) return;
    const main = document.getElementById("mainGalleryImg");
    if (main && inView(main.getBoundingClientRect())) { clearNames(); setName(main); }
  });

  const b = read(BACK);
  if (isBackNav() && b && b.path === here() && b.y > 0) restoreScroll(b.y);
}
