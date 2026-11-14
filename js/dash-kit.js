// ==========================================================
// dash-kit.js — Mảnh ghép dùng chung cho trang tổng quan của Quản trị và Nhân viên,
// theo kiểu "sổ tay vườn ươm": ô số liệu của phiếu báo cáo + biểu đồ cột "luống cây".
// ==========================================================
import { formatPrice } from "./ui.js";

export const GREEN = "#2F6B3C";

// Một ô của phiếu số liệu: mã số · tên · giá trị · ghi chú so sánh (chữ thường, không dùng huy hiệu)
// vs = { text, tone: "up" | "down" | "flat" }
// opt.lead  = ô chính của phiếu (đứng riêng một hàng, chữ số lớn hơn)
// opt.count = { to, money } → con số đếm tăng dần từ 0 khi gọi countUp()
export function slipCell(no, name, value, vs, unit = "", opt = {}) {
  const num = opt.count && Number(opt.count.to) > 0
    ? `<span data-count="${Number(opt.count.to)}"${opt.count.money ? " data-money" : ""}>${value}</span>`
    : value;
  return `
    <div class="slip__cell${opt.lead ? " slip__cell--lead" : ""}">
      <span class="slip__code">No. ${String(no).padStart(2, "0")}</span>
      <span class="slip__name">${name}</span>
      <strong class="slip__num">${num}${unit ? ` <small>${unit}</small>` : ""}</strong>
      ${vs ? `<span class="slip__vs is-${vs.tone}">${vs.text}</span>` : ""}
    </div>`;
}

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Số đếm tăng dần: mọi phần tử [data-count] trong root chạy từ 0 tới giá trị thật trong ~0,6 giây.
// Chữ ban đầu đã là giá trị thật, nên nếu trình duyệt ngừng vẽ giữa chừng thì hẹn giờ vẫn chốt lại đúng số.
export function countUp(root, duration = 600) {
  if (calm()) return;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count), final = el.textContent;
    const show = (v) => { el.textContent = "money" in el.dataset ? formatPrice(v) : String(v); };
    const start = performance.now();
    let done = false;
    const finish = () => { done = true; el.textContent = final; };
    const step = (now) => {
      if (done || !el.isConnected) return;
      const t = Math.min((now - start) / duration, 1);
      if (t >= 1) { finish(); return; }
      show(Math.round(to * (1 - Math.pow(1 - t, 3))));
      requestAnimationFrame(step);
    };
    show(0);
    requestAnimationFrame(step);
    setTimeout(() => { if (!done) finish(); }, duration + 250);
  });
}

// Mầm cây mọc trên đầu mỗi cột có doanh thu (vẽ thẳng lên canvas của Chart.js)
export const sproutPlugin = {
  id: "sprout",
  afterDatasetsDraw(chart) {
    const index = chart.data.datasets.findIndex((d) => d.sprout);
    if (index < 0 || !chart.isDatasetVisible(index)) return; // cột đang bị ẩn qua chú thích thì không vẽ mầm
    const meta = chart.getDatasetMeta(index);
    const values = chart.data.datasets[index].data;
    const ctx = chart.ctx;
    meta.data.forEach((bar, i) => {
      const w = bar.width || 0;
      if (!(values[i] > 0) || w < 5) return;
      const s = Math.min(7, Math.max(3.5, w * 0.45));
      ctx.save();
      ctx.strokeStyle = GREEN; ctx.fillStyle = "#6E9E78"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(bar.x, bar.y); ctx.lineTo(bar.x, bar.y - s); ctx.stroke();
      [-1, 1].forEach((d) => {
        ctx.beginPath();
        ctx.ellipse(bar.x + d * s * 0.55, bar.y - s * 1.15, s * 0.6, s * 0.3, d * -0.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    });
  },
};

const short = (v) => (v >= 1e6 ? `${v / 1e6}tr` : v >= 1e3 ? `${v / 1e3}k` : v);

// Cấu hình chung của biểu đồ "luống": cột mọc từ mặt đất (đường nét đứt), trục gọn
// draw = số mốc trên trục ngang → biểu đồ "vẽ dần" từ trái sang phải khi mở (bỏ qua nếu máy bật giảm chuyển động)
const drawIn = (count) => (calm() ? false : {
  duration: 520, easing: "easeOutCubic",
  delay: (c) => (c.type === "data" && c.mode === "default" ? c.dataIndex * Math.min(40, 600 / Math.max(1, count)) : 0),
});

export function plotOptions({ legend = false, maxTicks = 10, draw = 0 } = {}) {
  return {
    ...(draw ? { animation: drawIn(draw) } : {}),
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    layout: { padding: { top: 18 } }, // chừa chỗ cho mầm cây
    plugins: {
      legend: legend ? { position: "bottom", align: "end", labels: { boxWidth: 14, boxHeight: 8, font: { size: 11 } } } : { display: false },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatPrice(c.raw)}` } },
    },
    scales: {
      x: { grid: { display: false }, border: { dash: [4, 4], color: "rgba(28,42,30,.35)" }, ticks: { maxTicksLimit: maxTicks, font: { size: 11 } } },
      y: { beginAtZero: true, border: { display: false }, grid: { color: "rgba(28,42,30,.06)" }, ticks: { maxTicksLimit: 5, font: { size: 11 }, callback: short } },
    },
  };
}

// Bộ dữ liệu cột "luống cây"
export const plotBars = (label, data) => ({
  type: "bar", label, data, sprout: true, order: 2,
  backgroundColor: GREEN, borderRadius: { topLeft: 3, topRight: 3 }, maxBarThickness: 34, categoryPercentage: 0.8,
});

// Đường xu hướng của kỳ đang xem: nét liền, tô nhạt phía dưới
export const plotLine = (label, data, { points = true } = {}) => ({
  type: "line", label, data, order: 2,
  borderColor: GREEN, borderWidth: 2, backgroundColor: "rgba(47, 107, 60, .09)", fill: true,
  cubicInterpolationMode: "monotone", // cong mềm nhưng không vọt quá giá trị thật
  pointRadius: points ? 2.5 : 0, pointHoverRadius: 5, pointBackgroundColor: "#fff", pointBorderColor: GREEN, pointBorderWidth: 1.5,
});

// Đường của kỳ trước: nét đứt, xám; stepped = dạng bậc thang (đi kèm biểu đồ cột)
export const plotPrevLine = (label, data, { stepped = false } = {}) => ({
  type: "line", label, data, order: 1,
  borderColor: "#9AA596", borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, fill: false,
  ...(stepped ? { stepped: "middle" } : { cubicInterpolationMode: "monotone" }),
});

// Cấu hình biểu đồ cột so sánh giữa các mục. upright = cột đứng (vd bốn quý); mặc định cột nằm ngang để đọc được tên dài.
// value(v) → chữ hiển thị của giá trị; extra(i) → dòng phụ trong tooltip của mục thứ i
export function rankOptions({ upright = false, count = 1, value = formatPrice, extra = () => "" } = {}) {
  const names = { grid: { display: false }, border: { color: "rgba(28,42,30,.35)" }, ticks: { font: { size: 11.5 }, autoSkip: false,
    callback(v) { const t = String(this.getLabelForValue(v)); return !upright && t.length > 24 ? t.slice(0, 23) + "…" : t; } } };
  const nums = { beginAtZero: true, border: { display: false }, grid: { color: "rgba(28,42,30,.06)" }, ticks: { maxTicksLimit: 5, precision: 0, font: { size: 11 }, callback: short } };
  return {
    animation: drawIn(count),
    indexAxis: upright ? "x" : "y",
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => value(c.raw), afterLabel: (c) => extra(c.dataIndex) } },
    },
    scales: upright ? { x: names, y: nums } : { x: nums, y: names },
  };
}
