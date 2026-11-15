// ==========================================================
// care-week.js — "Lịch chăm sóc tuần đầu" trên trang chi tiết: từ danh sách để đọc thành công cụ dùng được.
//   • Chọn NGÀY NHẬN CÂY → "Ngày 1 / 2–3 / 4 / 7" đổi thành ngày thật có thứ ("Thứ Ba 17/11"); mốc hôm nay nổi bật.
//     Gợi ý sẵn: ngày đã lưu → ngày giao của đơn có cây này (đã giao / hẹn giao / dự kiến giao) → hôm nay.
//     Xóa ngày thì lịch quay về dạng "Ngày 1…", vẫn đầy đủ.
//   • Ô "Đã làm" cho từng mốc, giữ lại khi quay lại trang:
//       - Đã đăng nhập: lưu vào tài khoản trên máy chủ, trường user.careJournal[productId] = { start, done[], updatedAt }
//         (giống cách lưu "Yêu thích" trong favorites.js) → dùng được trên mọi máy.
//       - Chưa đăng nhập: lưu tạm trong localStorage ("careweek_guest"); đăng nhập rồi thì gộp vào tài khoản.
//     Mọi đọc / ghi trình duyệt bọc try/catch; ghi máy chủ lỗi thì vẫn giữ bản trên trình duyệt và báo nhẹ.
//   • "Thêm vào lịch điện thoại": tải file .ics (RFC 5545, UTF-8, sự kiện cả ngày, nhắc 9 giờ sáng).
//   • Mầm cây lớn dần theo số mốc đã làm. Chuyển động một lần, tắt khi giảm chuyển động.
// ==========================================================
import { getUser, setUser } from "./storage.js";
import { getUserById, updateUser, getOrdersByUser } from "./api.js";
import { escapeHTML, removeAccents, showToast, prefersReducedMotion } from "./ui.js";

const GUEST_KEY = "careweek_guest";
const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayName = (d) => `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

// ---------- Các mốc (suy ra từ chỉ số của chính cây đang xem) ----------
const STEP_ICON = {
  d1: '<path d="M4 20h16M7 20v-6h10v6M9 14V9h6v5"/><path d="M12 9V5m0 2c-2 0-3-1-3-3 2 0 3 1 3 3zm0-1c2 0 3-1 3-3-2 0-3 1-3 3z"/>',
  d23: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M15 3l.6 1.4L17 5l-1.4.6L15 7l-.6-1.4L13 5l1.4-.6z"/>',
  d4: '<path d="M4 12h9l3-4h3M7 12l1.5 7h7l1.5-7"/><path d="M19 8c1 2 1 3 0 4"/><path d="M21 13v.01M20 16v.01"/>',
  d7: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M9 12l2 2 4-4"/>',
};
export function careWeekSteps(product) {
  // Ưu tiên dữ liệu admin đã chỉnh (careWeekSteps); fallback sang tính toán từ careLevel
  if (Array.isArray(product?.careWeekSteps) && product.careWeekSteps.length) return product.careWeekSteps;
  const c = product?.careLevel;
  if (!c) return null;
  const light = Number(c.light) || 0, water = Number(c.water) || 0;
  const place = light >= 67 ? "Đặt ở bậu cửa có nắng trực tiếp 3–4 tiếng mỗi ngày."
    : light >= 34 ? "Đặt gần cửa sổ, nơi sáng dịu — tránh nắng gắt buổi trưa." : "Đặt nơi râm mát, ánh sáng đèn phòng là đủ.";
  const firstWater = water >= 67 ? "Tưới đẫm tới khi nước chảy ra lỗ thoát. Loài này ưa ẩm, đừng để đất khô hẳn."
    : water >= 34 ? "Thọc ngón tay xuống đất 2cm: thấy khô thì tưới vừa đủ ẩm."
      : "Chưa cần tưới. Loài này chịu hạn — tưới thưa an toàn hơn tưới nhiều.";
  const spec = String(product.specs?.water || "").trim();
  const rhythm = spec
    ? (/^thay/i.test(spec) ? spec.charAt(0).toLowerCase() + spec.slice(1) : `tưới ${spec.charAt(0).toLowerCase() + spec.slice(1)}`)
    : water >= 67 ? "2–3 ngày tưới một lần" : water >= 34 ? "mỗi tuần tưới một lần" : "2–3 tuần mới tưới một lần";
  return [
    { key: "d1", from: 0, to: 0, day: "Ngày 1", title: "Cho cây về chỗ ở", text: `${place} Chưa thay chậu, chưa bón phân.` },
    { key: "d23", from: 1, to: 2, day: "Ngày 2–3", title: "Để cây làm quen", text: "Giữ nguyên vị trí, không xoay chậu. Vài lá già hơi rũ là bình thường sau vận chuyển." },
    { key: "d4", from: 3, to: 3, day: "Ngày 4", title: "Lần tưới đầu tiên", text: firstWater },
    { key: "d7", from: 6, to: 6, day: "Ngày 7", title: "Kiểm tra & vào nhịp", text: `Lau bụi trên lá, xoay chậu 1/4 vòng cho cây mọc đều. Từ đây: ${rhythm}.` },
  ];
}

// ---------- Lưu trạng thái ----------
function readGuestAll() {
  try { const o = JSON.parse(localStorage.getItem(GUEST_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
function writeGuestAll(all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(GUEST_KEY, JSON.stringify(all));
    else localStorage.removeItem(GUEST_KEY);
  } catch { /* trình duyệt chặn localStorage → chỉ giữ trong lúc mở trang */ }
}
const clean = (e) => (e && typeof e === "object" ? { start: parseYmd(e.start) ? e.start : "", done: Array.isArray(e.done) ? e.done.map(String) : [], updatedAt: e.updatedAt || "" } : null);

async function loadEntry(pid) {
  const user = await getUser().catch(() => null);
  const guestAll = readGuestAll();
  const guest = clean(guestAll[pid]);
  if (!user) return { user: null, entry: guest };
  const fresh = await getUserById(user.id).catch(() => null);
  const server = clean(fresh?.careJournal?.[pid]);
  // Vừa đăng nhập mà có bản tạm cho cây này → gộp vào tài khoản (ngày lấy bản mới hơn, mốc đã làm = hợp của hai bản)
  if (guest && fresh) {
    const newer = !server || String(guest.updatedAt) > String(server.updatedAt) ? guest : server;
    const merged = { start: newer.start || server?.start || guest.start, done: [...new Set([...(server?.done || []), ...guest.done])], updatedAt: new Date().toISOString() };
    try {
      await updateUser(user.id, { careJournal: { ...(fresh.careJournal || {}), [pid]: merged } });
      delete guestAll[pid]; writeGuestAll(guestAll);
      return { user, entry: merged };
    } catch { return { user, entry: merged }; }
  }
  return { user, entry: server };
}

async function saveEntry(user, pid, entry) {
  const data = { ...entry, updatedAt: new Date().toISOString() };
  if (!user) {
    const all = readGuestAll(); all[pid] = data; writeGuestAll(all);
    return true;
  }
  try {
    const fresh = await getUserById(user.id);                 // đọc lại để không đè nhật ký của cây khác
    const journal = { ...(fresh?.careJournal || {}), [pid]: data };
    await updateUser(user.id, { careJournal: journal });
    try { await setUser({ ...user, careJournal: journal }); } catch { /* phiên chỉ là bản sao */ }
    return true;
  } catch {
    const all = readGuestAll(); all[pid] = data; writeGuestAll(all); // giữ tạm trên trình duyệt, lần sau gộp lên
    return false;
  }
}

// Ngày gợi ý: ngày giao của đơn gần nhất có cây này (đã giao → hẹn giao → dự kiến giao), không có thì hôm nay
async function suggestStart(user, pid) {
  if (!user) return { date: ymd(new Date()), why: "Gợi ý: hôm nay" };
  try {
    const orders = (await getOrdersByUser(user.id))
      .filter((o) => !["cancelled", "returned"].includes(o.status) && (o.items || []).some((it) => String(it.productId) === String(pid)))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const o = orders[0];
    if (o) {
      if (o.deliveredAt) return { date: ymd(new Date(o.deliveredAt)), why: `Theo đơn #${o.id} — ngày đã giao` };
      if (parseYmd(o.expectedDeliveryDate)) return { date: o.expectedDeliveryDate, why: `Theo đơn #${o.id} — ngày shop hẹn giao` };
      const { deliveryEstimate, loadDeliveryRules } = await import("./order-flow.js");
      await loadDeliveryRules().catch(() => {});
      const eta = deliveryEstimate(o);
      if (eta?.from) return { date: ymd(eta.from), why: `Theo đơn #${o.id} — ngày giao dự kiến sớm nhất` };
    }
  } catch { /* không đọc được đơn → dùng hôm nay */ }
  return { date: ymd(new Date()), why: "Gợi ý: hôm nay" };
}

// ---------- File .ics (RFC 5545) ----------
const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Gấp dòng dài quá 75 byte (UTF-8), không cắt giữa một ký tự nhiều byte
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ""; bytes = 0; limit = 74; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export function buildIcs(product, startYmd, steps, now = new Date()) {
  const start = parseYmd(startYmd);
  if (!start || !steps) return "";
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//La va Soi//Lich cham soc tuan dau//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`Chăm sóc ${product.name} — Lá & Sỏi`)}`,
  ];
  steps.forEach((s) => {
    const a = addDays(start, s.from), b = addDays(start, s.to + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:lasoi-${String(product.id).replace(/[^A-Za-z0-9_-]/g, "")}-${s.key}-${icsDate(start)}@la-va-soi`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(a)}`,
      `DTEND;VALUE=DATE:${icsDate(b)}`,
      `SUMMARY:${icsText(`${product.name} · ${s.day}: ${s.title}`)}`,
      `DESCRIPTION:${icsText(`${s.text}\nLịch chăm sóc tuần đầu từ tiệm cây Lá & Sỏi.`)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(`${product.name}: ${s.title}`)}`, "TRIGGER;RELATED=START:PT9H", "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---------- Hình mầm cây lớn dần (0–4 mốc đã làm) ----------
function sproutSvg(n) {
  return `<svg class="cw-sprout" data-stage="${n}" viewBox="0 0 64 72" width="64" height="72" role="img" aria-label="Mầm cây: đã làm ${n} trên 4 mốc">
    <path class="cw-sprout__pot" d="M14 52h36l-4 18H18z"/><path class="cw-sprout__soil" d="M14 52h36"/>
    <path class="cw-sprout__stem" d="M32 52V${52 - 6 - n * 7}"/>
    <path class="cw-sprout__leaf cw-sprout__leaf--1" d="M32 44c-7 0-11-4-11-9 7 0 11 4 11 9z"/>
    <path class="cw-sprout__leaf cw-sprout__leaf--2" d="M32 38c7 0 11-4 11-9-7 0-11 4-11 9z"/>
    <path class="cw-sprout__leaf cw-sprout__leaf--3" d="M32 31c-6 0-10-4-10-8 6 0 10 3 10 8z"/>
    <path class="cw-sprout__leaf cw-sprout__leaf--4" d="M32 25c5 0 8-3 8-7-5 0-8 3-8 7z"/>
  </svg>`;
}

// ---------- Giao diện ----------
export function careWeekHtml(product) {
  const steps = careWeekSteps(product);
  if (!steps) return "";
  return `
    <section class="care-week cw" aria-labelledby="cwTitle" data-pid="${escapeHTML(String(product.id))}">
      <div class="cw-head">
        <div>
          <h2 id="cwTitle">Lịch chăm sóc tuần đầu</h2>
          <p class="care-week__lead">Bảy ngày đầu quyết định cây có bén chỗ mới hay không — làm theo 4 mốc này là đủ.</p>
        </div>
        <div class="cw-progress" aria-live="polite">${sproutSvg(0)}<span class="cw-progress__text">Đã làm <b>0</b>/4</span></div>
      </div>
      <div class="cw-tools">
        <label class="cw-date"><span>Ngày nhận cây</span><input type="date" id="cwStart" aria-describedby="cwWhy"></label>
        <button type="button" class="btn btn--text btn--sm" id="cwToday">Hôm nay</button>
        <button type="button" class="btn btn--text btn--sm" id="cwClear">Bỏ ngày</button>
        <button type="button" class="btn btn--ghost btn--sm cw-ics" id="cwIcs">📅 Tải file .ics</button>
        <button type="button" class="btn btn--text btn--sm" id="cwGcal">🔗 Thêm Google Calendar</button>
        <p class="cw-why" id="cwWhy"></p>
      </div>
      <ol class="care-week__list cw-list">
        ${steps.map((s, i) => `
          <li class="cw-step" data-step="${s.key}" style="--i:${i}">
            <span class="cw-step__dot" aria-hidden="true"><svg viewBox="0 0 24 24">${STEP_ICON[s.key]}</svg></span>
            <div class="cw-step__body">
              <p class="cw-step__when"><span class="care-week__day cw-step__day">${s.day}</span><span class="cw-step__date"></span><span class="cw-step__today" hidden>Hôm nay</span></p>
              <strong>${escapeHTML(s.title)}</strong>
              <p>${escapeHTML(s.text)}</p>
            </div>
            <label class="cw-check"><input type="checkbox" data-done="${s.key}"><span>Đã làm</span></label>
          </li>`).join("")}
      </ol>
    </section>`;
}

export async function initCareWeek(section, product) {
  const steps = careWeekSteps(product);
  if (!section || !steps) return;
  const pid = String(product.id);
  const input = section.querySelector("#cwStart");
  const why = section.querySelector("#cwWhy");
  const icsBtn = section.querySelector("#cwIcs");
  let state = { start: "", done: [] };
  let user = null;
  let suggested = false;           // ngày đang hiện chỉ là gợi ý, chưa lưu

  function paint() {
    const start = parseYmd(state.start);
    const today = startOfDay(new Date());
    section.classList.toggle("has-date", !!start);
    steps.forEach((s) => {
      const li = section.querySelector(`[data-step="${s.key}"]`);
      const dateEl = li.querySelector(".cw-step__date");
      const todayEl = li.querySelector(".cw-step__today");
      const done = state.done.includes(s.key);
      li.querySelector("[data-done]").checked = done;
      li.classList.toggle("is-done", done);
      if (start) {
        const a = addDays(start, s.from), b = addDays(start, s.to);
        dateEl.textContent = s.from === s.to ? dayName(a) : `${dayName(a)} – ${dayName(b)}`;
        const isToday = today >= a && today <= b;
        li.classList.toggle("is-today", isToday);
        li.classList.toggle("is-past", today > b && !done);
        todayEl.hidden = !isToday;
        li.querySelector(".cw-step__day").classList.add("is-small");
      } else {
        dateEl.textContent = "";
        li.classList.remove("is-today", "is-past");
        todayEl.hidden = true;
        li.querySelector(".cw-step__day").classList.remove("is-small");
      }
    });
    const n = state.done.filter((k) => steps.some((s) => s.key === k)).length;
    section.querySelector(".cw-progress").innerHTML = `${sproutSvg(n)}<span class="cw-progress__text">${n === 4 ? "Xong tuần đầu! 🌱" : `Đã làm <b>${n}</b>/4`}</span>`;
    input.value = state.start || "";
    icsBtn.disabled = !start;
    icsBtn.title = start ? "Tải file .ics để thêm 4 mốc vào lịch Google / iPhone / Outlook" : "Chọn ngày nhận cây trước";
  }

  async function persist() {
    suggested = false;
    const ok = await saveEntry(user, pid, state);
    if (!ok) showToast("Chưa lưu được lên tài khoản — đã giữ tạm trên trình duyệt này.", { icon: "alert" });
  }

  // Nạp trạng thái đã lưu, không có thì gợi ý ngày
  const loaded = await loadEntry(pid).catch(() => ({ user: null, entry: null }));
  user = loaded.user;
  if (loaded.entry) {
    state = { start: loaded.entry.start || "", done: loaded.entry.done || [] };
    why.textContent = state.start ? (user ? "Đã lưu vào tài khoản của bạn." : "Đã lưu trên trình duyệt này — đăng nhập để giữ trên mọi máy.") : "";
  } else {
    const s = await suggestStart(user, pid);
    state = { start: s.date, done: [] };
    suggested = true;
    why.textContent = `${s.why}. Đổi ngày nếu bạn nhận cây hôm khác.`;
  }
  paint();
  if (!prefersReducedMotion()) section.classList.add("cw--anim");

  input.addEventListener("change", async () => {
    state.start = parseYmd(input.value) ? input.value : "";
    why.textContent = state.start ? (user ? "Đã lưu vào tài khoản của bạn." : "Đã lưu trên trình duyệt này — đăng nhập để giữ trên mọi máy.") : "Chưa chọn ngày — lịch hiện theo thứ tự ngày 1 → 7.";
    paint();
    await persist();
  });
  section.querySelector("#cwToday").addEventListener("click", () => { input.value = ymd(new Date()); input.dispatchEvent(new Event("change")); });
  section.querySelector("#cwClear").addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("change")); });
  section.addEventListener("change", async (e) => {
    const box = e.target.closest("[data-done]");
    if (!box) return;
    const k = box.dataset.done;
    state.done = box.checked ? [...new Set([...state.done, k])] : state.done.filter((x) => x !== k);
    if (suggested && !state.start) state.start = input.value;
    paint();
    await persist();
  });
  icsBtn.addEventListener("click", () => {
    const ics = buildIcs(product, state.start, steps);
    if (!ics) return;
    const slug = removeAccents(product.name || "cay").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cay";
    const fname = `lich-cham-soc-${slug}.ics`;
    // data URI hoạt động trên cả mobile (Android/iOS) lẫn desktop
    const dataUri = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
    const a = document.createElement("a");
    a.href = dataUri; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    if (suggested) persist();
    showToast("Đã tải lịch 4 mốc (.ics) — mở file để thêm vào lịch của bạn.");
  });
  // Nút phụ: thêm vào Google Calendar (hữu ích khi điện thoại không mở được .ics)
  const gcalBtn = section.querySelector("#cwGcal");
  if (gcalBtn) gcalBtn.addEventListener("click", () => {
    const start = parseYmd(state.start);
    if (!start || !steps?.length) { showToast("Chọn ngày bắt đầu trước."); return; }
    const s0 = steps[0], sLast = steps[steps.length - 1];
    const a = addDays(start, s0.from), b = addDays(start, sLast.to + 1);
    const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const title = encodeURIComponent(`Chăm sóc ${product.name} — tuần đầu`);
    const detail = encodeURIComponent(steps.map((s) => `${s.day}: ${s.title}\n${s.text}`).join("\n\n") + "\n\nLá & Sỏi 🌿");
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(a)}/${fmt(b)}&details=${detail}`;
    window.open(url, "_blank", "noopener");
  });
}
