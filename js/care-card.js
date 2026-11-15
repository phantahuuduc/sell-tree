// ==========================================================
// care-card.js — "Phiếu chăm sóc thực vật" trên trang chi tiết (kiểu nhãn tiêu bản).
// Mỗi chỉ số một hình vẽ hợp bản chất của nó, đều SUY RA từ dữ liệu sẵn có (specs + careLevel), không viết cứng theo cây:
//   • Tưới nước → dải lịch 4 tuần, giọt nước ở những ngày cần tưới (đọc "2 lần/tuần", "10 ngày 1 lần", "3 tuần 1 lần"…).
//   • Ánh sáng  → sơ đồ căn phòng nhìn từ trên: cửa sổ + 4 vị trí, tô những chỗ hợp với cây (đọc "Bán râm", "Nắng gắt"…).
//   • Độ ẩm     → chiếc lá với 0–4 giọt sương đọng (đọc "Thấp", "Cao", "Rất cao"…).
//   • Chậu      → chậu vẽ đúng tỉ lệ cạnh một ly cà phê (đọc số cm trong "Chậu 15cm", "Chậu treo 12cm", "Bình thủy tinh 12cm").
// Thiếu / lạ dữ liệu chữ → dùng careLevel (0–100) để suy ra; thiếu cả hai → bỏ chỉ số đó, không vẽ bừa.
// Phụ kiện (không có careLevel): "Hồ sơ dụng cụ vườn" — chậu thì vẽ chậu theo tỉ lệ, giá thể thì quy đổi số lít ra số chậu.
// Chuyển động: chạy một lần khi cuộn tới (thêm lớp .is-in), chỉ transform / opacity; tắt khi bật giảm chuyển động.
// ==========================================================
import { escapeHTML, removeAccents, prefersReducedMotion } from "./ui.js";

const norm = (s) => removeAccents(String(s || "")).toLowerCase().replace(/\s+/g, " ").trim();
const fmt1 = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");

// ---------- 1. Tưới nước ----------
// Trả số ngày giữa hai lần tưới (có thể lẻ: 1–2 lần/tuần → ~4,7 ngày)
export function waterPlan(specText, level) {
  const t = norm(specText);
  let m, days = null, hydro = false;
  if (/thay nuoc/.test(t)) { hydro = true; days = 7; }
  else if ((m = t.match(/(\d+)\s*[–-]\s*(\d+)\s*lan\s*\/\s*tuan/))) days = 7 / ((+m[1] + +m[2]) / 2);
  else if ((m = t.match(/(\d+)\s*lan\s*\/\s*tuan/))) days = 7 / +m[1];
  else if ((m = t.match(/(\d+)\s*tuan\s*(\d+)?\s*lan/))) days = (7 * +m[1]) / (+m[2] || 1);
  else if ((m = t.match(/(\d+)\s*ngay\s*(\d+)?\s*lan/))) days = +m[1] / (+m[2] || 1);
  if (!(days > 0) && Number.isFinite(Number(level))) days = level >= 67 ? 3 : level >= 34 ? 7 : 14;
  if (!(days > 0)) return null;
  const marks = [];
  for (let k = 0; Math.round(k * days) < 28; k++) marks.push(Math.round(k * days));
  const level3 = hydro ? "Thủy sinh" : days <= 3.6 ? "Ưa nước" : days <= 8 ? "Tưới vừa phải" : "Ít nước — chịu hạn";
  const perMonth = Math.round(30 / days);
  return { days, hydro, marks, label: level3, perMonth };
}

// ---------- 2. Ánh sáng ----------
export const LIGHT_SPOTS = [
  "Sát bậu cửa sổ — nắng chiếu thẳng",
  "Cạnh cửa sổ có rèm — sáng nhiều, không gắt",
  "Cách cửa sổ 2–3 m — sáng dịu",
  "Góc phòng xa cửa — ánh sáng yếu / đèn",
];
export function lightSpots(specText, level) {
  const t = norm(specText);
  if (/moi muc sang/.test(t)) return [1, 2, 3];
  if (/gat|truc tiep/.test(t)) return [0];
  if (/nang gian tiep/.test(t)) return [1];
  if (/nang/.test(t)) return [0, 1];                 // "Nắng sáng", "Nắng"…
  if (/sang gian tiep/.test(t)) return [1, 2];
  if (/ban ram/.test(t)) return [2];
  if (/ram/.test(t)) return [2, 3];
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  return n >= 85 ? [0] : n >= 70 ? [0, 1] : n >= 55 ? [1, 2] : n >= 40 ? [2] : [2, 3];
}

// ---------- 3. Độ ẩm ----------
const HUMID_WORDS = ["Rất khô", "Khô thoáng", "Vừa phải", "Ẩm", "Rất ẩm"];
export function humidityPlan(specText, level) {
  const t = norm(specText);
  let n = /rat thap/.test(t) ? 0 : /thap/.test(t) ? 1 : /trung binh|vua/.test(t) ? 2 : /rat cao/.test(t) ? 4 : /cao/.test(t) ? 3 : null;
  if (n === null && Number.isFinite(Number(level))) n = level >= 85 ? 4 : level >= 60 ? 3 : level >= 40 ? 2 : level >= 20 ? 1 : 0;
  if (n === null) return null;
  const advice = n >= 3
    ? "Phun sương lá 2–3 lần mỗi tuần, hoặc đặt chậu trên khay sỏi có nước."
    : n === 2 ? "Độ ẩm phòng bình thường là đủ, không cần phun sương."
      : "Không phun sương — để lá và đất khô thoáng, tránh úng.";
  return { level: n, word: HUMID_WORDS[n], advice };
}

// ---------- 4. Chậu ----------
export function potPlan(text) {
  const m = String(text || "").match(/(\d+(?:[.,]\d+)?)\s*cm/i);
  if (!m) return null;
  const cm = Number(m[1].replace(",", "."));
  const t = norm(text);
  const kind = /binh/.test(t) ? "vase" : /treo/.test(t) ? "hanging" : "pot";
  const cup = 8;                              // ly cà phê ~8cm miệng
  const r = cm / cup;
  const compare = r <= 1.15 ? "nhỏ cỡ một ly cà phê" : r < 1.75 ? `rộng chừng ${fmt1(r)} ly cà phê` : `rộng gần ${fmt1(r)} ly cà phê đặt cạnh nhau`;
  return { cm, kind, compare };
}

// ---------- Hình vẽ (SVG nội tuyến, màu theo token CSS) ----------
const ICON = {
  water: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  mist: '<path d="M4 14a4 4 0 0 1 .6-7.95A6 6 0 0 1 16 5a4.5 4.5 0 0 1 3.5 8"/><path d="M8 18h8M6 21h10"/>',
  pot: '<path d="M5 10h14l-1.5 10h-11z"/><path d="M4 10h16"/><path d="M12 10V4M12 7c-2 0-3-1.5-3-3 2 0 3 1.5 3 3zM12 6c2 0 3-1.5 3-3-2 0-3 1.5-3 3z"/>',
};
const icon = (k) => `<svg class="cc-ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

function waterSvg(plan) {
  const S = 15, G = 4, cols = 7, rows = 4;
  const w = cols * (S + G) - G, h = rows * (S + G) - G;
  const set = new Set(plan.marks);
  let cells = "";
  for (let i = 0; i < cols * rows; i++) {
    const x = (i % cols) * (S + G), y = Math.floor(i / cols) * (S + G);
    const on = set.has(i);
    cells += on
      ? `<g class="cc-drop" style="--d:${plan.marks.indexOf(i)}"><rect x="${x}" y="${y}" width="${S}" height="${S}" rx="3" class="cc-cell is-on"/><path transform="translate(${x + S / 2 - 4.5} ${y + 2.5}) scale(.42)" d="${"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"}" class="cc-drop__shape"/></g>`
      : `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="3" class="cc-cell"/>`;
  }
  return `<svg class="cc-fig cc-fig--water" viewBox="-1 -1 ${w + 2} ${h + 2}" width="${w + 2}" height="${h + 2}" role="img"
    aria-label="Lịch 4 tuần: ${plan.hydro ? "thay nước" : "tưới"} ${plan.marks.length} lần, khoảng ${fmt1(plan.days)} ngày một lần">${cells}</svg>`;
}

function lightSvg(spots) {
  // Căn phòng nhìn từ trên: cửa sổ bên trái, 4 vị trí xa dần
  const pos = [[30, 54], [62, 30], [104, 56], [146, 82]];
  const on = new Set(spots);
  const dots = pos.map(([x, y], i) => on.has(i)
    ? `<g class="cc-spot is-on" style="--d:${i}"><circle cx="${x}" cy="${y}" r="11"/><path d="M${x - 5} ${y + 1}l3.5 3.5 6.5-7" class="cc-spot__tick"/></g>`
    : `<g class="cc-spot"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y + 4.5}" text-anchor="middle">${i + 1}</text></g>`).join("");
  const rays = [0, 1, 2].map((k) => `<path class="cc-ray" style="--d:${k}" d="M14 ${30 + k * 22} L ${60 + k * 18} ${40 + k * 22}"/>`).join("");
  return `<svg class="cc-fig cc-fig--light" viewBox="0 0 170 110" width="170" height="110" role="img"
    aria-label="Sơ đồ căn phòng: hợp đặt ở ${spots.map((i) => `vị trí ${i + 1} (${LIGHT_SPOTS[i].toLowerCase()})`).join(", ")}">
    <rect x="4" y="4" width="162" height="102" rx="6" class="cc-room"/>
    <rect x="2" y="18" width="6" height="74" rx="2" class="cc-window"/>
    ${rays}${dots}
  </svg>`;
}

function humiditySvg(plan) {
  const drops = [[52, 40], [70, 58], [44, 66], [64, 30]].slice(0, plan.level)
    .map(([x, y], i) => `<ellipse class="cc-dew" style="--d:${i}" cx="${x}" cy="${y}" rx="4" ry="5"/>`).join("");
  const mist = plan.level >= 3 ? '<path class="cc-mist" d="M88 22c6-4 10 4 16 0M90 34c6-4 10 4 16 0M86 46c6-4 10 4 16 0"/>' : "";
  return `<svg class="cc-fig cc-fig--humid" viewBox="0 0 120 96" width="120" height="96" role="img"
    aria-label="Độ ẩm: ${plan.word.toLowerCase()} — ${plan.level} trên 4 giọt sương">
    <path class="cc-leaf" d="M14 86C10 46 40 12 84 10c-2 42-28 74-70 76z"/>
    <path class="cc-vein" d="M14 86C34 62 54 40 82 12"/>
    ${drops}${mist}
  </svg>`;
}

// Chậu đứng cạnh ly cà phê, cùng một tỉ lệ (px / cm)
export function potSvg(plan, label = "") {
  const k = 4.2, cupD = 8, cupH = 9;
  const potW = plan.cm * k, potH = plan.cm * k * (plan.kind === "vase" ? 1.25 : 0.85);
  const cupW = cupD * k, cupHpx = cupH * k;
  const gap = 18, padX = 10, base = 124;
  const W = Math.max(180, padX * 2 + cupW + gap + potW + 10);
  const cx = padX, px = padX + cupW + gap;
  const top = base - potH;
  let pot;
  if (plan.kind === "vase") {
    pot = `<path class="cc-pot cc-pot--glass" d="M${px + potW * 0.2} ${top} h${potW * 0.6} q${potW * 0.12} ${potH * 0.25} ${potW * 0.2} ${potH * 0.55} v${potH * 0.4} q0 ${potH * 0.05} -${potW * 0.06} ${potH * 0.05} h-${potW * 0.88} q-${potW * 0.06} 0 -${potW * 0.06} -${potH * 0.05} v-${potH * 0.4} q${potW * 0.08} -${potH * 0.3} ${potW * 0.2} -${potH * 0.55}z"/>
      <path class="cc-water" d="M${px + potW * 0.05} ${top + potH * 0.55} h${potW * 0.9}"/>`;
  } else {
    pot = `<path class="cc-pot" d="M${px} ${top} h${potW} l-${potW * 0.12} ${potH} h-${potW * 0.76} z"/>
      <rect class="cc-pot__rim" x="${px - 2}" y="${top - 4}" width="${potW + 4}" height="7" rx="2"/>`;
    if (plan.kind === "hanging") pot += `<path class="cc-hanger" d="M${px + 2} ${top - 2} L${px + potW / 2} ${Math.max(6, top - 42)} L${px + potW - 2} ${top - 2}"/>`;
  }
  const sprout = `<path class="cc-sprout" d="M${px + potW / 2} ${top - 2} v-14 M${px + potW / 2} ${top - 10} c-8 0 -11 -6 -11 -10 c7 0 11 4 11 10 M${px + potW / 2} ${top - 13} c7 0 10 -5 10 -9 c-6 0 -10 4 -10 9"/>`;
  // Khung hình vừa khít nội dung (chậu nhỏ không để trống phía trên)
  const minTop = Math.min(base - cupHpx - 18, top - (plan.kind === "hanging" ? 46 : plan.kind === "vase" ? 6 : 20));
  const y0 = Math.max(0, Math.floor(minTop - 4)), H = 142 - y0;
  return `<svg class="cc-fig cc-fig--pot" viewBox="0 ${y0} ${Math.round(W)} ${H}" width="${Math.round(W)}" height="${H}" role="img"
    aria-label="${escapeHTML(label || `Chậu ${plan.cm}cm`)} vẽ cạnh một ly cà phê 8cm: ${plan.compare}">
    <path class="cc-ground" d="M2 ${base + 0.5} H${W - 2}"/>
    <g class="cc-cup"><path d="M${cx} ${base - cupHpx} h${cupW} l-2 ${cupHpx} h-${cupW - 4} z"/><path d="M${cx + cupW} ${base - cupHpx * 0.75} c9 0 9 ${cupHpx * 0.45} -1 ${cupHpx * 0.45}" class="cc-cup__handle"/>
      <path class="cc-steam" d="M${cx + cupW * 0.35} ${base - cupHpx - 4} c-3 -4 3 -6 0 -11 M${cx + cupW * 0.65} ${base - cupHpx - 4} c-3 -4 3 -6 0 -11"/></g>
    <g class="cc-potgroup">${pot}${plan.kind === "vase" ? "" : sprout}</g>
    <text class="cc-cap" x="${cx + cupW / 2}" y="${base + 13}" text-anchor="middle">8cm</text>
    <text class="cc-cap" x="${px + potW / 2}" y="${base + 13}" text-anchor="middle">${fmt1(plan.cm)}cm</text>
  </svg>`;
}

// ---------- Khung phiếu ----------
function head(title, product, code) {
  const sci = product.scientificName ? `<p class="cc-sci"><em>${escapeHTML(product.scientificName)}</em></p>` : "";
  return `
    <header class="cc-head">
      <div>
        <p class="cc-kicker">${title}</p>
        <h2 class="cc-name">${escapeHTML(product.name)}</h2>
        ${sci}
      </div>
      <span class="cc-stamp" aria-label="Mã tiêu bản ${escapeHTML(code)}"><small>Tiêu bản</small><b>${escapeHTML(code)}</b></span>
    </header>`;
}
function row(key, ico, label, figure, value, note) {
  return `
    <div class="cc-row cc-row--${key}">
      <div class="cc-row__fig">${figure}</div>
      <div class="cc-row__text">
        <h3 class="cc-row__label">${icon(ico)}${label}</h3>
        <p class="cc-row__value">${value}</p>
        ${note ? `<p class="cc-row__note">${note}</p>` : ""}
      </div>
    </div>`;
}

export function careCardHtml(product, code) {
  const s = product.specs || {}, c = product.careLevel || {};
  const isAlert = product.difficulty === "Cần chú ý";
  const rows = [];

  const w = waterPlan(s.water, c.water);
  if (w) rows.push(row("water", "water", "Tưới nước", waterSvg(w),
    `<b>${escapeHTML(w.label)}</b> — ${escapeHTML(s.water || `khoảng ${fmt1(w.days)} ngày một lần`)}`,
    w.hydro ? "Trồng trong nước: thay nước sạch mỗi tuần, giữ mực nước ngập rễ." : `Mỗi ô là một ngày trong 4 tuần · khoảng <b>${w.perMonth}</b> lần mỗi tháng. Thọc ngón tay xuống đất 2cm — còn ẩm thì chờ thêm.`));

  const l = lightSpots(s.light, c.light);
  if (l) rows.push(row("light", "sun", "Đặt ở đâu trong nhà?", lightSvg(l),
    `<b>${escapeHTML(s.light || "Theo sơ đồ")}</b>`,
    `<ul class="cc-spots">${LIGHT_SPOTS.map((t, i) => `<li class="${l.includes(i) ? "is-on" : ""}"><span aria-hidden="true">${i + 1}</span>${escapeHTML(t)}${l.includes(i) ? '<span class="visually-hidden"> — hợp</span>' : '<span class="visually-hidden"> — không nên</span>'}</li>`).join("")}</ul>`));

  const h = humidityPlan(s.humidity, c.humidity);
  if (h) rows.push(row("humid", "mist", "Độ ẩm không khí", humiditySvg(h),
    `<b>${escapeHTML(h.word)}</b>${s.humidity ? ` — ${escapeHTML(s.humidity)}` : ""}`, escapeHTML(h.advice)));

  const p = potPlan(s.potSize);
  if (p) rows.push(row("pot", "pot", "Kích thước chậu", potSvg(p, s.potSize),
    `<b>${escapeHTML(s.potSize)}</b>`, `Vẽ theo cùng tỉ lệ với một ly cà phê: ${escapeHTML(p.compare)}.`));
  else if (s.potSize) rows.push(`<p class="cc-plain"><b>Kích thước phù hợp:</b> ${escapeHTML(s.potSize)}</p>`);

  return `
    <section class="care-card cc${isAlert ? " is-alert" : ""}" aria-label="Phiếu chăm sóc thực vật">
      ${head("Phiếu chăm sóc thực vật", product, code)}
      <div class="cc-rows">${rows.join("")}</div>
      <footer class="cc-foot"><span>Lá &amp; Sỏi · Phòng tiêu bản</span><span>${escapeHTML(product.difficulty ? `Độ khó: ${product.difficulty}` : "")}</span></footer>
    </section>`;
}

// Phụ kiện: chậu → vẽ chậu; giá thể → quy đổi số lít ra số chậu
export function accessoryCardHtml(product, code) {
  const text = `${product.name || ""} ${product.description || ""}`;
  const rows = [];
  const pot = /chậu/i.test(product.name || "") ? potPlan(product.name) : null;
  if (pot) rows.push(row("pot", "pot", "Kích thước", potSvg({ ...pot, kind: "pot" }, `Chậu ${pot.cm}cm`),
    `<b>Miệng ${fmt1(pot.cm)}cm</b>`, `Vẽ cạnh một ly cà phê: ${escapeHTML(pot.compare)}. Hợp cây đang trồng trong chậu nhựa ${Math.max(6, Math.round(pot.cm - 2))}–${Math.round(pot.cm)}cm.`));
  const lit = text.match(/(\d+(?:[.,]\d+)?)\s*(?:l\b|lít)/i);
  if (!pot && lit) {
    const L = Number(lit[1].replace(",", "."));
    const potL = (d) => (0.42 * d * d * d) / 1000;     // thể tích gần đúng của chậu côn đường kính d (lít)
    const n12 = Math.max(1, Math.floor(L / potL(12))), n8 = Math.max(1, Math.floor(L / potL(8)));
    rows.push(`<p class="cc-plain"><b>${fmt1(L)} lít</b> — đủ trồng khoảng <b>${n12}</b> chậu 12cm hoặc <b>${n8}</b> chậu 8cm (ước tính).</p>`);
  }
  return `
    <section class="care-card cc cc--tool" aria-label="Hồ sơ dụng cụ vườn">
      ${head("Hồ sơ dụng cụ vườn", product, code)}
      ${rows.length ? `<div class="cc-rows">${rows.join("")}</div>` : ""}
      <p class="cc-plain">Sản phẩm dùng kèm khi trồng và chăm sóc cây cảnh trong nhà. Phù hợp cho cả người mới bắt đầu.</p>
    </section>`;
}

// Chạy hiệu ứng một lần khi phiếu cuộn tới
export function initCareCard(container) {
  const card = container.querySelector(".care-card.cc");
  if (!card) return;
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) { card.classList.add("is-in", "is-still"); return; }
  card.classList.add("is-armed");
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    card.classList.add("is-in");
    io.disconnect();
  }, { threshold: 0.25 });
  io.observe(card);
}
