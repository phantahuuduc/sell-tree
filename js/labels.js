// ==========================================================
// labels.js — Nhãn sản phẩm quản lý được (thay cho nhãn viết cứng trước đây).
//
// Dữ liệu (db.json):
//   labelGroups : { id, name, description, selection: "single" | "multi", order }
//   labels      : { id, groupId, name, color, description, order, petSafe? }
//   products[].labelIds : mảng id nhãn đã gán
// Hai nhóm mặc định độc lập nhau: "Độ khó chăm sóc" (mỗi cây 1 mức) và "An toàn & lưu ý" (nhiều nhãn).
// Admin thêm / sửa / xóa / đổi tên / đổi màu ở trang quản trị → tab "Nhãn sản phẩm".
//
// Module này nạp nhãn một lần (có cache) và cung cấp hàm dựng chip nhãn cho thẻ sản phẩm, trang chi tiết…
// ==========================================================
import { getLabelGroups, getLabels } from "./api.js";

// Bảng màu cố định (admin chọn theo tên) — giữ giao diện đồng bộ, đủ tương phản chữ/nền.
export const LABEL_COLORS = {
  green: { name: "Xanh lá", bg: "#E1EDDD", fg: "#245230", dot: "#2F6B3C" },
  amber: { name: "Vàng hổ phách", bg: "#F6EBCB", fg: "#6B4E12", dot: "#B98A2E" },
  red: { name: "Đỏ đất", bg: "#F6DFD8", fg: "#8A2E1F", dot: "#B8442F" },
  blue: { name: "Xanh dương", bg: "#DDE8F1", fg: "#274A66", dot: "#4D7FA6" },
  purple: { name: "Tím", bg: "#E8E1F1", fg: "#4B3470", dot: "#7A5BA8" },
  gray: { name: "Xám", bg: "#E9E7E0", fg: "#4A4F47", dot: "#7C8278" },
};
export const colorOf = (key) => LABEL_COLORS[key] || LABEL_COLORS.gray;

let cache = null;      // { groups, labels }
let loading = null;

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), "vi");

export async function ensureLabels(force = false) {
  if (cache && !force) return cache;
  if (!loading || force) {
    loading = Promise.all([getLabelGroups(), getLabels()])
      .then(([groups, labels]) => {
        cache = { groups: (groups || []).slice().sort(byOrder), labels: (labels || []).slice().sort(byOrder) };
        return cache;
      })
      .catch(() => {
        // Máy chủ chưa có 2 bảng nhãn (chưa chạy tools/migrate-labels.py) → coi như không có nhãn; giao diện dùng dữ liệu cũ
        cache = { groups: [], labels: [] };
        return cache;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

export const getLabelCache = () => cache || { groups: [], labels: [] };

// Nhãn của 1 sản phẩm, xếp theo thứ tự nhóm rồi thứ tự nhãn. groupId: chỉ lấy 1 nhóm.
// Chưa nạp được bảng nhãn / sản phẩm chưa gán labelIds → suy ra từ trường cũ (difficulty, petSafe) để không mất thông tin.
export function productLabels(product, { groupId = null } = {}) {
  const { groups, labels } = getLabelCache();
  if (!product) return [];
  if (labels.length && Array.isArray(product.labelIds)) {
    const ids = product.labelIds.map(String);
    const groupOrder = new Map(groups.map((g, i) => [String(g.id), i]));
    return labels
      .filter((l) => ids.includes(String(l.id)) && (!groupId || String(l.groupId) === String(groupId)))
      .sort((a, b) => (groupOrder.get(String(a.groupId)) ?? 99) - (groupOrder.get(String(b.groupId)) ?? 99) || byOrder(a, b));
  }
  const legacy = [];
  if (product.difficulty && (!groupId || groupId === "care")) {
    legacy.push({ id: "legacy-care", groupId: "care", name: product.difficulty, color: product.difficulty === "Cần chú ý" ? "red" : product.difficulty === "Trung bình" ? "amber" : "green" });
  }
  if (!groupId || groupId === "safety") {
    if (product.petSafe === true) legacy.push({ id: "legacy-safe", groupId: "safety", name: "An toàn với thú cưng", color: "green" });
    else if (product.petSafe === false) legacy.push({ id: "legacy-keep", groupId: "safety", name: "Để xa thú cưng", color: "amber" });
  }
  return legacy;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function labelChip(label) {
  const c = colorOf(label.color);
  return `<span class="label-chip" style="--lb-bg:${c.bg};--lb-fg:${c.fg};--lb-dot:${c.dot}"${label.description ? ` title="${esc(label.description)}"` : ""}>${esc(label.name)}</span>`;
}

// Chuỗi chip của 1 sản phẩm. limit: số chip tối đa (thẻ sản phẩm chỉ đủ chỗ cho 1–2 chip).
export function labelChipsHtml(product, { groupId = null, limit = Infinity } = {}) {
  return productLabels(product, { groupId }).slice(0, limit).map(labelChip).join("");
}

// Sản phẩm có "an toàn với thú cưng" không — theo nhãn được admin đánh dấu petSafe (dùng khi lưu sản phẩm).
export function isPetSafeByLabels(labelIds) {
  const ids = (labelIds || []).map(String);
  return getLabelCache().labels.some((l) => l.petSafe === true && ids.includes(String(l.id)));
}
