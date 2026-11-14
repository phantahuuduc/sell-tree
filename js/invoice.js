// ==========================================================
// invoice.js — Xuất hóa đơn dạng PDF thật (tải trực tiếp .pdf).
// Dùng jsPDF (window.jspdf) + jsPDF-AutoTable để vẽ bảng.
// Tiếng Việt: thử nạp font Noto Sans Vietnamese từ CDN; nếu
// lỗi (CORS/offline) thì tự động bỏ dấu để file vẫn mở được.
// ==========================================================

import { formatPrice } from "./ui.js";
import { getSettings } from "./api.js";

function formatDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function padId(id) { return String(id).padStart(4, "0"); }

// Giá trị mặc định — sẽ ghi đè bởi settings từ API nếu có
let FREE_SHIP = 300000;
let SHIP_FEE  = 30000;
function calcShipping(subtotal) { return subtotal >= FREE_SHIP ? 0 : SHIP_FEE; }

// Loại bỏ dấu tiếng Việt (fallback khi font Unicode không nạp được)
function removeAccents(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

// Nạp font Noto Sans Vietnamese từ CDN jsdelivr, cache lại ở module.
// Trả về true nếu thành công, false nếu phải fallback helvetica.
let _fontBase64 = null;
async function ensureVnFont(doc) {
  const FONT_NAME = "NotoSans";
  if (_fontBase64) {
    doc.addFileToVFS(`${FONT_NAME}.ttf`, _fontBase64);
    doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, "normal");
    return FONT_NAME;
  }
  const urls = [
    "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf",
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      _fontBase64 = btoa(bin);
      doc.addFileToVFS(`${FONT_NAME}.ttf`, _fontBase64);
      doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, "normal");
      return FONT_NAME;
    } catch (err) {
      console.warn("Font fetch failed:", url, err?.message);
    }
  }
  return null; // fallback helvetica + no-accents
}

export async function generateInvoicePDF(order, user) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("Thư viện jsPDF chưa được tải. Vui lòng reload trang.");
  }

  // Nạp settings từ API (dùng cho header + phí ship)
  let settings = window.__siteSettings || null;
  if (!settings) {
    try { settings = await getSettings(); } catch {}
  }
  const shop = {
    name: settings?.shopName || "Lá & Sỏi",
    tagline: settings?.tagline || "Tiệm Cây Cảnh & Sen Đá",
    address: settings?.address || "86 Nguyễn Văn Thủ, P. Đa Kao, Q.1, TP.HCM",
    phone: settings?.phone || "0908 123 456",
    email: settings?.email || "trogiup@lasoi.vn",
  };
  if (settings?.freeShipThreshold != null) FREE_SHIP = Number(settings.freeShipThreshold);
  if (settings?.shipFee != null) SHIP_FEE = Number(settings.shipFee);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Nạp font Unicode cho tiếng Việt (có thể fallback)
  const vnFont = await ensureVnFont(doc);
  const fontName = vnFont || "helvetica";
  const t = vnFont ? (s) => String(s || "") : (s) => removeAccents(s);

  const PAGE_W = 210;
  const MARGIN = 15;
  const RIGHT  = PAGE_W - MARGIN;
  const COL_1  = MARGIN;
  const CENTER = PAGE_W / 2;

  // ----- Header -----
  doc.setFont(fontName, "normal");
  doc.setFontSize(22);
  doc.setTextColor(46, 94, 58);
  doc.text(t(shop.name), CENTER, 20, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(t(`${shop.tagline} — ${shop.address}`), CENTER, 27, { align: "center" });
  doc.text(t(`ĐT / Zalo: ${shop.phone} · Email: ${shop.email}`), CENTER, 32, { align: "center" });

  doc.setDrawColor(46, 94, 58);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 36, RIGHT, 36);

  // ----- Title -----
  doc.setFontSize(16);
  doc.setTextColor(25, 36, 28);
  doc.text(t("HÓA ĐƠN MUA HÀNG"), CENTER, 46, { align: "center" });

  // ----- Thông tin đơn -----
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(t("Mã đơn hàng:"), COL_1, 56);
  doc.text(t(`#LS-${padId(order.id)}`), COL_1 + 32, 56);

  doc.text(t("Ngày đặt:"), 115, 56);
  doc.text(t(formatDate(order.createdAt)), 140, 56);

  doc.text(t("Khách hàng:"), COL_1, 62);
  const customer = `${user?.name || "Khách lẻ"}${user?.email ? " (" + user.email + ")" : ""}`;
  doc.text(t(customer), COL_1 + 32, 62);

  if (order.status) {
    const STATUS_LABEL = {
      pending: "Chờ xác nhận",
      confirmed: "Đã thanh toán",
      shipping: "Đang giao",
      delivered: "Đã giao",
      delivery_issue: "Đang xác minh giao hàng",
      completed: "Hoàn tất",
      cancelled: order.refundStatus === "refunded" ? "Đã hủy — đã hoàn tiền" : "Đã hủy",
      return_requested: "Yêu cầu hoàn hàng",
      return_approved: "Đang hoàn hàng",
      returned: order.refundStatus === "refunded" ? "Đã hoàn hàng — đã hoàn tiền" : "Đã hoàn hàng",
    };
    doc.text(t("Trạng thái:"), 115, 62);
    // Màu xanh cho "Đã thanh toán" / đỏ cho "Đã hủy" / mặc định đen
    if (["confirmed", "delivered", "completed"].includes(order.status)) {
      doc.setTextColor(46, 94, 58);
    } else if (["cancelled", "returned"].includes(order.status)) {
      doc.setTextColor(179, 58, 58);
    }
    doc.text(t(STATUS_LABEL[order.status] || order.status), 140, 62);
    doc.setTextColor(0);
  }

  // ----- Giao đến (đơn đặt từ khi giỏ hàng có ô địa chỉ; đơn cũ không có thì bỏ qua) -----
  let tableY = 70;
  if (order.shipping && order.shipping.address) {
    const s = order.shipping;
    doc.text(t("Giao đến:"), COL_1, 68);
    const lines = doc.splitTextToSize(t(`${s.name || ""} · ${s.phone || ""} — ${s.address}`), RIGHT - (COL_1 + 32));
    doc.text(lines, COL_1 + 32, 68);
    tableY = 68 + lines.length * 5 + 3;
  }

  // ----- Bảng sản phẩm (autoTable) -----
  // Hóa đơn phải khớp số tiền khách ĐÃ trả → dùng số liệu lưu trong đơn, không tự tính lại.
  // Đơn mới lưu shippingFee; đơn cũ suy ra từ total (total = tạm tính + ship − giảm giá).
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = Number(order.discount) || 0;
  const shipping = order.shippingFee != null
    ? Number(order.shippingFee) || 0
    : order.total != null
      ? Math.max(0, Number(order.total) - subtotal + discount)
      : calcShipping(subtotal);
  const grandTotal = order.total != null ? Number(order.total) : Math.max(0, subtotal + shipping - discount);

  const body = order.items.map((item, idx) => [
    String(idx + 1),
    t(item.name),
    String(item.quantity),
    formatPrice(item.price),
    formatPrice(item.price * item.quantity),
  ]);

  doc.autoTable({
    head: [[t("STT"), t("Sản phẩm"), t("SL"), t("Đơn giá"), t("Thành tiền")]],
    body,
    startY: tableY,
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: fontName, fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [46, 94, 58], textColor: 255, halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { halign: "left" },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
  });

  // ----- Tóm tắt -----
  let y = doc.lastAutoTable.finalY + 8;
  const labelX = 125;
  const valX = RIGHT;

  doc.setFontSize(10);
  doc.text(t("Tạm tính:"), labelX, y);
  doc.text(formatPrice(subtotal), valX, y, { align: "right" });
  y += 6;

  doc.text(t("Phí giao hàng:"), labelX, y);
  if (shipping === 0) {
    doc.setTextColor(46, 94, 58);
    doc.text(t("Miễn phí"), valX, y, { align: "right" });
    doc.setTextColor(0);
  } else {
    doc.text(formatPrice(shipping), valX, y, { align: "right" });
  }
  y += 6;

  if (discount > 0) {
    doc.setTextColor(179, 58, 58);
    doc.text(t(`Giảm giá${order.couponCode ? " (" + order.couponCode + ")" : ""}:`), labelX, y);
    doc.text(`-${formatPrice(discount)}`, valX, y, { align: "right" });
    doc.setTextColor(0);
    y += 6;
  }

  doc.setLineWidth(0.4);
  doc.line(labelX, y, valX, y);
  y += 6;

  doc.setFontSize(13);
  doc.setFont(fontName, "normal");
  doc.setTextColor(179, 58, 58);
  doc.text(t("TỔNG CỘNG:"), labelX, y);
  doc.text(formatPrice(grandTotal), valX, y, { align: "right" });

  if (shipping === 0 && subtotal >= FREE_SHIP) {
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(46, 94, 58);
    doc.text(t(`✓ Miễn phí giao hàng cho đơn từ ${formatPrice(FREE_SHIP)}`), valX, y, { align: "right" });
  }

  // ----- Footer -----
  const FOOTER_Y = 280;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, FOOTER_Y - 4, RIGHT, FOOTER_Y - 4);

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(t(`Cảm ơn bạn đã mua hàng tại ${shop.name}!`), CENTER, FOOTER_Y, { align: "center" });
  doc.text(t(`Mọi thắc mắc liên hệ Zalo ${shop.phone} — Email ${shop.email}`), CENTER, FOOTER_Y + 5, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(t(`Hóa đơn được tạo lúc ${formatDate()} · © ${shop.name} ${new Date().getFullYear()}`), CENTER, FOOTER_Y + 11, { align: "center" });

  // ----- Lưu file (trigger download .pdf trực tiếp) -----
  const fileName = `HoaDon-LS-${padId(order.id)}.pdf`;
  doc.save(fileName);
  return fileName;
}
