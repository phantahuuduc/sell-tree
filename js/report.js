// ==========================================================
// report.js — Xuất báo cáo Excel/TXT + Nhập sản phẩm từ Excel.
// Dùng SheetJS (window.XLSX) được nạp từ CDN ở admin.html / staff.html.
// ==========================================================

import { getOrders, createProduct } from "./api.js";

function getXLSX() {
  const XLSX = window.XLSX;
  if (!XLSX) {
    console.error("SheetJS (XLSX) chưa được nạp — không thể xuất/nhập Excel.");
  }
  return XLSX;
}

/* ---- Lọc đơn hàng theo kỳ: day | week | month | quarter | year ---- */
export async function getOrdersInRange(period) {
  const orders = await getOrders();
  const now = new Date();
  let start, end;

  if (period === "day") {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    end = new Date(start); end.setDate(end.getDate() + 1);
  } else if (period === "week") {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay()); // về Chủ nhật đầu tuần
    end = new Date(start); end.setDate(end.getDate() + 7);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
    end = new Date(now.getFullYear(), q * 3 + 3, 1);
  } else if (period === "year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  } else {
    return orders;
  }

  return orders.filter((o) => {
    const d = new Date(o.createdAt);
    return d >= start && d < end;
  });
}

/* ---- Xuất Excel (.xlsx) — mỗi dòng là 1 sản phẩm trong đơn ---- */
export function exportToExcel(orders, filename) {
  const XLSX = getXLSX();
  if (!XLSX) { alert("Thư viện Excel chưa sẵn sàng. Vui lòng tải lại trang."); return; }
  if (!orders.length) { alert("Không có đơn hàng nào trong kỳ này."); return; }

  const rows = [];
  orders.forEach((o) => {
    (o.items || []).forEach((item) => {
      rows.push({
        "Mã đơn": o.id,
        "Ngày": new Date(o.createdAt).toLocaleString("vi-VN"),
        "Mã KH": o.userId,
        "Sản phẩm": item.name,
        "Số lượng": item.quantity,
        "Đơn giá": item.price,
        "Thành tiền": item.price * item.quantity,
        "Trạng thái": o.status,
        "Tổng đơn": o.total,
      });
    });
  });

  const totalAll = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  rows.push({});
  rows.push({ "Mã đơn": "TỔNG CỘNG", "Tổng đơn": totalAll });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Doanh thu");
  XLSX.writeFile(wb, filename);
}

/* ---- Xuất TXT (Blob + <a download>) ---- */
export function exportToTxt(orders, filename) {
  if (!orders.length) { alert("Không có đơn hàng nào trong kỳ này."); return; }

  let txt = `BÁO CÁO DOANH THU — LÁ & SỎI\n`;
  txt += `Xuất ngày: ${new Date().toLocaleString("vi-VN")}\n`;
  txt += `Số đơn: ${orders.length}\n`;
  txt += `${"=".repeat(70)}\n\n`;

  orders.forEach((o) => {
    txt += `Đơn #${o.id} — ${new Date(o.createdAt).toLocaleString("vi-VN")}\n`;
    txt += `Khách: ${o.userId} — Trạng thái: ${o.status}\n`;
    (o.items || []).forEach((item) => {
      txt += `  - ${item.name} x${item.quantity} @ ${Number(item.price).toLocaleString("vi-VN")}đ = ${(item.price * item.quantity).toLocaleString("vi-VN")}đ\n`;
    });
    txt += `  → Tổng: ${Number(o.total).toLocaleString("vi-VN")}đ\n`;
    txt += `${"-".repeat(70)}\n`;
  });

  const totalAll = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  txt += `\nTỔNG CỘNG: ${totalAll.toLocaleString("vi-VN")}đ\n`;

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---- Nhập sản phẩm từ file Excel (admin) ---- */
export async function importProductsFromExcel(file) {
  const XLSX = getXLSX();
  if (!XLSX) throw new Error("Thư viện Excel chưa sẵn sàng.");

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  let success = 0, errors = 0;
  for (const row of rows) {
    try {
      if (!row.name || !row.price) { errors++; continue; }
      await createProduct({
        name: String(row.name),
        scientificName: row.scientificName || "",
        price: Number(row.price),
        categoryId: String(row.categoryId || "1"),
        image: row.image || "assets/img/p1.jpg",
        stock: Number(row.stock ?? 10),
        description: row.description || "",
        difficulty: row.difficulty || "Dễ chăm",
      });
      success++;
    } catch {
      errors++;
    }
  }

  return { success, errors, total: rows.length };
}

/* ---- Tải file Excel mẫu để nhập sản phẩm ---- */
export function downloadProductTemplate() {
  const XLSX = getXLSX();
  if (!XLSX) { alert("Thư viện Excel chưa sẵn sàng. Vui lòng tải lại trang."); return; }

  const ws = XLSX.utils.json_to_sheet([
    {
      name: "Cây Mẫu",
      scientificName: "Tên khoa học",
      price: 100000,
      categoryId: "1",
      image: "assets/img/p1.jpg",
      stock: 10,
      description: "Mô tả ngắn về cây...",
      difficulty: "Dễ chăm",
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sản phẩm");
  XLSX.writeFile(wb, "Template_SanPham.xlsx");
}
