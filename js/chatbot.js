// ==========================================================
// chatbot.js — Chatbot tư vấn cây cảnh Lá & Sỏi
// Rule-based, chỉ trả lời trong phạm vi dữ liệu web
// ==========================================================
import { getProducts, getCategories, getPromotions, getCoupons, getSettings } from "./api.js";
import { getActivePromotions, setActivePromotions, getPriceInfo, isPlant } from "./sale.js";
import { removeAccents, formatPrice, escapeHTML } from "./ui.js";

let products = [];
let categories = [];
let promotions = [];
let coupons = [];
let shop = {};
let chatOpen = false;

async function loadData() {
  try {
    const [prods, cats, promos, cps, settings] = await Promise.all([
      getProducts(),
      getCategories(),
      getPromotions().catch(() => []),
      getCoupons().catch(() => []),
      getSettings().catch(() => null),
    ]);
    products = prods || [];
    categories = cats || [];
    promotions = promos || [];
    coupons = cps || [];
    shop = settings || {};
    setActivePromotions(promotions);
  } catch (err) {
    console.warn("Chatbot: không tải được dữ liệu", err);
  }
}

// Giá thực (đã trừ khuyến mãi đang chạy)
function priceText(p) {
  const pi = getPriceInfo(p);
  return pi.original
    ? `${formatPrice(pi.price)} <s>${formatPrice(pi.original)}</s>`
    : formatPrice(pi.price);
}

const link = (p) => `<a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a>`;
const listProducts = (arr, n = 5) => arr.slice(0, n).map((p) => `• ${link(p)} — ${priceText(p)}`).join("\n");

// Mã giảm giá đang dùng được (đọc từ dữ liệu thật, không ghi cứng)
function usableCoupons() {
  const now = new Date();
  return coupons.filter((c) =>
    !c.deletedAt && c.isActive !== false &&
    (!c.startDate || new Date(c.startDate) <= now) &&
    (!c.expiryDate || new Date(c.expiryDate) >= now) &&
    !((c.usageLimit || 0) > 0 && (c.usedCount || 0) >= c.usageLimit)
  );
}
function couponLines() {
  return usableCoupons().map((c) => {
    const cond = [
      c.minOrder ? `đơn từ ${formatPrice(c.minOrder)}` : "",
      c.maxDiscount ? `tối đa ${formatPrice(c.maxDiscount)}` : "",
      c.requireNewUser ? "chỉ tài khoản đăng ký trong vòng 1 tháng" : "",
    ].filter(Boolean).join(", ");
    return `• <strong>${escapeHTML(c.code)}</strong> — giảm ${c.discountPercent}%${cond ? ` (${cond})` : ""}`;
  }).join("\n");
}

// Tìm theo thẻ (tag) / danh mục có trong dữ liệu: "cây treo", "thủy sinh", "bonsai", "sen đá"...
function matchTagOrCategory(n) {
  // "Sen đá & mọng nước" → khớp "sen da" hoặc "mong nuoc"
  const cat = categories.find((c) => norm(c.name).split("&").map((k) => k.trim()).some((k) => k.length > 3 && n.includes(k)));
  if (cat) return { label: cat.name, items: products.filter((p) => String(p.categoryId) === String(cat.id)) };
  const tags = [...new Set(products.flatMap((p) => p.tags || []))];
  const tag = tags.find((t) => n.includes(norm(t)));
  if (tag) return { label: tag, items: products.filter((p) => (p.tags || []).includes(tag)) };
  return null;
}

function norm(text) {
  return removeAccents(text).toLowerCase().trim();
}

function detectIntent(input) {
  const n = norm(input);

  // ====== BƯỚC 1: Intent rõ ràng (greeting, thanks, bye) ======
  if (/^(xin chao|hello|hi|chao|hey|alo)\b/.test(n)) return "greeting";
  if (/cam on|thanks?|thank/.test(n)) return "thanks";
  if (/tam biet|bye|thoat|dong\b/.test(n)) return "goodbye";

  // ====== BƯỚC 2: Detect tên sản phẩm TRƯỚC ======
  // Nếu user nhắc đến tên cây cụ thể → ưu tiên xử lý theo tên,
  // không để keyword chung "cướp" intent
  const matchedProduct = products.find((p) =>
    n.includes(norm(p.name)) ||
    (p.scientificName && n.includes(norm(p.scientificName)))
  );

  if (matchedProduct) {
    if (/them.*gio|mua|dat hang|dat mua|bo vao gio|add.*cart/.test(n)) return "add_to_cart";
    if (/con hang|het hang|con khong|ton kho|co san|stock/.test(n)) return "ask_stock";
    if (/gia|bao nhieu/.test(n)) return "ask_price";
    if (/cham soc|cach trong|cach tuoi|huong dan/.test(n)) return "ask_care";
    return "search_product";
  }

  // Hỏi SỐ LƯỢNG ("có bao nhiêu cây/loài/sản phẩm") ≠ hỏi giá ("bao nhiêu tiền")
  if (/(bao nhieu|may) (cay|loai|san pham|mau|chau|giong)|tong (so|cong) (cay|san pham)|so luong (cay|san pham)/.test(n) && !/tien|gia\b|\bvnd|dong/.test(n)) return "ask_count";

  // ====== BƯỚC 3: Câu hỏi nghiệp vụ / FAQ (thứ tự quan trọng: cụ thể trước, chung sau) ======
  if (/ban la ai|lam duoc gi|giup duoc gi|biet gi|huong dan su dung|\bhelp\b/.test(n)) return "help";
  if (/quen chup|quen anh|chua chup|mat anh|khong co anh|khong chup/.test(n)) return "faq_forgot_proof";
  if (/nap tien|nap vi|so du|vi web|vi dien tu|thanh toan bang vi|tra bang vi/.test(n)) return "faq_wallet";
  if (/thanh toan|chuyen khoan|tra tien|phuong thuc|\bqr\b|\bcod\b|tien mat|quet ma/.test(n)) return "faq_payment";
  if (/hoa don|bien lai|\bvat\b|xuat hoa/.test(n)) return "faq_invoice";
  if (/doi tra|doi cay|tra hang|hoan hang|hoan tien|bao hanh|cay chet khi|cay heo khi nhan|nhan cay bi|huy don|huy hang/.test(n)) return "faq_return";
  if (/kiem tra don|theo doi don|trang thai don|don cua toi|don hang cua|xem don|don toi|giao toi dau|chua nhan duoc|da giao chua/.test(n)) return "faq_order";
  if (/dat truoc|bao khi co hang|bao co hang|khi nao co hang|ve hang/.test(n)) return "faq_preorder";
  if (/quen mat khau|doi mat khau|dang ky|tao tai khoan|dang nhap|tai khoan|anh dai dien|avatar/.test(n)) return "faq_account";
  if (/danh gia|review|binh luan|nhan xet|cham sao/.test(n)) return "faq_review";
  if (/nhan vien|gap nguoi|nguoi that|chat voi shop|nhan shop|tu van vien|hotline/.test(n)) return "faq_staff";
  if (/mua si|\bsi\b|so luong lon|cong ty|doanh nghiep|qua tang su kien/.test(n)) return "faq_bulk";
  if (/an duoc|an that|\brau\b|trai cay|cay an qua|gia vi|lam thuoc/.test(n)) return "faq_edible";
  if (/vang la|\bheo\b|ung re|thoi re|sau benh|bi sau|sau an|\brep\b|nam moc|benh|chay la|rung la|la kho|la bi|cay yeu|sap chet/.test(n)) return "faq_problem";
  if (/thay chau|doi chau|gia the|dat trong|phan bon|bon phan|chau nao/.test(n)) return "faq_repot";
  if (/kich thuoc|\bsize\b|co chau|cao bao nhieu|chieu cao|to nho|lon nho/.test(n)) return "faq_size";
  if (/qua tang|tang ban|sinh nhat|khai truong|tang sep|tang nguoi yeu|lam qua/.test(n)) return "recommend_gift";
  if (/phong thuy|may man|tai loc|hop menh|\bmenh\b/.test(n)) return "recommend_fengshui";
  if (/ban chay|mua nhieu|pho bien|hot nhat|yeu thich nhat/.test(n)) return "ask_bestseller";

  // ====== BƯỚC 3b: Intent hành động (thêm giỏ, mua) ======
  if (/them.*gio|mua hang|dat hang|dat mua|bo vao gio|add.*cart/.test(n)) return "add_to_cart";

  // ====== BƯỚC 4: Keyword chung ======
  if (/sale|giam gia|khuyen mai|ma giam|coupon|uu dai|voucher/.test(n)) return "ask_sale";
  if (/phi ship|phi giao|phi van chuyen|freeship|mien phi giao|giao hang|van chuyen|\bship\b/.test(n)) return "faq_shipping";
  if (/dia chi|lien he|mo cua|o dau|zalo|dien thoai|email|gio lam/.test(n)) return "ask_shop";
  if (/danh muc|loai cay|nhung loai|bao nhieu loai/.test(n)) return "ask_category";

  // Pet safe — tránh "cho tôi/cho bạn" match "chó"
  if (/\bmeo\b|thu cung|\bpet\b|an toan.*cay|khong doc|nuoi cho|nuoi meo|cho meo/.test(n)) return "recommend_pet";
  if (/\bcho\b/.test(n) && /nuoi|can|nha co|song chung|thu|cung/.test(n)) return "recommend_pet";

  if (/de cham|de trong|nguoi moi|moi trong|lan dau|beginner|de song/.test(n)) return "recommend_easy";
  if (/phong ngu|phong khach|phong tam|ban cong|ban lam viec|van phong/.test(n)) return "recommend_room";

  // Light — tránh "sang" quá rộng; "chỗ tối" (o/de/dat cho toi) ≠ "cho tôi"
  if (/\bnang\b|anh sang|cua so|nhieu sang|it sang|cho ram|(o|de|dat|phong) cho toi|phong toi/.test(n)) return "recommend_light";
  if (/\bram\b|\bbong\b/.test(n) && !/bong mat/.test(n)) return "recommend_light";

  // Water — tránh match "nuoc" trong "nước Pháp"
  if (/tuoi nuoc|cach tuoi|quen tuoi|hay quen|it tuoi|ban ron|tuoi bao lau/.test(n)) return "recommend_water";

  // Stock
  if (/con hang|het hang|ton kho|co san/.test(n)) return "ask_stock";

  if (/gia|bao nhieu|re nhat|dat nhat|gia ca/.test(n)) return "ask_price";
  if (/cham soc|cach trong|cach tuoi|bao lau tuoi|do am|huong dan/.test(n)) return "ask_care";
  if (matchTagOrCategory(n)) return "browse_tag";
  if (/goi y|tu van|nen mua|nen trong|chon cay|cay nao hop|cay nao phu hop|cay gi|mua cay nao/.test(n)) return "recommend_general";
  if (/\btim\b|co ban|co khong/.test(n)) return "search_product";

  return "out_of_scope";
}

function handleIntent(intent, input) {
  const n = norm(input);
  switch (intent) {
    case "greeting":
      return {
        text: `Xin chào! 🌿 Mình là trợ lý tư vấn cây cảnh của <strong>Lá & Sỏi</strong>. Mình có thể giúp bạn:\n• Gợi ý cây phù hợp phòng bạn\n• Tìm cây theo tên hoặc nhu cầu\n• Hướng dẫn chăm sóc cây\n• Thông tin giá cả, khuyến mãi\n\nBạn cần tư vấn gì nào?`,
        suggestions: ["Cây dễ chăm", "Cây an toàn cho mèo", "Đang có sale gì?"],
      };
    case "recommend_pet": return handlePetSafe();
    case "recommend_easy": return handleEasyCare();
    case "recommend_light": return handleLight(n);
    case "recommend_water": return handleWater(n);
    case "recommend_room": return handleRoom(n);
    case "search_product": return handleSearch(n);
    case "ask_price": return handlePrice(n);
    case "ask_care": return handleCare(n);
    case "ask_sale": return handleSale();
    case "ask_shop": return handleShop();
    case "ask_category": return handleCategory();
    case "add_to_cart": return handleAddToCart(n);
    case "ask_stock": return handleStock(n);
    case "browse_tag": return handleBrowseTag(n);
    case "ask_count": return handleCount();
    case "recommend_general": return handleGeneral();
    case "recommend_gift": return handleGift();
    case "recommend_fengshui": return handleFengShui();
    case "ask_bestseller": return handleBestseller();
    case "help":
    case "faq_forgot_proof":
    case "faq_wallet":
    case "faq_payment":
    case "faq_invoice":
    case "faq_return":
    case "faq_order":
    case "faq_account":
    case "faq_review":
    case "faq_preorder":
    case "faq_staff":
    case "faq_bulk":
    case "faq_edible":
    case "faq_problem":
    case "faq_repot":
    case "faq_size":
    case "faq_shipping":
      return FAQ[intent]();
    case "thanks":
      return {
        text: "Không có gì! 😊 Nếu cần thêm thông tin về cây cảnh, cứ hỏi mình nhé.",
        suggestions: ["Cây phù hợp phòng ngủ", "Cây rẻ nhất"],
      };
    case "goodbye":
      return {
        text: "Tạm biệt bạn! 🌱 Chúc bạn chọn được cây ưng ý. Quay lại bất cứ lúc nào nhé!",
        suggestions: [],
      };
    case "out_of_scope":
    default:
      return {
        text: "Xin lỗi, mình chỉ có thể tư vấn về <strong>cây cảnh và sản phẩm của Lá & Sỏi</strong> thôi ạ. 🌿\n\nBạn thử hỏi về:\n• Gợi ý cây phù hợp\n• Cách chăm sóc cây\n• Giá cả, khuyến mãi",
        suggestions: ["Gợi ý cây cho tôi", "Cây dễ chăm nhất", "Có sale gì không?"],
      };
  }
}

// ===== Câu trả lời FAQ — chỉ mô tả đúng tính năng đang có trên web =====
const FAQ = {
  help: () => ({
    text: `Mình là trợ lý tự động của <strong>Lá & Sỏi</strong> 🌿. Mình có thể:\n• Gợi ý cây theo phòng, ánh sáng, thời gian tưới, thú cưng\n• Báo giá, tồn kho, khuyến mãi & mã giảm giá đang dùng được\n• Hướng dẫn chăm sóc từng loài, xử lý cây vàng lá/úng rễ\n• Giải đáp cách thanh toán, nạp ví, hóa đơn, đơn hàng, đổi cây\n\nCần người thật? Bấm nút <strong>💬 Nhắn shop</strong> (khi đã đăng nhập) để chat với nhân viên.`,
    suggestions: ["Gợi ý cây cho người mới", "Thanh toán thế nào?", "Mã giảm giá"],
  }),
  faq_payment: () => ({
    text: `Lá & Sỏi có <strong>2 cách thanh toán</strong>:\n\n💳 <strong>Ví web</strong> — trừ tiền ngay, đơn được xác nhận và xuất hóa đơn liền.\n🏦 <strong>Chuyển khoản QR</strong> (${escapeHTML(shop.bankName || "ngân hàng")}) — quét mã, chụp màn hình rồi tải ảnh lên. Nhân viên kiểm tra và xác nhận, sau đó hóa đơn được gửi qua email.\n\nLưu ý: ghi đúng <strong>nội dung chuyển khoản</strong> hiện trong mã QR để shop đối soát nhanh.`,
    suggestions: ["Quên chụp ảnh chuyển khoản", "Nạp ví thế nào?", "Xem hóa đơn ở đâu?"],
  }),
  faq_forgot_proof: () => ({
    text: `Không sao ạ! Trong bước thanh toán QR, bấm <strong>"Tôi đã chuyển khoản nhưng quên chụp ảnh"</strong>. Nhân viên sẽ đối soát sao kê theo <strong>nội dung chuyển khoản</strong> và số tiền.\n\nBạn cũng có thể <strong>bổ sung ảnh sau</strong> trong <a href="donhang.html">Đơn hàng của tôi</a> để được duyệt nhanh hơn.`,
    suggestions: ["Xem đơn hàng", "Thanh toán thế nào?"],
  }),
  faq_wallet: () => ({
    text: `<strong>Nạp ví web:</strong> vào <a href="profile.html">Hồ sơ</a> → tab Ví → <strong>Nạp tiền</strong> → nhập số tiền, chuyển khoản theo mã QR và tải ảnh lên. Nhân viên duyệt xong, số dư được cộng và bạn nhận thông báo.\n\nKhi đặt hàng, chọn <strong>💳 Ví web</strong> nếu số dư đủ — đơn được xác nhận ngay.`,
    suggestions: ["Thanh toán thế nào?", "Xem hóa đơn ở đâu?"],
  }),
  faq_invoice: () => ({
    text: `Hóa đơn PDF có trong <a href="donhang.html">Đơn hàng của tôi</a> → nút <strong>📄 Tải hóa đơn PDF</strong>, xuất hiện khi đơn đã thanh toán.\n• Trả bằng ví: có hóa đơn ngay.\n• Chuyển khoản: có hóa đơn sau khi nhân viên xác nhận (đồng thời gửi qua email).`,
    suggestions: ["Kiểm tra đơn hàng", "Thanh toán thế nào?"],
  }),
  faq_return: () => ({
    text: `↩ <strong>Hoàn hàng</strong>: trong <strong>7 ngày</strong> kể từ khi nhận hàng, vào <a href="donhang.html">Đơn hàng của tôi</a> → <strong>Yêu cầu hoàn hàng</strong> (ghi lý do). Shop duyệt → bạn gửi trả cây → shop nhận lại hàng thì <strong>hoàn toàn bộ tiền vào Ví web</strong>.\n\n✗ <strong>Hủy đơn</strong>: bấm <strong>Hủy đơn</strong> khi đơn còn "Chờ xác nhận" hoặc "Chờ giao" (trước khi shop giao cho vận chuyển). Đơn đã thanh toán được hoàn tiền vào Ví web ngay.\n\n💸 Đơn chuyển khoản chưa được duyệt mà bạn đã chuyển tiền rồi hủy: shop kiểm tra sao kê rồi hoàn vào ví.`,
    suggestions: ["Kiểm tra đơn hàng", "Nạp ví thế nào?"],
  }),
  faq_order: () => ({
    text: `Theo dõi đơn tại <a href="donhang.html">Đơn hàng của tôi</a>: Chờ xác nhận → Chờ giao → Đang giao → Đã giao → <strong>bạn bấm "Đã nhận được hàng"</strong> → Hoàn tất (tự hoàn tất sau 3 ngày nếu bạn không phản hồi).\n\nChưa nhận được hàng dù shop báo đã giao? Bấm <strong>"Chưa nhận được hàng"</strong> để shop xác minh. Mỗi đơn có <strong>lịch sử</strong> ghi rõ ai làm gì, lúc nào; mỗi lần đổi trạng thái bạn đều nhận thông báo + email.`,
    suggestions: ["Hủy đơn thế nào?", "Hoàn hàng thế nào?"],
  }),
  faq_account: () => ({
    text: `• <strong>Đăng ký</strong>: <a href="dangky.html">trang Đăng ký</a> (mật khẩu đủ mạnh, tối thiểu 8 ký tự).\n• <strong>Quên mật khẩu</strong>: bấm "Quên mật khẩu?" ở <a href="login.html">trang đăng nhập</a> → nhận <strong>mã OTP 6 số</strong> qua email (hiệu lực 10 phút) → nhập mã → đặt mật khẩu mới.\n• <strong>Đổi mật khẩu, ảnh đại diện, thông tin</strong>: trong <a href="profile.html">Hồ sơ</a>.\n\n🎁 Tài khoản mới (dưới 30 ngày) có mã giảm giá riêng.`,
    suggestions: ["Mã giảm giá", "Thanh toán thế nào?"],
  }),
  faq_review: () => ({
    text: `Bạn có thể chấm sao & bình luận ở cuối trang chi tiết mỗi cây. Để đánh giá trung thực, <strong>chỉ khách đã mua và thanh toán cây đó</strong> mới gửi được đánh giá (mỗi người 1 đánh giá/cây). Bạn cũng có thể <strong>trả lời</strong> đánh giá của người khác.`,
    suggestions: ["Cây bán chạy", "Gợi ý cây cho người mới"],
  }),
  faq_preorder: () => ({
    text: `Cây hết hàng vẫn có thể bấm <strong>Đặt trước</strong>, hoặc bấm <strong>🔔 Báo tôi khi có hàng lại</strong> ở trang chi tiết — khi nhân viên nhập kho, bạn nhận thông báo và email ngay.${
      products.some((p) => p.stock <= 0) ? `\n\nĐang hết hàng: ${products.filter((p) => p.stock <= 0).map(link).join(", ")}` : ""}`,
    suggestions: ["Cây còn hàng", "Cây bán chạy"],
  }),
  faq_staff: () => ({
    text: `Để chat với nhân viên, hãy <a href="login.html">đăng nhập</a> rồi bấm nút <strong>💬 Nhắn shop</strong> ở góc dưới trái. Hoặc gọi/Zalo <strong>${escapeHTML(shop.phone || "0908 123 456")}</strong>${shop.openHours ? ` (${escapeHTML(shop.openHours)})` : ""}.`,
    suggestions: ["Địa chỉ shop", "Thanh toán thế nào?"],
  }),
  faq_bulk: () => ({
    text: `Với đơn số lượng lớn (văn phòng, sự kiện, quà tặng), vui lòng liên hệ trực tiếp để được báo giá riêng:\n📞 ${escapeHTML(shop.phone || "0908 123 456")}\n📧 ${escapeHTML(shop.email || "trogiup@lasoi.vn")}`,
    suggestions: ["Cây phong thủy", "Cây để bàn mini"],
  }),
  faq_edible: () => {
    const safe = products.filter((p) => p.petSafe === true);
    return {
      text: `Lá & Sỏi chỉ bán <strong>cây cảnh & sen đá trang trí</strong>, không có rau/cây ăn được. ⚠️ Nhiều cây cảnh có độc nhẹ, không nên ăn hoặc để trẻ nhỏ/thú cưng gặm.\n\nNếu nhà có mèo/chó, đây là các cây <strong>an toàn</strong>:\n${listProducts(safe, 4)}`,
      suggestions: ["Cây an toàn cho mèo", "Cây dễ chăm"],
    };
  },
  faq_problem: () => ({
    text: `Một số dấu hiệu thường gặp & cách xử lý:\n\n🍂 <strong>Vàng lá, mềm thân, đất luôn ướt</strong> → thường do tưới quá nhiều/úng rễ: ngưng tưới, để đất khô, kiểm tra lỗ thoát nước.\n🥀 <strong>Lá héo, mép lá khô giòn</strong> → thiếu nước hoặc nắng gắt: tưới đẫm khi đất khô 2–3cm, dời khỏi nắng trưa.\n🌱 <strong>Thân vươn dài, lá nhạt màu</strong> → thiếu sáng: dời gần cửa sổ.\n🐛 <strong>Đốm trắng/rệp</strong> → lau lá bằng khăn ẩm, cách ly cây.\n\nMỗi cây có <strong>phiếu chăm sóc</strong> riêng ở trang chi tiết. Hỏi mình "cách chăm sóc + tên cây" để xem chỉ số cụ thể.`,
    suggestions: products.filter((p) => p.careLevel).slice(0, 2).map((p) => `Chăm sóc ${p.name}`),
  }),
  faq_repot: () => {
    const acc = products.filter((p) => String(p.categoryId) === "5");
    return {
      text: `Nên thay chậu khi rễ mọc ra lỗ thoát nước hoặc cây đã 1–2 năm trong chậu cũ; chọn chậu lớn hơn 2–4cm, có lỗ thoát nước. Sen đá/xương rồng cần giá thể thoát nước nhanh.\n\nPhụ kiện tại shop:\n${listProducts(acc, 4) || "(chưa có)"}`,
      suggestions: ["Cây sen đá", "Cây dễ chăm"],
    };
  },
  faq_size: () => {
    const withV = products.filter((p) => (p.variants || []).length);
    return {
      text: `Nhiều cây có <strong>3 kích cỡ</strong> (Nhỏ / Vừa / Lớn) với chiều cao và đường kính chậu khác nhau — chọn ở trang chi tiết, giá đổi theo size.\n\nVí dụ: ${withV.slice(0, 3).map((p) => `${link(p)} (${p.variants.map((v) => escapeHTML(v.label)).join(" · ")})`).join("\n")}`,
      suggestions: ["Cây để bàn mini", "Giá rẻ nhất?"],
    };
  },
  faq_shipping: () => ({
    text: `🚚 Phí giao tận nhà: <strong>${formatPrice(Number(shop.shipFee ?? 30000))}</strong>/đơn — <strong>miễn phí</strong> cho đơn từ <strong>${formatPrice(Number(shop.freeShipThreshold ?? 300000))}</strong> (tính trên tiền hàng sau khuyến mãi). Phí được hiện rõ ở <a href="cart.html">giỏ hàng</a> trước khi thanh toán.\n\nCần hỏi thời gian giao cụ thể, bạn nhắn shop hoặc gọi <strong>${escapeHTML(shop.phone || "0908 123 456")}</strong>.`,
    suggestions: ["Địa chỉ shop", "Thanh toán thế nào?"],
  }),
};

function handleCount() {
  const plants = products.filter((p) => isPlant(p, categories));
  const inStock = plants.filter((p) => Number(p.stock) > 0);
  const acc = products.length - plants.length;
  const byCat = categories.map((c) => {
    const n = products.filter((p) => String(p.categoryId) === String(c.id)).length;
    return n ? `• ${escapeHTML(c.name)}: <strong>${n}</strong>` : "";
  }).filter(Boolean).join("\n");
  return {
    text: `Lá & Sỏi hiện có <strong>${plants.length} loài cây</strong> (${inStock.length} loài đang còn hàng)${acc ? ` và <strong>${acc} phụ kiện</strong> (chậu, giá thể)` : ""} — tổng ${products.length} sản phẩm.\n\nTheo danh mục:\n${byCat}`,
    suggestions: ["Cây dễ chăm nhất", "Cây rẻ nhất?", "Đang có sale?"],
  };
}

function handleBrowseTag(n) {
  const m = matchTagOrCategory(n);
  if (!m || !m.items.length) return handleSearch(n);
  return {
    text: `Các cây thuộc nhóm <strong>${escapeHTML(m.label)}</strong>:\n\n${listProducts(m.items, 6)}`,
    suggestions: ["Cây dễ chăm", "Đang có sale?"],
  };
}

function handleGeneral() {
  const easy = products.filter((p) => p.difficulty === "Dễ chăm" && p.stock > 0);
  return {
    text: `Để gợi ý chuẩn hơn, bạn cho mình biết thêm: đặt ở đâu (phòng ngủ, bàn làm việc, ban công…), nhiều hay ít nắng, có hay quên tưới, có nuôi mèo/chó không nhé!\n\nTrong lúc đó, đây là vài cây <strong>dễ chăm, còn hàng</strong>:\n${listProducts(easy, 4)}`,
    suggestions: ["Cây cho phòng ngủ", "Cây cho người hay quên tưới", "Cây an toàn cho mèo"],
  };
}

function handleGift() {
  const picks = products.filter((p) => p.stock > 0 && (String(p.categoryId) === "4" || String(p.categoryId) === "3"));
  return {
    text: `Gợi ý cây làm <strong>quà tặng</strong> (nhỏ gọn hoặc mang ý nghĩa phong thủy, còn hàng):\n\n${listProducts(picks, 5)}\n\nMỗi chậu đều kèm phiếu chăm sóc — người nhận dễ nuôi.`,
    suggestions: ["Cây phong thủy", "Cây để bàn mini"],
  };
}

function handleFengShui() {
  const items = products.filter((p) => String(p.categoryId) === "4" || (p.tags || []).includes("phong thủy"));
  return {
    text: `Các cây trong nhóm <strong>phong thủy</strong> của shop:\n\n${listProducts(items, 6)}`,
    suggestions: ["Quà tặng khai trương", "Cây dễ chăm"],
  };
}

function handleBestseller() {
  return {
    text: `Các cây được mua nhiều nhất hiện ở mục <strong>🔥 Được Mua Nhiều Nhất</strong> trên <a href="index.html#bestSellers">trang chủ</a>. Một vài cây dễ chăm, khách hay chọn:\n${listProducts(products.filter((p) => p.isFeatured), 4)}`,
    suggestions: ["Cây rẻ nhất?", "Đang có sale?"],
  };
}

function handlePetSafe() {
  const safe = products.filter((p) => p.petSafe === true);
  if (safe.length === 0) {
    return { text: "Hiện tại chưa tìm thấy cây an toàn cho thú cưng trong kho.", suggestions: [] };
  }
  const list = safe.slice(0, 5).map((p) =>
    `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${priceText(p)}`
  ).join("\n");
  return {
    text: `Đây là các cây <strong>an toàn cho thú cưng</strong> (không gây độc):\n\n${list}\n\nTổng cộng có ${safe.length} loài an toàn cho mèo/chó.`,
    suggestions: ["Xem thêm chi tiết", "Cây nào dễ chăm nhất?"],
  };
}

function handleEasyCare() {
  const easy = products.filter((p) => p.difficulty === "Dễ chăm");
  const list = easy.slice(0, 5).map((p) =>
    `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${priceText(p)} · ${escapeHTML(p.specs?.water || "")}`
  ).join("\n");
  return {
    text: `Các cây <strong>dễ chăm nhất</strong>, hợp người bận rộn:\n\n${list}\n\nCây dễ chăm thường chịu hạn tốt, không cần tưới thường xuyên.`,
    suggestions: ["Cây nào rẻ nhất?", "Cây an toàn cho mèo"],
  };
}

function handleLight(n) {
  let filter, label;
  if (/nhieu nang|nang gat|nang truc tiep|nhieu sang/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.light >= 70;
    label = "cần nhiều nắng";
  } else if (/it nang|ram|toi|it sang|khong co nang|bong/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.light <= 40;
    label = "chịu bóng / ít sáng";
  } else {
    filter = (p) => p.careLevel && p.careLevel.light >= 40 && p.careLevel.light <= 70;
    label = "sáng gián tiếp (trung bình)";
  }
  const matched = products.filter(filter);
  if (matched.length === 0) {
    return { text: `Không tìm thấy cây phù hợp với mức sáng "${label}".`, suggestions: [] };
  }
  const list = matched.slice(0, 5).map((p) =>
    `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${escapeHTML(p.specs?.light || "")}`
  ).join("\n");
  return {
    text: `Cây phù hợp với điều kiện <strong>${label}</strong>:\n\n${list}`,
    suggestions: ["Cây cần ít nước", "Cây an toàn cho mèo"],
  };
}

function handleWater(n) {
  let filter, label;
  if (/hay quen|quen tuoi|it tuoi|ban ron|lau tuoi/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.water <= 30;
    label = "ít cần tưới (chịu hạn tốt)";
  } else if (/nhieu nuoc|thich tuoi|tuoi nhieu/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.water >= 60;
    label = "cần tưới thường xuyên";
  } else {
    filter = (p) => p.careLevel && p.careLevel.water >= 30 && p.careLevel.water <= 60;
    label = "tưới vừa phải (1 lần/tuần)";
  }
  const matched = products.filter(filter);
  const list = matched.slice(0, 5).map((p) =>
    `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${escapeHTML(p.specs?.water || "")}`
  ).join("\n");
  return {
    text: `Cây <strong>${label}</strong>:\n\n${list}`,
    suggestions: ["Cây cho phòng tối", "Cây dễ chăm"],
  };
}

function handleRoom(n) {
  let filter, label, tip;
  if (/phong ngu/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.light <= 50 && p.careLevel.humidity <= 60;
    label = "phòng ngủ";
    tip = "Phòng ngủ thường ít sáng và khô, nên chọn cây chịu bóng.";
  } else if (/phong khach/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.light >= 40 && p.careLevel.light <= 70;
    label = "phòng khách";
    tip = "Phòng khách thường có sáng gián tiếp, phù hợp nhiều loài.";
  } else if (/phong tam/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.humidity >= 70;
    label = "phòng tắm";
    tip = "Phòng tắm ẩm, chọn cây ưa ẩm cao.";
  } else if (/ban cong/.test(n)) {
    filter = (p) => p.careLevel && p.careLevel.light >= 60;
    label = "ban công";
    tip = "Ban công có nắng, chọn cây chịu nắng trực tiếp.";
  } else {
    filter = (p) => p.careLevel && p.careLevel.light <= 50 && p.careLevel.water <= 45;
    label = "bàn làm việc / văn phòng";
    tip = "Văn phòng thường chỉ có đèn, chọn cây chịu bóng và ít tưới.";
  }
  const matched = products.filter(filter);
  const list = matched.slice(0, 5).map((p) =>
    `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${priceText(p)}`
  ).join("\n");
  return {
    text: `Cây phù hợp đặt ở <strong>${label}</strong>:\n\n${list || "(Không có kết quả)"}\n\n💡 ${tip}`,
    suggestions: ["Cây dễ chăm", "Giá rẻ nhất?"],
  };
}

function handleSearch(n) {
  const found = products.filter((p) =>
    n.includes(norm(p.name)) ||
    (p.scientificName && n.includes(norm(p.scientificName)))
  );
  if (found.length > 0) {
    const list = found.map((p) =>
      `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> (<em>${escapeHTML(p.scientificName || "")}</em>) — ${priceText(p)}${p.stock > 0 ? ` · Còn ${p.stock} chậu` : " · <strong>Hết hàng</strong>"}`
    ).join("\n");
    return {
      text: `Tìm thấy:\n\n${list}`,
      suggestions: ["Cách chăm sóc cây này?", "Có cây tương tự không?"],
    };
  }
  const keywords = n.split(/\s+/).filter((w) => w.length > 2);
  const partial = products.filter((p) =>
    keywords.some((kw) => norm(p.name).includes(kw) || norm(p.description || "").includes(kw))
  );
  if (partial.length > 0) {
    const list = partial.slice(0, 5).map((p) =>
      `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${priceText(p)}`
    ).join("\n");
    return {
      text: `Kết quả tìm kiếm:\n\n${list}`,
      suggestions: ["Tìm cây khác", "Cây dễ chăm"],
    };
  }
  return {
    text: "Không tìm thấy sản phẩm phù hợp. Bạn thử tìm bằng tên khác, hoặc mô tả nhu cầu để mình gợi ý nhé!",
    suggestions: ["Cây cho phòng ngủ", "Cây dễ chăm", "Xem danh mục"],
  };
}

function handlePrice(n) {
  const found = products.find((p) => n.includes(norm(p.name)));
  if (found) {
    const promo = getPriceInfo(found).promo;
    return {
      text: `<a href="product-detail.html?id=${encodeURIComponent(found.id)}"><strong>${escapeHTML(found.name)}</strong></a>: <strong>${priceText(found)}</strong>${promo ? ` 🔥 ${escapeHTML(promo.name)}` : ""}\n${found.stock > 0 ? `Còn ${found.stock} chậu trong kho.` : "⚠️ Hiện đã hết hàng."}`,
      suggestions: ["Cây rẻ nhất?", "Đang có sale?"],
    };
  }
  if (/re nhat|re\b/.test(n)) {
    const sorted = [...products].filter((p) => p.careLevel).sort((a, b) => getPriceInfo(a).price - getPriceInfo(b).price);
    const list = sorted.slice(0, 3).map((p) =>
      `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${priceText(p)}`
    ).join("\n");
    return { text: `Cây có giá <strong>thấp nhất</strong>:\n\n${list}`, suggestions: ["Cây đắt nhất?"] };
  }
  if (/dat nhat|dat\b/.test(n)) {
    const sorted = [...products].filter((p) => p.careLevel).sort((a, b) => getPriceInfo(b).price - getPriceInfo(a).price);
    const list = sorted.slice(0, 3).map((p) =>
      `• <a href="product-detail.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHTML(p.name)}</strong></a> — ${priceText(p)}`
    ).join("\n");
    return { text: `Cây có giá <strong>cao nhất</strong>:\n\n${list}`, suggestions: ["Cây rẻ nhất?"] };
  }
  const list = products.filter((p) => p.careLevel).slice(0, 6).map((p) =>
    `• ${escapeHTML(p.name)}: ${priceText(p)}`
  ).join("\n");
  return {
    text: `Bảng giá một số cây:\n\n${list}\n\nXem đầy đủ tại trang <a href="index.html#catalog">Danh mục</a>.`,
    suggestions: ["Cây rẻ nhất?", "Đang có sale?"],
  };
}

function handleCare(n) {
  const found = products.find((p) => n.includes(norm(p.name)));
  if (found && found.careLevel) {
    const s = found.specs || {};
    return {
      text: `Hướng dẫn chăm sóc <a href="product-detail.html?id=${encodeURIComponent(found.id)}"><strong>${escapeHTML(found.name)}</strong></a>:\n\n🌞 Ánh sáng: ${escapeHTML(s.light || "—")}\n💧 Tưới nước: ${escapeHTML(s.water || "—")}\n💨 Độ ẩm: ${escapeHTML(s.humidity || "—")}\n🪴 Chậu: ${escapeHTML(s.potSize || "—")}\n\n${escapeHTML(found.description || "")}`,
      suggestions: ["Giá cây này?", "Cây tương tự?"],
    };
  }
  return {
    text: 'Bạn muốn hỏi cách chăm sóc cây nào? Nói tên cây để mình tra cứu giúp nhé! Ví dụ: "cách chăm sóc Trầu Bà Lỗ"',
    suggestions: products.slice(0, 3).map((p) => `Chăm sóc ${p.name}`),
  };
}

function handleSale() {
  const active = getActivePromotions(promotions);
  const cps = couponLines();
  const couponText = cps
    ? `\n\n🎟️ Mã giảm giá đang dùng được (nhập ở giỏ hàng):\n${cps}`
    : "\n\nHiện chưa có mã giảm giá nào đang mở.";
  if (active.length > 0) {
    const list = active.map((p) => {
      const scope = (p.appliesTo || "all") === "all"
        ? "toàn bộ sản phẩm"
        : `danh mục ${escapeHTML(categories.find((c) => "category:" + c.id === p.appliesTo)?.name || "")}`;
      return `• <strong>${escapeHTML(p.banner || p.name)}</strong> — giảm <strong>${p.discountPercent}%</strong> ${scope}${p.description ? `\n  ${escapeHTML(p.description)}` : ""}\n  ⏰ Đến: ${new Date(p.endDate).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}`;
    }).join("\n\n");
    return {
      text: `Khuyến mãi đang diễn ra (giá trên web đã tự giảm):\n\n${list}${couponText}`,
      suggestions: ["Cây rẻ nhất?", "Cây bán chạy"],
    };
  }
  return {
    text: `Hiện chưa có chương trình sale nào đang diễn ra.${couponText}`,
    suggestions: ["Cây rẻ nhất?", "Cây dễ chăm"],
  };
}

function handleShop() {
  const s = shop || {};
  return {
    text: `<strong>${escapeHTML(s.shopName || "Lá & Sỏi")} — ${escapeHTML(s.tagline || "Tiệm Cây Cảnh")}</strong>\n\n📍 Địa chỉ: ${escapeHTML(s.address || "86 Nguyễn Văn Thủ, P. Đa Kao, Q.1, TP.HCM")}\n🕘 Giờ mở cửa: ${escapeHTML(s.openHours || "09:00 – 20:00 hằng ngày")}\n📞 Điện thoại / Zalo: ${escapeHTML(s.phone || "0908 123 456")}\n📧 Email: ${escapeHTML(s.email || "trogiup@lasoi.vn")}${s.footerIntro ? `\n\n${escapeHTML(s.footerIntro)}` : ""}`,
    suggestions: ["Xem sản phẩm", "Đang có sale?"],
  };
}

function handleCategory() {
  const list = categories.map((c) => {
    const count = products.filter((p) => String(p.categoryId) === String(c.id)).length;
    return `• <strong>${escapeHTML(c.name)}</strong> (${count} sản phẩm)`;
  }).join("\n");
  return {
    text: `Lá & Sỏi hiện có <strong>${products.length} sản phẩm</strong> trong ${categories.length} danh mục:\n\n${list}\n\nBạn muốn xem danh mục nào?`,
    suggestions: categories.slice(0, 3).map((c) => c.name),
  };
}

function handleAddToCart(n) {
  const found = products.find((p) =>
    n.includes(norm(p.name)) ||
    (p.scientificName && n.includes(norm(p.scientificName)))
  );

  if (found) {
    if (found.stock <= 0) {
      return {
        text: `Rất tiếc, <a href="product-detail.html?id=${encodeURIComponent(found.id)}"><strong>${escapeHTML(found.name)}</strong></a> hiện đã <strong>hết hàng</strong>. 😔\n\nBạn có muốn xem cây tương tự không?`,
        suggestions: ["Cây tương tự", "Xem danh mục"],
      };
    }
    return {
      text: `Mình không thể thêm giỏ hàng trực tiếp từ chat, nhưng bạn có thể thêm nhanh tại đây:\n\n👉 <a href="product-detail.html?id=${encodeURIComponent(found.id)}"><strong>${escapeHTML(found.name)}</strong></a> — ${priceText(found)}\n\nBấm vào tên cây → chọn số lượng → bấm "Thêm vào giỏ". Còn <strong>${found.stock} chậu</strong> trong kho!`,
      suggestions: ["Giá cây khác?", "Đang có sale?"],
    };
  }

  return {
    text: "Bạn muốn thêm cây nào vào giỏ hàng? Nói tên cây để mình tìm giúp nhé! Hoặc xem danh mục để chọn:",
    suggestions: ["Xem danh mục", "Cây bán chạy", "Cây rẻ nhất"],
  };
}

function handleStock(n) {
  const found = products.find((p) =>
    n.includes(norm(p.name)) ||
    (p.scientificName && n.includes(norm(p.scientificName)))
  );

  if (found) {
    const status = found.stock > 0
      ? `Còn <strong>${found.stock} chậu</strong> trong kho! ✅`
      : `<strong>Hết hàng</strong> rồi ạ. 😔`;
    return {
      text: `<a href="product-detail.html?id=${encodeURIComponent(found.id)}"><strong>${escapeHTML(found.name)}</strong></a>: ${status}\n\nGiá: ${priceText(found)}`,
      suggestions: found.stock > 0 ? ["Mua cây này", "Cây tương tự"] : ["Cây tương tự", "Xem danh mục"],
    };
  }

  const inStock = products.filter((p) => p.stock > 0 && p.careLevel);
  const outOfStock = products.filter((p) => p.stock <= 0 && p.careLevel);
  return {
    text: `Hiện có <strong>${inStock.length} sản phẩm</strong> còn hàng${outOfStock.length > 0 ? ` và ${outOfStock.length} sản phẩm hết hàng` : ""}.\n\nBạn muốn kiểm tra cây nào cụ thể?`,
    suggestions: products.filter((p) => p.stock > 0).slice(0, 3).map((p) => p.name),
  };
}

function createChatWidget() {
  if (document.getElementById("chatWidget")) return;
  const widget = document.createElement("div");
  widget.id = "chatWidget";
  widget.innerHTML = `
    <!-- Mascot: chấm tròn nhỏ + speech bubble -->
    <div class="mascot" id="mascot">
      <div class="mascot__bubble" id="mascotBubble">
        Bạn cần mình hỗ trợ không? 🌿
        <button class="mascot__bubble-close" id="bubbleDismiss" type="button" aria-label="Đóng gợi ý">✕</button>
      </div>
      <button class="mascot__dot" id="mascotDot" type="button" aria-label="Mở chatbot tư vấn">
        <svg class="mascot__leaf" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="chat-window" id="chatWindow" hidden>
      <div class="chat-window__header">
        <div class="chat-window__title">
          <span class="chat-window__avatar">🌿</span>
          <div>
            <strong>Tư vấn cây cảnh</strong>
            <small>Lá & Sỏi — Luôn sẵn sàng</small>
          </div>
        </div>
        <button class="chat-window__close" id="chatClose" type="button" aria-label="Đóng chat">✕</button>
      </div>
      <div class="chat-window__body" id="chatBody"></div>
      <div class="chat-window__suggestions" id="chatSuggestions"></div>
      <form class="chat-window__input" id="chatForm">
        <input type="text" id="chatInput" placeholder="Hỏi về cây cảnh..." autocomplete="off" maxlength="200">
        <button type="submit" aria-label="Gửi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-11 11"/></svg>
        </button>
      </form>
    </div>`;
  document.body.appendChild(widget);
}

function appendMessage(role, html) {
  const body = document.getElementById("chatBody");
  if (!body) return;
  const div = document.createElement("div");
  div.className = `chat-msg chat-msg--${role}`;
  div.innerHTML = role === "bot" ? html.replace(/\n/g, "<br>") : escapeHTML(html);
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function renderSuggestions(suggestions) {
  const container = document.getElementById("chatSuggestions");
  if (!container) return;
  if (!suggestions || suggestions.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = suggestions.map((s) =>
    `<button class="chat-suggestion" type="button">${escapeHTML(s)}</button>`
  ).join("");
}

async function processMessage(text) {
  if (!text.trim()) return;
  appendMessage("user", text);
  renderSuggestions([]);

  const typingId = "typing-" + Date.now();
  const body = document.getElementById("chatBody");
  const typingDiv = document.createElement("div");
  typingDiv.className = "chat-msg chat-msg--bot chat-msg--typing";
  typingDiv.id = typingId;
  typingDiv.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
  body.appendChild(typingDiv);
  body.scrollTop = body.scrollHeight;

  await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
  document.getElementById(typingId)?.remove();

  const intent = detectIntent(text);
  const response = handleIntent(intent, text);
  appendMessage("bot", response.text);
  renderSuggestions(response.suggestions || []);
}

let chatbotInited = false;
export async function initChatbot() {
  if (chatbotInited) return;
  chatbotInited = true;

  createChatWidget();

  const mascot = document.getElementById("mascot");
  const dot = document.getElementById("mascotDot");
  const bubble = document.getElementById("mascotBubble");
  const bubbleDismiss = document.getElementById("bubbleDismiss");
  const win = document.getElementById("chatWindow");
  const closeBtn = document.getElementById("chatClose");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const suggestionsContainer = document.getElementById("chatSuggestions");

  // Disable input cho đến khi data sẵn sàng
  if (input) {
    input.disabled = true;
    input.placeholder = "Đang tải dữ liệu…";
  }
  const sendBtn = form?.querySelector("button[type='submit']");
  if (sendBtn) sendBtn.disabled = true;

  // Await loadData — đảm bảo products[] có dữ liệu trước khi user hỏi
  await loadData();

  if (input) {
    input.disabled = false;
    input.placeholder = "Hỏi về cây cảnh...";
  }
  if (sendBtn) sendBtn.disabled = false;

  let bubbleTimer = null;
  let bubbleHideTimer = null;

  // Bubble chỉ hiện 1 lần/phiên, sau 15 giây (cho user đọc nội dung chính trước)
  // và tự ẩn sau 5 giây. KHÔNG hiện lại nếu user đã dismiss trước đó.
  const DISMISS_KEY = "chatbot_bubble_dismissed";
  const alreadyDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
  if (!alreadyDismissed) {
    bubbleTimer = setTimeout(() => {
      bubble.classList.add("is-visible");
      bubbleHideTimer = setTimeout(() => {
        bubble.classList.remove("is-visible");
      }, 5000);
    }, 15000);
  }

  bubbleDismiss.addEventListener("click", (e) => {
    e.stopPropagation();
    bubble.classList.remove("is-visible");
    clearTimeout(bubbleTimer);
    clearTimeout(bubbleHideTimer);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
  });

  function openChat() {
    bubble.classList.remove("is-visible");
    clearTimeout(bubbleTimer);
    clearTimeout(bubbleHideTimer);
    chatOpen = true;
    win.hidden = false;
    mascot.classList.add("is-chat-open");
    input.focus();
    const body = document.getElementById("chatBody");
    if (body && body.children.length === 0) {
      const greeting = handleIntent("greeting", "");
      appendMessage("bot", greeting.text);
      renderSuggestions(greeting.suggestions);
    }
  }

  function closeChat() {
    chatOpen = false;
    win.hidden = true;
    mascot.classList.remove("is-chat-open");
  }

  dot.addEventListener("click", openChat);
  bubble.addEventListener("click", (e) => {
    if (e.target.closest(".mascot__bubble-close")) return;
    openChat();
  });
  closeBtn.addEventListener("click", closeChat);

  // Bấm ngoài chat window → đóng
  document.addEventListener("click", (e) => {
    if (!chatOpen) return;
    const widget = document.getElementById("chatWidget");
    // composedPath giữ cả phần tử đã bị gỡ khỏi DOM (vd nút gợi ý vừa được vẽ lại sau khi bấm)
    if (widget && !e.composedPath().includes(widget)) {
      closeChat();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    processMessage(text);
  });

  suggestionsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".chat-suggestion");
    if (!btn) return;
    processMessage(btn.textContent);
  });
}
