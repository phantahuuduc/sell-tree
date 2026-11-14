// ==========================================================
// email.js — Lớp gửi email trung tâm.
// Luôn lưu vào "mailbox" (json-server) để xem/kiểm chứng.
// Nếu admin đã cấu hình EmailJS (publicKey + serviceId + templateId)
// và SDK emailjs đã nạp → gửi email THẬT về Gmail người dùng.
// Dùng chung cho: quên mật khẩu, đổi trạng thái đơn, có hàng lại, sale...
// ==========================================================
import { createMail, getSettings } from "./api.js";

const EMAILJS_SDK = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js";
let _settingsCache = null;
let _sdkPromise = null;

async function cfg() {
  if (_settingsCache) return _settingsCache;
  try { _settingsCache = await getSettings(); } catch { _settingsCache = null; }
  return _settingsCache;
}

// Nạp SDK EmailJS 1 lần (chèn thẻ <script>), trả về window.emailjs khi sẵn sàng.
function loadEmailJsSdk() {
  if (window.emailjs) return Promise.resolve(window.emailjs);
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EMAILJS_SDK;
    s.async = true;
    s.onload = () => (window.emailjs ? resolve(window.emailjs) : reject(new Error("emailjs không khởi tạo")));
    s.onerror = () => reject(new Error("Không tải được SDK EmailJS"));
    document.head.appendChild(s);
  });
  return _sdkPromise;
}

// Cho phép module khác (admin "gửi thử") làm mới cache cài đặt sau khi lưu khóa
export function clearSettingsCache() { _settingsCache = null; }

// secret: chuỗi bí mật (vd mã OTP) — gửi thật trong email nhưng được che trong bản lưu mailbox (db.json ai cũng đọc được)
export async function sendEmail({ to, toUserId = null, subject, body, type = "general", secret = "" }) {
  const redact = (s) => (secret ? String(s).split(secret).join("••••••") : s);
  const mail = {
    to,
    toUserId: toUserId ? String(toUserId) : null,
    subject: redact(subject),
    body: redact(body),
    type,
    createdAt: new Date().toISOString(),
    sentVia: "mailbox",
    read: false,
  };

  // Gửi thật qua EmailJS nếu đã cấu hình (tự nạp SDK khi cần)
  try {
    const s = await cfg();
    if (s?.emailjsPublicKey && s?.emailjsServiceId && s?.emailjsTemplateId) {
      const emailjs = await loadEmailJsSdk();
      await emailjs.send(
        s.emailjsServiceId,
        s.emailjsTemplateId,
        { to_email: to, subject, message: body, shop_name: s.shopName || "Lá & Sỏi" },
        { publicKey: s.emailjsPublicKey }
      );
      mail.sentVia = "emailjs";
    }
  } catch (err) {
    console.warn("EmailJS gửi lỗi, chỉ lưu vào hộp thư:", err?.message);
  }

  // Luôn lưu bản sao vào mailbox
  try { await createMail(mail); } catch (err) { console.warn("Lưu mailbox lỗi:", err?.message); }
  return mail;
}

// true nếu EmailJS đã được cấu hình đầy đủ (dùng để quyết định ẩn/hiện link demo)
export async function emailjsConfigured() {
  const s = await cfg();
  return !!(s?.emailjsPublicKey && s?.emailjsServiceId && s?.emailjsTemplateId);
}
