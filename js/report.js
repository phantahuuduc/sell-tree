// ==========================================================
// report.js — Xuất báo cáo Excel/TXT + Nhập sản phẩm từ Excel.
// Dùng SheetJS (window.XLSX) được nạp từ CDN ở admin.html / staff.html.
// ==========================================================

import { getOrders, createProduct } from "./api.js";
import { isCompletedSale, revenueOf, excludedFromRevenue, profitOf, lineCost } from "./sale.js";

// Doanh thu trong báo cáo dùng CHUNG hàm với bảng thống kê (sale.js: isCompletedSale / revenueOf)
// → số trong file xuất luôn khớp số trên dashboard. Trả null (đã báo người dùng) khi không có gì để xuất.
function splitForReport(orders, products) {
  if (!orders.length) { alert("Không có đơn hàng nào trong kỳ này."); return null; }
  const sold = orders.filter(isCompletedSale);
  const ex = excludedFromRevenue(orders);
  if (!sold.length) {
    alert(`Kỳ này chưa có đơn nào tính vào doanh thu.\n(${orders.length} đơn trong kỳ đều không tính: ${excludedNote(ex)})`);
    return null;
  }
  const pf = products ? profitOf(orders, products) : null;
  return { sold, ex, total: revenueOf(orders), all: orders.length, pf, products };
}
const excludedNote = (ex) => `${ex.cancelled} đã hủy · ${ex.refunded} đã hoàn hàng / hoàn tiền · ${ex.unpaid} chưa thanh toán / chờ xử lý`;

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
// Chỉ liệt kê đơn TÍNH DOANH THU (cùng luật với bảng thống kê), cuối file ghi tổng + số đơn không tính.
export function exportToExcel(orders, filename, products) {
  const XLSX = getXLSX();
  if (!XLSX) { alert("Thư viện Excel chưa sẵn sàng. Vui lòng tải lại trang."); return; }
  const rep = splitForReport(orders, products);
  if (!rep) return;

  const hasCost = !!rep.products;
  const byId = hasCost ? new Map(rep.products.map((p) => [String(p.id), p])) : null;
  const rows = [];
  rep.sold.forEach((o) => {
    (o.items || []).forEach((item) => {
      const row = {
        "Mã đơn": o.id,
        "Ngày": new Date(o.createdAt).toLocaleString("vi-VN"),
        "Mã KH": o.userId,
        "Sản phẩm": item.name,
        "Số lượng": item.quantity,
        "Đơn giá": item.price,
        "Thành tiền": item.price * item.quantity,
      };
      if (hasCost) {
        const c = lineCost(item, byId);
        row["Giá vốn đơn vị"] = c.unit;
        row["Tổng giá vốn"] = c.cost;
        row["Lợi nhuận dòng"] = item.price * item.quantity - c.cost;
        if (c.estimated) row["Ghi chú"] = "ước tính";
        else if (c.missing) row["Ghi chú"] = "chưa có giá vốn";
      }
      row["Trạng thái"] = o.status;
      row["Tổng đơn"] = o.total;
      rows.push(row);
    });
  });

  rows.push({});
  rows.push({ "Mã đơn": "TỔNG DOANH THU", "Sản phẩm": `${rep.sold.length} đơn tính doanh thu`, "Tổng đơn": rep.total });
  if (rep.pf) rows.push({ "Mã đơn": "LỢI NHUẬN GỘP", "Sản phẩm": `Biên ${Math.round(rep.pf.margin)}%${rep.pf.estimatedOrders ? ` (${rep.pf.estimatedOrders} đơn ước tính)` : ""}`, "Tổng đơn": rep.pf.profit });
  rows.push({ "Mã đơn": "Không tính", "Sản phẩm": `${rep.all - rep.sold.length} / ${rep.all} đơn trong kỳ: ${excludedNote(rep.ex)}` });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, ...(hasCost ? [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }] : []), { wch: 12 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Doanh thu");
  XLSX.writeFile(wb, filename);
}

/* ---- Xuất TXT (Blob + <a download>) ---- */
export function exportToTxt(orders, filename, products) {
  const rep = splitForReport(orders, products);
  if (!rep) return;

  const hasCost = !!rep.products;
  const byId = hasCost ? new Map(rep.products.map((p) => [String(p.id), p])) : null;
  let txt = `BÁO CÁO DOANH THU${hasCost ? " & LỢI NHUẬN" : ""} — LÁ & SỎI\n`;
  txt += `Xuất ngày: ${new Date().toLocaleString("vi-VN")}\n`;
  txt += `Số đơn tính doanh thu: ${rep.sold.length} / ${rep.all} đơn trong kỳ\n`;
  txt += `Không tính: ${excludedNote(rep.ex)}\n`;
  txt += `(Doanh thu = đơn đã thanh toán hoặc đã giao, không bị hủy / hoàn — cùng cách tính với bảng thống kê)\n`;
  txt += `${"=".repeat(70)}\n\n`;

  rep.sold.forEach((o) => {
    txt += `Đơn #${o.id} — ${new Date(o.createdAt).toLocaleString("vi-VN")}\n`;
    txt += `Khách: ${o.userId} — Trạng thái: ${o.status}\n`;
    (o.items || []).forEach((item) => {
      const line = `  - ${item.name} x${item.quantity} @ ${Number(item.price).toLocaleString("vi-VN")}đ = ${(item.price * item.quantity).toLocaleString("vi-VN")}đ`;
      if (hasCost) {
        const c = lineCost(item, byId);
        txt += `${line} | vốn ${c.unit.toLocaleString("vi-VN")}đ → lãi ${((item.price * item.quantity) - c.cost).toLocaleString("vi-VN")}đ${c.estimated ? " (ước tính)" : ""}${c.missing ? " (chưa có giá vốn)" : ""}\n`;
      } else {
        txt += `${line}\n`;
      }
    });
    txt += `  → Tổng: ${Number(o.total).toLocaleString("vi-VN")}đ\n`;
    txt += `${"-".repeat(70)}\n`;
  });

  txt += `\nTỔNG DOANH THU: ${rep.total.toLocaleString("vi-VN")}đ\n`;
  if (rep.pf) {
    txt += `LỢI NHUẬN GỘP: ${rep.pf.profit.toLocaleString("vi-VN")}đ (biên ${Math.round(rep.pf.margin)}%)\n`;
    if (rep.pf.estimatedOrders) txt += `⚠ ${rep.pf.estimatedOrders} đơn dùng giá vốn ước tính\n`;
    if (rep.pf.missingLines) txt += `⚠ ${rep.pf.missingLines} dòng hàng không có giá vốn\n`;
  }

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
