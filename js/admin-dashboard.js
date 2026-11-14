// ==========================================================
// admin-dashboard.js — Trang quản trị › Thống kê.
//
// Trình bày theo kiểu "sổ tay vườn ươm", xếp từ quan trọng nhất xuống chi tiết:
//   0. Bộ lọc thời gian (tháng / quý / năm / tự chọn ngày) — MỌI số liệu và biểu đồ bên dưới đổi theo,
//      kể cả phần so sánh với kỳ liền trước. Lựa chọn lưu ở localStorage nên tải lại trang không mất.
//   1. Một câu tóm tắt kỳ + phiếu số liệu: doanh thu đứng riêng một hàng (No. 01), bốn chỉ số phụ bên dưới (No. 02–05).
//   2. Nhóm "Xu hướng doanh thu": biểu đồ ĐƯỜNG theo ngày / tuần / tháng, chồng đường nét đứt của kỳ trước;
//      đổi được sang biểu đồ cột "luống cây"; bấm chú thích để ẩn / hiện từng đường.
//   3. Nhóm "Đơn hàng": đơn đang ở bước nào · khách trả bằng gì · có gì cần để ý (No. 06–08).
//   4. Nhóm "Sản phẩm & khách hàng": biểu đồ CỘT so sánh giữa các mục (danh mục / sản phẩm / khách / bốn quý),
//      bên dưới là bảng xếp hạng chi tiết gập / mở được (No. 09–11).
// Kiểu biểu đồ, mục so sánh và trạng thái gập / mở cũng được nhớ lại.
// Doanh thu / số lượng bán chỉ tính đơn "đã bán" (isCompletedSale): đã thanh toán hoặc đã giao, không hủy / hoàn.
// ==========================================================
import { formatPrice, escapeHTML } from "./ui.js";
import { isCompletedSale } from "./sale.js";
import { attachMarker } from "./slide-marker.js";
import { GREEN, slipCell, sproutPlugin, plotOptions, plotBars, plotLine, plotPrevLine, rankOptions, countUp } from "./dash-kit.js";

const STORE_KEY = "admin_dash_range";
const VIEW_KEY = "admin_dash_view"; // cách xem: kiểu biểu đồ xu hướng, mục đang so sánh, bảng chi tiết gập hay mở
const DAY = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const fmtDay = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ---------- Lựa chọn kỳ (lưu / đọc) ----------
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && ["month", "quarter", "year", "custom"].includes(s.mode)) {
      if (s.mode === "custom" && parseYmd(s.from) && parseYmd(s.to)) return s;
      if (s.mode !== "custom" && parseYmd(s.anchor)) return s;
    }
  } catch { /* dữ liệu lưu hỏng → dùng mặc định */ }
  return { mode: "month", anchor: ymd(new Date()) };
}
function saveState(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* không lưu được cũng không sao */ }
}

function loadView() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null") || {}; } catch { /* dùng mặc định */ }
  return {
    trend: v.trend === "bar" ? "bar" : "line",
    cmp: ["cat", "prod", "cust", "quarter"].includes(v.cmp) ? v.cmp : "cat",
    open: !!v.open,
  };
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* không lưu được cũng không sao */ }
}

// ---------- Tính khoảng thời gian: kỳ đang chọn + kỳ liền trước cùng độ dài ----------
// Trả về { from, to (không gồm), label, prev: { from, to, label } }
export function resolveRange(state) {
  if (state.mode === "custom") {
    const from = parseYmd(state.from), to = new Date(parseYmd(state.to).getTime() + DAY);
    const days = Math.round((to - from) / DAY);
    const pFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() - days);
    return {
      from, to, label: `${fmtDay(from)} – ${fmtDay(new Date(to.getTime() - DAY))}`,
      prev: { from: pFrom, to: from, label: `${days} ngày liền trước` },
    };
  }
  const a = parseYmd(state.anchor) || new Date();
  const y = a.getFullYear(), m = a.getMonth();
  if (state.mode === "quarter") {
    const q = Math.floor(m / 3);
    const pq = new Date(y, q * 3 - 3, 1);
    return {
      from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 1), label: `Quý ${q + 1}/${y}`,
      prev: { from: pq, to: new Date(y, q * 3, 1), label: `Quý ${Math.floor(pq.getMonth() / 3) + 1}/${pq.getFullYear()}` },
    };
  }
  if (state.mode === "year") {
    return {
      from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: `Năm ${y}`,
      prev: { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1), label: `Năm ${y - 1}` },
    };
  }
  const pm = new Date(y, m - 1, 1);
  return {
    from: new Date(y, m, 1), to: new Date(y, m + 1, 1), label: `Tháng ${m + 1}/${y}`,
    prev: { from: pm, to: new Date(y, m, 1), label: `Tháng ${pm.getMonth() + 1}/${pm.getFullYear()}` },
  };
}

// Dời kỳ tới / lui 1 đơn vị (tháng, quý, năm)
function shift(state, dir) {
  const a = parseYmd(state.anchor) || new Date();
  const step = state.mode === "year" ? 12 : state.mode === "quarter" ? 3 : 1;
  return { ...state, anchor: ymd(new Date(a.getFullYear(), a.getMonth() + dir * step, 1)) };
}

// ---------- Chia kỳ thành các cột cho biểu đồ diễn biến ----------
// ≤ 45 ngày: theo ngày · ≤ 190 ngày: theo tuần · dài hơn: theo tháng
function buckets(range) {
  const days = Math.round((range.to - range.from) / DAY);
  const out = [];
  if (days <= 45) {
    for (let d = new Date(range.from); d < range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      out.push({ from: d, to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
  } else if (days <= 190) {
    for (let d = new Date(range.from); d < range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      const end = new Date(Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime(), range.to.getTime()));
      out.push({ from: d, to: end, label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
  } else {
    for (let d = new Date(range.from.getFullYear(), range.from.getMonth(), 1); d < range.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const from = new Date(Math.max(d.getTime(), range.from.getTime()));
      const end = new Date(Math.min(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), range.to.getTime()));
      out.push({ from, to: end, label: `T${d.getMonth() + 1}${range.from.getFullYear() !== new Date(range.to.getTime() - DAY).getFullYear() ? "/" + String(d.getFullYear()).slice(2) : ""}` });
    }
  }
  return out;
}

const inRange = (iso, r) => { const d = new Date(iso); return d >= r.from && d < r.to; };
const sum = (list) => list.reduce((s, o) => s + (Number(o.total) || 0), 0);
const qty = (list) => list.reduce((s, o) => s + (o.items || []).reduce((a, it) => a + (Number(it.quantity) || 0), 0), 0);

// So sánh với kỳ trước → { text, tone: up | down | flat }; text ghi luôn con số của kỳ trước
function delta(cur, prev, { money = false } = {}) {
  const was = `kỳ trước ${money ? formatPrice(prev) : prev}`;
  if (!prev && !cur) return { text: "bằng kỳ trước", tone: "flat" };
  if (!prev) return { text: "kỳ trước chưa có", tone: "up" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: `${was} · không đổi`, tone: "flat" };
  return { text: `${was} · ${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, tone: pct > 0 ? "up" : "down" };
}

function topProducts(orders, products, limit = 5) {
  const map = {};
  orders.forEach((o) => (o.items || []).forEach((it) => {
    const id = String(it.productId);
    map[id] = map[id] || { qty: 0, revenue: 0, name: it.name };
    map[id].qty += Number(it.quantity) || 0;
    map[id].revenue += (Number(it.price) || 0) * (Number(it.quantity) || 0);
  }));
  return Object.entries(map)
    .map(([id, v]) => ({ id, ...v, product: products.find((p) => String(p.id) === id) }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, limit);
}

const barList = (items) => {
  const max = Math.max(1, ...items.map((x) => x.value));
  return `<ul class="dsh-bars">${items.map((x) => `
    <li>
      <span class="dsh-bars__label">${x.label}</span>
      <span class="dsh-bars__track"><i style="width:${Math.round((x.value / max) * 100)}%"></i></span>
      <strong>${x.display ?? x.value}</strong>
      ${x.extra ? `<small>${x.extra}</small>` : ""}
    </li>`).join("")}</ul>`;
};

let trendChart = null;
let cmpChart = null;

export function initAdminDashboard(root, data) {
  if (!root) return;
  let state = loadState();
  const view = loadView();
  let plot = null;        // dữ liệu của hai biểu đồ ở lần vẽ gần nhất (để đổi kiểu biểu đồ không phải tính lại)
  let segMarkers = [];

  root.innerHTML = `
    <div class="dsh-toolbar">
      <div class="dsh-seg" role="group" aria-label="Kiểu kỳ thống kê">
        ${[["month", "Tháng"], ["quarter", "Quý"], ["year", "Năm"], ["custom", "Tự chọn"]].map(([k, t]) => `<button type="button" data-mode="${k}">${t}</button>`).join("")}
      </div>
      <div class="dsh-step" id="dshStep">
        <button type="button" data-shift="-1" aria-label="Kỳ trước">‹</button>
        <strong id="dshLabel" aria-live="polite"></strong>
        <button type="button" data-shift="1" aria-label="Kỳ sau">›</button>
        <button type="button" class="dsh-now" data-now>Kỳ hiện tại</button>
      </div>
      <form class="dsh-custom" id="dshCustom" hidden>
        <label>Từ <input type="date" name="from" required></label>
        <label>đến <input type="date" name="to" required></label>
        <button type="submit" class="btn btn--primary btn--sm">Áp dụng</button>
        <span class="dsh-custom__err" role="alert"></span>
      </form>
    </div>
    <div id="dshBody"></div>`;

  // Nút đang chọn của thanh kỳ trượt qua lại thay vì bật / tắt
  attachMarker(root.querySelector(".dsh-seg"), { item: "button", isActive: (b) => b.classList.contains("is-active"), key: "admin-range" });

  const body = root.querySelector("#dshBody");
  const custom = root.querySelector("#dshCustom");

  function render() {
    const r = resolveRange(state);
    const { orders, products, users, categories } = data;

    // ----- thanh công cụ -----
    root.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === state.mode));
    root.querySelector("#dshStep").hidden = state.mode === "custom";
    custom.hidden = state.mode !== "custom";
    root.querySelector("#dshLabel").textContent = r.label;
    if (state.mode === "custom") { custom.from.value = state.from; custom.to.value = state.to; }

    // ----- số liệu của kỳ + kỳ trước -----
    const all = orders.filter((o) => inRange(o.createdAt, r));
    const sold = all.filter(isCompletedSale);
    const prevAll = orders.filter((o) => inRange(o.createdAt, r.prev));
    const prevSold = prevAll.filter(isCompletedSale);
    const revenue = sum(sold), prevRevenue = sum(prevSold);
    const avg = sold.length ? Math.round(revenue / sold.length) : 0;
    const prevAvg = prevSold.length ? Math.round(prevRevenue / prevSold.length) : 0;
    const buyers = new Set(sold.map((o) => String(o.userId))).size;
    const prevBuyers = new Set(prevSold.map((o) => String(o.userId))).size;
    const potCount = qty(sold);

    // Câu tóm tắt: đọc một lượt là nắm được kỳ này
    const period = state.mode === "custom" ? `Từ ${fmtDay(r.from)} đến ${fmtDay(new Date(r.to.getTime() - DAY))}` : escapeHTML(r.label);
    const brief = sold.length
      ? `${period} bán được <b>${potCount} chậu</b> trong <b>${sold.length} đơn</b> cho <b>${buyers} khách</b>, thu <b>${formatPrice(revenue)}</b>.`
      : `${period} chưa bán được đơn nào.`;
    const diff = revenue - prevRevenue;
    const briefVs = !prevRevenue
      ? (revenue ? `${escapeHTML(r.prev.label)} chưa có doanh thu để so.` : `${escapeHTML(r.prev.label)} cũng chưa có doanh thu.`)
      : diff === 0
        ? `Bằng đúng ${escapeHTML(r.prev.label)} (${formatPrice(prevRevenue)}).`
        : `${diff > 0 ? "Nhiều hơn" : "Ít hơn"} ${escapeHTML(r.prev.label)} <b class="is-${diff > 0 ? "up" : "down"}">${formatPrice(Math.abs(diff))}</b> (${diff > 0 ? "tăng" : "giảm"} ${Math.abs(Math.round((diff / prevRevenue) * 100))}%) — kỳ đó thu ${formatPrice(prevRevenue)}.`;

    // ----- việc cần để ý -----
    const unpaid = all.filter((o) => o.status === "pending" && o.paymentStatus !== "paid").length;
    const cancelled = all.filter((o) => o.status === "cancelled").length;
    const returns = all.filter((o) => ["return_requested", "return_approved", "returned"].includes(o.status)).length;
    const refunded = all.filter((o) => o.refundStatus === "refunded").reduce((s, o) => s + (Number(o.refundAmount ?? o.total) || 0), 0);
    const low = products.filter((p) => Number(p.stock) <= 5).sort((a, b) => a.stock - b.stock);
    const newCustomers = users.filter((u) => u.role === "user" && u.createdAt && inRange(u.createdAt, r)).length;

    // ----- các khối -----
    const top = topProducts(sold, products);
    const catRev = {};
    sold.forEach((o) => (o.items || []).forEach((it) => {
      const p = products.find((x) => String(x.id) === String(it.productId));
      const name = categories.find((c) => String(c.id) === String(p?.categoryId))?.name || "Khác";
      catRev[name] = (catRev[name] || 0) + (Number(it.price) || 0) * (Number(it.quantity) || 0);
    }));
    const catList = Object.entries(catRev).sort((a, b) => b[1] - a[1]);
    const catTotal = catList.reduce((t, [, v]) => t + v, 0) || 1;
    const byMethod = (m) => sold.filter((o) => (o.paymentMethod || "") === m);
    const otherPay = sold.filter((o) => !["wallet", "qr"].includes(o.paymentMethod));
    const st = (...s) => all.filter((o) => s.includes(o.status)).length;
    const spend = {};
    sold.forEach((o) => { const k = String(o.userId); spend[k] = spend[k] || { total: 0, orders: 0 }; spend[k].total += Number(o.total) || 0; spend[k].orders += 1; });
    const topC = Object.entries(spend).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

    const bk = buckets(r);
    const span = bk.length ? Math.round((bk[0].to - bk[0].from) / DAY) : 1;
    const unit = span <= 1 ? "ngày" : span <= 7 ? "tuần" : "tháng";

    // ----- số liệu cho biểu đồ so sánh giữa các mục -----
    const top8 = topProducts(sold, products, 8);
    const year = r.from.getFullYear();
    const quarters = [0, 1, 2, 3].map((q) => {
      const range = { from: new Date(year, q * 3, 1), to: new Date(year, q * 3 + 3, 1) };
      const list = orders.filter((o) => inRange(o.createdAt, range)).filter(isCompletedSale);
      return { label: `Quý ${q + 1}`, value: sum(list), extra: `${list.length} đơn`, on: range.from < r.to && range.to > r.from };
    });
    const nameOfUser = (id) => users.find((u) => String(u.id) === id)?.name || "Khách #" + id;
    const compare = {
      cat: { title: "Doanh thu theo danh mục", money: true, rows: catList.map(([name, v]) => ({ label: name, value: v, extra: `${Math.round((v / catTotal) * 100)}% doanh thu của kỳ` })), empty: "Chưa có doanh thu trong kỳ." },
      prod: { title: "Số chậu bán ra của từng sản phẩm", money: false, unit: "chậu", rows: top8.map((x) => ({ label: x.product?.name || x.name || "Sản phẩm #" + x.id, value: x.qty, extra: formatPrice(x.revenue) })), empty: "Chưa bán được sản phẩm nào trong kỳ." },
      cust: { title: "Số tiền mỗi khách đã mua", money: true, rows: topC.map(([id, v]) => ({ label: nameOfUser(id), value: v.total, extra: `${v.orders} đơn` })), empty: "Chưa có khách mua trong kỳ." },
      quarter: { title: `Doanh thu bốn quý năm ${year}`, money: true, upright: true, rows: quarters, empty: `Năm ${year} chưa có doanh thu.`, note: "Cột đậm là quý có chứa kỳ đang xem." },
    };

    const seg = (attr, current, items, label) => `
      <div class="dsh-seg dsh-seg--sm" role="group" aria-label="${label}" data-seg="${attr}">
        ${items.map(([k, t]) => `<button type="button" data-${attr}="${k}" class="${k === current ? "is-active" : ""}" aria-pressed="${k === current}">${t}</button>`).join("")}
      </div>`;
    const group = (title, hint) => `<h3 class="dsh-group__title"><span>${title}</span><small>${hint}</small></h3>`;

    segMarkers.forEach((m) => m.destroy());
    body.innerHTML = `
      <section class="dsh-brief" aria-label="Tóm tắt ${escapeHTML(r.label)}">
        <p class="dsh-brief__main">${brief}</p>
        <p class="dsh-brief__vs">${briefVs}</p>
      </section>

      <!-- 1. Chỉ số chính: doanh thu đứng riêng một hàng, bốn chỉ số phụ xếp hàng bên dưới -->
      <section class="slip" aria-label="Phiếu số liệu ${escapeHTML(r.label)}">
        <header class="slip__head"><span>Phiếu số liệu · ${escapeHTML(r.label)}</span><span>so với ${escapeHTML(r.prev.label)}</span></header>
        ${slipCell(1, "Doanh thu của kỳ", formatPrice(revenue), delta(revenue, prevRevenue, { money: true }), "", { lead: true, count: { to: revenue, money: true } })}
        <div class="slip__cells slip__cells--4">
          ${slipCell(2, "Đơn đã bán", sold.length, delta(sold.length, prevSold.length), "đơn", { count: { to: sold.length } })}
          ${slipCell(3, "Trung bình mỗi đơn", formatPrice(avg), delta(avg, prevAvg, { money: true }), "", { count: { to: avg, money: true } })}
          ${slipCell(4, "Chậu cây đã bán", potCount, delta(potCount, qty(prevSold)), "chậu", { count: { to: potCount } })}
          ${slipCell(5, "Khách đã mua", buyers, delta(buyers, prevBuyers), "khách", { count: { to: buyers } })}
        </div>
      </section>

      <!-- 2. Xu hướng theo thời gian: biểu đồ lớn nhất trang -->
      <section class="dsh-group" aria-label="Xu hướng doanh thu">
        ${group("Xu hướng doanh thu", `từng ${unit} trong ${escapeHTML(r.label)}, đặt cạnh ${escapeHTML(r.prev.label)}`)}
        <div class="dsh-plot">
          <header class="dsh-plot__head">
            <h4 id="dshTrendTitle"></h4>
            ${seg("trend", view.trend, [["line", "Đường"], ["bar", "Cột"]], "Kiểu biểu đồ xu hướng")}
          </header>
          <div class="dsh-plot__box dsh-plot__box--tall"><canvas id="dshTrend" aria-label="Doanh thu từng mốc trong kỳ"></canvas></div>
          <p class="dsh-plot__note" id="dshPlotNote"></p>
        </div>
      </section>

      <!-- 3. Đơn hàng -->
      <section class="dsh-group" aria-label="Đơn hàng">
        ${group("Đơn hàng", `${all.length} đơn được tạo trong kỳ`)}
        <div class="dsh-grid">
          <section class="dsh-block">
            <h4>Các đơn đang ở bước nào?</h4>
            ${all.length ? barList([
              { label: "Chờ xác nhận", value: st("pending") },
              { label: "Chờ giao", value: st("confirmed") },
              { label: "Đang giao", value: st("shipping") },
              { label: "Đã giao, chờ khách", value: st("delivered", "delivery_issue") },
              { label: "Hoàn tất", value: st("completed") },
              { label: "Hoàn hàng", value: st("return_requested", "return_approved", "returned") },
              { label: "Đã hủy", value: st("cancelled") },
            ].filter((x) => x.value > 0)) : `<p class="dsh-empty">Chưa có đơn nào được tạo trong kỳ.</p>`}
          </section>

          <section class="dsh-block">
            <h4>Khách trả tiền bằng gì?</h4>
            ${sold.length ? barList([
              { label: "Ví web", value: byMethod("wallet").length, display: `${byMethod("wallet").length} đơn`, extra: formatPrice(sum(byMethod("wallet"))) },
              { label: "Chuyển khoản QR", value: byMethod("qr").length, display: `${byMethod("qr").length} đơn`, extra: formatPrice(sum(byMethod("qr"))) },
              ...(otherPay.length ? [{ label: "Không ghi nhận (đơn cũ)", value: otherPay.length, display: `${otherPay.length} đơn`, extra: formatPrice(sum(otherPay)) }] : []),
            ]) : `<p class="dsh-empty">Chưa có đơn đã bán trong kỳ.</p>`}
          </section>

          <section class="dsh-block">
            <h4>Có gì cần để ý?</h4>
            <ul class="dsh-watch">
              <li><span>Đơn chưa thanh toán</span><strong>${unpaid}</strong></li>
              <li><span>Đơn hủy / bị từ chối</span><strong>${cancelled}${all.length ? ` <small>${Math.round((cancelled / all.length) * 100)}% số đơn</small>` : ""}</strong></li>
              <li><span>Đơn hoàn hàng</span><strong>${returns}${refunded ? ` <small>đã hoàn ${formatPrice(refunded)}</small>` : ""}</strong></li>
              <li><span>Tài khoản mới đăng ký</span><strong>${newCustomers}</strong></li>
              <li><span>Sản phẩm sắp hết <small>(tồn ≤ 5, hiện tại)</small></span><strong class="${low.length ? "is-warn" : ""}">${low.length}</strong></li>
            </ul>
            ${low.length ? `<p class="dsh-note">${low.slice(0, 4).map((p) => `${escapeHTML(p.name)} (${p.stock <= 0 ? "hết" : "còn " + p.stock})`).join(" · ")}${low.length > 4 ? ` · +${low.length - 4}` : ""}</p>` : ""}
          </section>
        </div>
      </section>

      <!-- 4. Sản phẩm & khách hàng: biểu đồ cột so sánh giữa các mục, bảng xếp hạng chi tiết gập / mở được -->
      <section class="dsh-group" aria-label="Sản phẩm và khách hàng">
        ${group("Sản phẩm &amp; khách hàng", "so sánh giữa các mục trong kỳ")}
        <div class="dsh-plot">
          <header class="dsh-plot__head">
            <h4 id="dshCmpTitle"></h4>
            ${seg("cmp", view.cmp, [["cat", "Danh mục"], ["prod", "Sản phẩm"], ["cust", "Khách hàng"], ["quarter", "Các quý"]], "Chọn mục để so sánh")}
          </header>
          <div class="dsh-plot__box" id="dshCmpBox"><canvas id="dshCmp" aria-label="Biểu đồ cột so sánh giữa các mục"></canvas></div>
          <p class="dsh-empty" id="dshCmpEmpty" hidden></p>
          <p class="dsh-plot__note" id="dshCmpNote"></p>
        </div>

        <details class="dsh-more" id="dshMore"${view.open ? " open" : ""}>
          <summary><span>Bảng xếp hạng chi tiết</span><small>bán chạy nhất · doanh thu theo danh mục · khách mua nhiều nhất</small></summary>
          <div class="dsh-grid">
            <section class="dsh-block">
              <h4>Bán chạy nhất trong kỳ?</h4>
              ${top.length ? `<ol class="dsh-top">${top.map((x, i) => `
                <li>
                  <span class="dsh-top__rank">${i + 1}</span>
                  <span class="dsh-top__name">${escapeHTML(x.product?.name || x.name || "Sản phẩm #" + x.id)}</span>
                  <span class="dsh-top__val"><strong>${x.qty}</strong> chậu <small>${formatPrice(x.revenue)}</small></span>
                </li>`).join("")}</ol>` : `<p class="dsh-empty">Chưa bán được sản phẩm nào trong kỳ.</p>`}
            </section>

            <section class="dsh-block">
              <h4>Doanh thu đến từ danh mục nào?</h4>
              ${catList.length ? barList(catList.map(([name, v]) => ({ label: escapeHTML(name), value: v, display: formatPrice(v), extra: `${Math.round((v / catTotal) * 100)}% doanh thu của kỳ` }))) : `<p class="dsh-empty">Chưa có doanh thu trong kỳ.</p>`}
            </section>

            <section class="dsh-block">
              <h4>Ai mua nhiều nhất?</h4>
              ${topC.length ? `<ol class="dsh-top">${topC.map(([id, v], i) => `
                <li>
                  <span class="dsh-top__rank">${i + 1}</span>
                  <span class="dsh-top__name">${escapeHTML(nameOfUser(id))}</span>
                  <span class="dsh-top__val"><strong>${formatPrice(v.total)}</strong> <small>${v.orders} đơn</small></span>
                </li>`).join("")}</ol>` : `<p class="dsh-empty">Chưa có khách mua trong kỳ.</p>`}
            </section>
          </div>
        </details>
      </section>
      <p class="dsh-foot">Doanh thu và số lượng bán chỉ tính đơn đã thanh toán hoặc đã giao; không tính đơn hủy, hoàn hàng, hoàn tiền.</p>`;

    // Nút đang chọn của hai thanh "Đường / Cột" và "Danh mục / Sản phẩm / …" cũng trượt qua lại
    segMarkers = [...body.querySelectorAll("[data-seg]")].map((el) =>
      attachMarker(el, { item: "button", isActive: (b) => b.classList.contains("is-active"), key: "admin-" + el.dataset.seg }));

    const series = (list, bs) => bs.map((b) => sum(list.filter((o) => inRange(o.createdAt, b))));
    plot = { r, bk, unit, cur: series(sold, bk), prv: series(prevSold, buckets(r.prev)).slice(0, bk.length), compare };
    drawTrend();
    drawCompare();
    countUp(body); // số đếm tăng dần mỗi lần đổi kỳ
  }

  // ----- Biểu đồ xu hướng: đường (mặc định) hoặc cột "luống cây"; kỳ trước luôn là nét đứt -----
  function drawTrend() {
    trendChart?.destroy(); trendChart = null;
    const { r, bk, unit, cur, prv } = plot;
    const line = view.trend === "line";
    const toggleTip = "Bấm vào tên ở chú thích để ẩn / hiện từng đường.";
    body.querySelector("#dshTrendTitle").textContent = `Doanh thu theo ${unit}`;
    body.querySelector("#dshPlotNote").textContent = line
      ? `Mỗi điểm là một ${unit}. Đường liền: ${r.label}; đường nét đứt: ${r.prev.label}. ${toggleTip}`
      : `Mỗi cột là một ${unit}; cột có mầm là ${unit} có doanh thu. Đường nét đứt: ${r.prev.label}. ${toggleTip}`;
    if (typeof Chart === "undefined") return;
    trendChart = new Chart(body.querySelector("#dshTrend"), {
      type: line ? "line" : "bar",
      data: {
        labels: bk.map((b) => b.label),
        datasets: line
          ? [plotLine(r.label, cur, { points: bk.length <= 31 }), plotPrevLine(r.prev.label, prv)]
          : [plotBars(r.label, cur), plotPrevLine(r.prev.label, prv, { stepped: true })],
      },
      options: plotOptions({ legend: true, draw: bk.length }),
      plugins: line ? [] : [sproutPlugin],
    });
  }

  // ----- Biểu đồ cột so sánh giữa các mục (danh mục / sản phẩm / khách hàng / bốn quý của năm) -----
  function drawCompare() {
    cmpChart?.destroy(); cmpChart = null;
    const c = plot.compare[view.cmp];
    const box = body.querySelector("#dshCmpBox"), empty = body.querySelector("#dshCmpEmpty");
    const has = c.rows.some((x) => x.value > 0);
    body.querySelector("#dshCmpTitle").textContent = c.title;
    body.querySelector("#dshCmpNote").textContent = has ? (c.note || "Rê chuột lên từng cột để xem thêm chi tiết.") : "";
    box.hidden = !has;
    empty.hidden = has;
    empty.textContent = c.empty;
    if (!has || typeof Chart === "undefined") return;
    box.style.height = c.upright ? "" : `${Math.max(150, c.rows.length * 38 + 46)}px`;
    cmpChart = new Chart(body.querySelector("#dshCmp"), {
      type: "bar",
      data: {
        labels: c.rows.map((x) => x.label),
        datasets: [{
          label: c.title, data: c.rows.map((x) => x.value),
          backgroundColor: c.rows.map((x) => (x.on === false ? "#B9CDB9" : GREEN)),
          borderRadius: 3, maxBarThickness: c.upright ? 56 : 20,
        }],
      },
      options: rankOptions({
        upright: !!c.upright, count: c.rows.length,
        value: (v) => (c.money ? formatPrice(v) : `${v} ${c.unit}`),
        extra: (i) => c.rows[i]?.extra || "",
      }),
    });
  }

  const apply = (next) => { state = next; saveState(state); render(); };

  root.addEventListener("click", (e) => {
    const mode = e.target.closest("[data-mode]")?.dataset.mode;
    if (mode) {
      if (mode === "custom") {
        // Vào "Tự chọn": khởi đầu bằng đúng khoảng đang xem để người dùng chỉnh tiếp
        const r = resolveRange(state);
        apply(state.mode === "custom" ? state : { mode: "custom", from: ymd(r.from), to: ymd(new Date(r.to.getTime() - DAY)) });
      } else {
        const anchor = state.mode === "custom" ? state.from : state.anchor;
        apply({ mode, anchor: anchor || ymd(new Date()) });
      }
      return;
    }
    const sh = e.target.closest("[data-shift]");
    if (sh) { apply(shift(state, Number(sh.dataset.shift))); return; }
    if (e.target.closest("[data-now]")) { apply({ mode: state.mode, anchor: ymd(new Date()) }); return; }

    // Đổi kiểu biểu đồ xu hướng (đường / cột) hoặc mục đang so sánh: chỉ vẽ lại đúng biểu đồ đó
    const pick = e.target.closest("[data-trend], [data-cmp]");
    if (pick && plot) {
      const key = pick.dataset.trend ? "trend" : "cmp";
      view[key] = pick.dataset[key];
      saveView(view);
      pick.parentElement.querySelectorAll("button").forEach((b) => { b.classList.toggle("is-active", b === pick); b.setAttribute("aria-pressed", b === pick); });
      if (key === "trend") drawTrend(); else drawCompare();
    }
  });

  // Nhớ bảng xếp hạng chi tiết đang gập hay mở (sự kiện toggle không nổi bọt → bắt ở pha capture)
  root.addEventListener("toggle", (e) => {
    if (e.target.id !== "dshMore") return;
    view.open = e.target.open;
    saveView(view);
  }, true);

  custom.addEventListener("submit", (e) => {
    e.preventDefault();
    const from = parseYmd(custom.from.value), to = parseYmd(custom.to.value);
    const err = custom.querySelector(".dsh-custom__err");
    if (!from || !to) { err.textContent = "Chọn đủ ngày bắt đầu và kết thúc."; return; }
    if (from > to) { err.textContent = "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc."; return; }
    err.textContent = "";
    apply({ mode: "custom", from: ymd(startOfDay(from)), to: ymd(startOfDay(to)) });
  });

  render();
  // Cho nút xuất báo cáo biết khoảng đang chọn
  return { getRange: () => resolveRange(state), setData: (d) => { data = d; render(); } };
}
