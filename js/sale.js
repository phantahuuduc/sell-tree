// ==========================================================
// sale.js — Logic khuyến mãi, countdown, coupon, new-user discount
// Mọi nhãn "mới về", "nổi bật", "đang sale" đều dựa trên dữ liệu THỰC
// ==========================================================

// Danh sách ngày lễ (MM-DD) — fallback khi API không gọi được
const DEFAULT_HOLIDAYS = [
  { date: "01-01", name: "Tết Dương Lịch" },
  { date: "02-14", name: "Valentine" },
  { date: "03-08", name: "Quốc Tế Phụ Nữ" },
  { date: "04-30", name: "Ngày Giải Phóng" },
  { date: "05-01", name: "Quốc Tế Lao Động" },
  { date: "06-01", name: "Quốc Tế Thiếu Nhi" },
  { date: "10-20", name: "Phụ Nữ Việt Nam" },
  { date: "11-20", name: "Nhà Giáo Việt Nam" },
  { date: "12-24", name: "Giáng Sinh" },
  { date: "12-25", name: "Giáng Sinh" },
];

// Cache holidays từ API — lazy load bởi checkHoliday()
let _holidaysCache = null;

export async function checkHoliday() {
  if (!_holidaysCache) {
    try {
      const { getHolidays } = await import("./api.js");
      const list = await getHolidays();
      _holidaysCache = Array.isArray(list) && list.length ? list : DEFAULT_HOLIDAYS;
    } catch {
      _holidaysCache = DEFAULT_HOLIDAYS;
    }
  }
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, "0") + "-" +
               String(now.getDate()).padStart(2, "0");
  const found = _holidaysCache.find((h) => h.date === mmdd);
  return { isHoliday: !!found, name: found?.name || null };
}

export function getActivePromotions(promotions, now = new Date()) {
  return (promotions || []).filter((p) => {
    if (!p.isActive) return false;
    const start = new Date(p.startDate);
    const end = new Date(p.endDate);
    return now >= start && now <= end;
  });
}

// ===== Giá bán thực tế theo khuyến mãi đang chạy =====
// Cache khuyến mãi đang chạy để renderProductCard (đồng bộ) dùng được.
let _activePromos = [];
let _promosFetchedAt = 0;

export function setActivePromotions(promotions) {
  _activePromos = getActivePromotions(promotions);
  _promosFetchedAt = Date.now();
}

// Tải khuyến mãi từ server (cache 60s). force=true khi cần giá chắc chắn mới nhất (lúc đặt hàng).
export async function ensurePromotions(force = false) {
  if (!force && _promosFetchedAt && Date.now() - _promosFetchedAt < 60000) return _activePromos;
  try {
    const { getPromotions } = await import("./api.js");
    setActivePromotions(await getPromotions());
  } catch {
    _promosFetchedAt = Date.now();
  }
  return _activePromos;
}

// appliesTo: "all" | "category:<id>"
function promoApplies(promo, product) {
  const scope = promo.appliesTo || "all";
  if (scope === "all") return true;
  if (scope.startsWith("category:")) return String(product.categoryId) === scope.slice(9);
  return false;
}

export function bestPromotionFor(product, promos = _activePromos) {
  return (promos || [])
    .filter((p) => promoApplies(p, product))
    .sort((a, b) => (b.discountPercent || 0) - (a.discountPercent || 0))[0] || null;
}

// basePrice: giá niêm yết của sản phẩm hoặc của biến thể (size) đang chọn.
// Trả về { price, original, percent, promo } — original = giá gạch ngang (null nếu không giảm).
export function getPriceInfo(product, basePrice = product.price) {
  const base = Number(basePrice) || 0;
  const promo = bestPromotionFor(product);
  // oldPrice là "giá trước giảm" admin tự đặt cho giá niêm yết chính (không áp cho biến thể khác giá)
  const listOld = Number(base) === Number(product.price) && Number(product.oldPrice) > base ? Number(product.oldPrice) : null;
  const price = promo ? Math.round(base * (1 - promo.discountPercent / 100)) : base;
  const original = listOld || (promo ? base : null);
  const percent = original ? Math.round((1 - price / original) * 100) : 0;
  return { price, original, percent, promo };
}

export function getCountdown(endDateStr) {
  const now = new Date();
  const end = new Date(endDateStr);
  const diff = end - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  };
}

export function isNewUser(user) {
  if (!user || !user.createdAt) return false;
  const created = new Date(user.createdAt);
  const now = new Date();
  const diffDays = (now - created) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
}

export function validateCoupon(coupon, orderTotal, user) {
  if (!coupon || coupon.deletedAt) {
    return { valid: false, discount: 0, message: "Mã giảm giá không tồn tại." };
  }
  if (!coupon.isActive) {
    return { valid: false, discount: 0, message: "Mã giảm giá đang tạm ngưng." };
  }
  const now = new Date();
  if (coupon.startDate && new Date(coupon.startDate) > now) {
    const from = new Date(coupon.startDate).toLocaleDateString("vi-VN");
    return { valid: false, discount: 0, message: `Mã giảm giá chỉ áp dụng từ ngày ${from}.` };
  }
  if (coupon.expiryDate && new Date(coupon.expiryDate) < now) {
    return { valid: false, discount: 0, message: "Mã giảm giá đã hết hạn." };
  }
  if ((coupon.usageLimit || 0) > 0 && (coupon.usedCount || 0) >= coupon.usageLimit) {
    return { valid: false, discount: 0, message: "Mã giảm giá đã hết lượt sử dụng." };
  }
  if (orderTotal < coupon.minOrder) {
    const min = coupon.minOrder.toLocaleString("vi-VN");
    return { valid: false, discount: 0, message: `Đơn hàng tối thiểu ${min}₫ để dùng mã này.` };
  }
  if (coupon.requireNewUser && !isNewUser(user)) {
    return { valid: false, discount: 0, message: "Mã này chỉ dành cho tài khoản mới (đăng ký trong vòng 1 tháng)." };
  }

  let discount = Math.round(orderTotal * coupon.discountPercent / 100);
  let capped = false;
  if (coupon.maxDiscount && discount > coupon.maxDiscount) {
    discount = coupon.maxDiscount;
    capped = true;
  }
  const capNote = capped
    ? ` (đã đạt mức tối đa ${coupon.maxDiscount.toLocaleString("vi-VN")}₫)`
    : "";
  return {
    valid: true,
    discount,
    capped,
    message: `Giảm ${discount.toLocaleString("vi-VN")}₫${capNote}`,
  };
}

export function getNewArrivals(products, days = 30) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return (products || [])
    .filter((p) => p.addedDate && new Date(p.addedDate) >= cutoff)
    .sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
}

// "Loài cây" = sản phẩm KHÔNG thuộc danh mục phụ kiện (chậu, giá thể, phụ kiện, dụng cụ).
// Dùng chung cho số loài trên hero, chatbot… để admin thêm/xóa cây là số tự đổi.
const ACCESSORY_CAT = /chậu|giá thể|phụ kiện|dụng cụ|phân bón/i;
export function isPlant(product, categories = []) {
  const cat = categories.find((c) => String(c.id) === String(product?.categoryId));
  if (cat) return !ACCESSORY_CAT.test(cat.name || "");
  return !!product?.scientificName;
}

// Đơn được tính là "đã bán" (tính doanh thu / số lượng bán): đã thanh toán hoặc đã giao, không bị hủy.
// Đơn chờ xác nhận chưa trả tiền KHÔNG phải doanh số.
export function isCompletedSale(order) {
  if (!order) return false;
  // Đơn đã hủy / đã hoàn hàng / đã hoàn tiền không còn là doanh thu
  if (order.status === "cancelled" || order.status === "returned" || order.refundStatus === "refunded") return false;
  return order.paymentStatus === "paid" || order.status === "delivered" || order.status === "completed";
}

// Doanh thu của một danh sách đơn — NGUỒN DUY NHẤT cho dashboard, ô "Doanh thu" và file báo cáo Excel/TXT,
// để mọi nơi luôn ra cùng một con số. Chỉ cộng đơn isCompletedSale.
export function revenueOf(orders) {
  return (orders || []).filter(isCompletedSale).reduce((s, o) => s + (Number(o.total) || 0), 0);
}

// Phân loại đơn KHÔNG tính doanh thu (để báo cáo giải thích vì sao tổng là con số đó).
export function excludedFromRevenue(orders) {
  const out = { cancelled: 0, refunded: 0, unpaid: 0 };
  (orders || []).forEach((o) => {
    if (isCompletedSale(o)) return;
    if (o.status === "cancelled") out.cancelled++;
    else if (o.status === "returned" || o.refundStatus === "refunded") out.refunded++;
    else out.unpaid++; // chờ thanh toán / chờ xác nhận chuyển khoản / bị từ chối…
  });
  return out;
}

export function getBestSellers(products, orders, limit = 6, minSold = 3) {
  const countMap = {};
  (orders || []).filter(isCompletedSale).forEach((order) => {
    if (!order.items || !Array.isArray(order.items)) return;
    order.items.forEach((item) => {
      const pid = String(item.productId);
      countMap[pid] = (countMap[pid] || 0) + (item.quantity || 1);
    });
  });

  return Object.entries(countMap)
    .map(([pid, totalSold]) => {
      const product = (products || []).find((p) => String(p.id) === pid);
      return product ? { product, totalSold } : null;
    })
    .filter(Boolean)
    // Chỉ coi là "Bán chạy" nếu đã bán tối thiểu `minSold` chậu — tránh hiện
    // sản phẩm chỉ bán được 1-2 chậu như "best seller" (gãy ranking).
    .filter((it) => it.totalSold >= minSold)
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, limit);
}

// Top cây bán chạy cho mục "Bán chạy nhất" ở trang chủ.
//   • Đếm số chậu đã bán (cùng định nghĩa "đã bán" với doanh thu: isCompletedSale), chỉ tính CÂY (bỏ phụ kiện).
//   • Lấy tối đa `max` cây, nhưng KHÔNG cắt ngang một nhóm hòa nhau: cây cuối cùng được hiện phải bán nhiều hơn
//     hẳn cây đầu tiên bị bỏ ra. Vd số bán [10, 8, 8, 8] → chỉ hiện 1 cây (ba cây 8 chậu không phân được ai hơn);
//     [10, 10, 8, 5] → hiện 3 cây, hai cây đầu cùng hạng 1. Hòa nhau từ đầu tới cuối (vd [5, 5, 5, 5]) → không hiện.
//   • Hạng tính kiểu thi đấu: bằng số bán thì cùng hạng (1, 1, 3).
export function topSellers(products, orders, { max = 3, categories = [], plantsOnly = true } = {}) {
  const sold = {};
  (orders || []).filter(isCompletedSale).forEach((order) => {
    (order.items || []).forEach((item) => {
      const pid = String(item.productId);
      sold[pid] = (sold[pid] || 0) + (Number(item.quantity) || 1);
    });
  });
  const list = Object.entries(sold)
    .map(([pid, totalSold]) => ({ product: (products || []).find((p) => String(p.id) === pid), totalSold }))
    .filter((it) => it.product && it.totalSold > 0 && (!plantsOnly || isPlant(it.product, categories)))
    .sort((a, b) => b.totalSold - a.totalSold || String(a.product.name).localeCompare(String(b.product.name), "vi"));
  let k = Math.min(max, list.length);
  while (k > 0 && list[k] && list[k].totalSold === list[k - 1].totalSold) k--;
  return list.slice(0, k).map((it) => ({ ...it, rank: 1 + list.filter((x) => x.totalSold > it.totalSold).length }));
}

export function calcSalePrice(originalPrice, discountPercent) {
  return Math.round(originalPrice * (1 - discountPercent / 100));
}
