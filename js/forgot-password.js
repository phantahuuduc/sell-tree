// ==========================================================
// forgot-password.js — Quên mật khẩu bằng mã OTP gửi qua email.
// Bước 1: email → tạo mã 6 số (hiệu lực 10 phút), lưu dạng băm SHA-256 trên user.
// Bước 2: nhập mã — sai tối đa 5 lần thì mã bị hủy; gửi lại sau 60 giây.
// Bước 3: đặt mật khẩu mới (kiểm tra lại mã trước khi lưu) + email thông báo.
// ==========================================================
import { findUserByEmail, getUserById, updateUser } from "./api.js";
import { initPage, showToast, checkPasswordStrength, attachPasswordStrengthMeter, delay } from "./ui.js";
import { sendEmail, emailjsConfigured } from "./email.js";

await initPage();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 60;

const $ = (id) => document.getElementById(id);
const forms = { 1: $("forgotForm"), 2: $("otpForm"), 3: $("newPwForm") };
const boxes = Array.from(document.querySelectorAll("#otpBoxes input"));

let state = { email: "", userId: null, otp: "" };
let resendTimer = null;

function goStep(n) {
  Object.entries(forms).forEach(([k, f]) => { f.hidden = Number(k) !== n; });
  document.querySelectorAll("[data-step-dot]").forEach((li) => {
    const s = Number(li.dataset.stepDot);
    li.classList.toggle("is-active", s === n);
    li.classList.toggle("is-done", s < n);
  });
  $("formSummary").hidden = true;
}

function newOtp() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

// Băm kèm id user để cùng 1 mã ở 2 tài khoản cho ra 2 giá trị khác nhau
async function hashOtp(otp, userId) {
  const data = new TextEncoder().encode(`${userId}:${otp}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function maskEmail(email) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const shown = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(1, name.length - shown.length))}@${domain}`;
}

function startResendCountdown(seconds) {
  const btn = $("resendBtn");
  const label = $("resendTimer");
  clearInterval(resendTimer);
  let left = seconds;
  btn.disabled = true;
  label.textContent = `(${left}s)`;
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendTimer);
      btn.disabled = false;
      label.textContent = "";
    } else {
      label.textContent = `(${left}s)`;
    }
  }, 1000);
}

// Tạo + gửi mã. Không báo email có tồn tại hay không (chống dò tài khoản).
async function issueOtp(email) {
  const matches = await findUserByEmail(email);
  const user = Array.isArray(matches) ? matches.find((u) => String(u.email).toLowerCase() === email.toLowerCase()) : null;
  state = { email, userId: user?.id ?? null, otp: "" };
  if (!user) return { sent: false };

  // Chặn spam gửi lại (kiểm tra theo dữ liệu trên server, không chỉ nút bấm)
  if (user.resetOtpSentAt) {
    const wait = RESEND_COOLDOWN_S - Math.floor((Date.now() - new Date(user.resetOtpSentAt)) / 1000);
    if (wait > 0) return { sent: false, wait };
  }

  const otp = newOtp();
  await updateUser(user.id, {
    resetOtpHash: await hashOtp(otp, user.id),
    resetOtpExpiry: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    resetOtpAttempts: 0,
    resetOtpSentAt: new Date().toISOString(),
  });

  await sendEmail({
    to: user.email,
    toUserId: user.id,
    subject: `Mã xác nhận đặt lại mật khẩu: ${otp} — Lá & Sỏi`,
    body:
      `Xin chào ${user.name},\n\n` +
      `Mã xác nhận đặt lại mật khẩu tài khoản Lá & Sỏi của bạn là:\n\n` +
      `        ${otp}\n\n` +
      `Mã có hiệu lực trong 10 phút và chỉ dùng được một lần. Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên shop.\n\n` +
      `Nếu không phải bạn yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn an toàn.`,
    type: "password_reset_otp",
    secret: otp,
  });
  return { sent: true, otp };
}

async function showOtpStep({ sent, otp, wait }) {
  goStep(2);
  boxes.forEach((b) => { b.value = ""; });
  $("otpError").textContent = "";
  $("otpIntro").innerHTML = `Nếu <strong>${escapeHtml(maskEmail(state.email))}</strong> đã đăng ký, mã gồm <strong>6 số</strong> vừa được gửi tới email này (hiệu lực 10 phút). Kiểm tra cả mục Spam/Quảng cáo.`;
  $("otpDemo").innerHTML = "";
  if (sent && otp && !(await emailjsConfigured())) {
    // Chế độ demo khi chưa cấu hình EmailJS: hiện mã để test được luồng
    $("otpDemo").innerHTML = `<p class="otp-demo">⚙️ Chế độ demo (chưa cấu hình EmailJS) — mã của bạn: <strong>${otp}</strong></p>`;
  }
  if (wait) $("otpError").textContent = `Mã vừa được gửi gần đây. Vui lòng dùng mã đã nhận hoặc chờ ${wait} giây để gửi lại.`;
  startResendCountdown(wait || RESEND_COOLDOWN_S);
  boxes[0].focus();
}

// ---------- Bước 1 ----------
forms[1].addEventListener("submit", async (e) => {
  e.preventDefault();
  $("emailError").textContent = "";
  const email = $("email").value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $("emailError").textContent = "Vui lòng nhập email hợp lệ.";
    return;
  }
  const btn = $("submitBtn");
  btn.disabled = true; btn.textContent = "Đang gửi mã...";
  try {
    await showOtpStep(await issueOtp(email));
  } catch (err) {
    console.error(err);
    $("emailError").textContent = "Không gửi được mã: " + err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Gửi mã xác nhận";
  }
});

// ---------- Bước 2: ô nhập OTP (tự nhảy ô, dán cả mã) ----------
boxes.forEach((box, i) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(-1);
    if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    if (boxes.every((b) => b.value)) forms[2].requestSubmit();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
  });
  box.addEventListener("paste", (e) => {
    const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    digits.split("").forEach((d, k) => { if (boxes[k]) boxes[k].value = d; });
    boxes[Math.min(digits.length, 5)].focus();
    if (digits.length === 6) forms[2].requestSubmit();
  });
});

// Kiểm tra mã với dữ liệu trên server. countAttempt=false khi kiểm tra lại ở bước 3.
async function verifyOtp(otp, countAttempt = true) {
  if (!state.userId) return { ok: false, msg: "Mã xác nhận không đúng." };
  const user = await getUserById(state.userId);
  if (!user?.resetOtpHash) return { ok: false, msg: "Mã đã được dùng hoặc đã bị hủy. Vui lòng gửi lại mã mới.", dead: true };
  if (new Date(user.resetOtpExpiry) < new Date()) return { ok: false, msg: "Mã đã hết hạn (quá 10 phút). Vui lòng gửi lại mã mới.", dead: true };
  const attempts = Number(user.resetOtpAttempts) || 0;
  if (attempts >= MAX_ATTEMPTS) return { ok: false, msg: "Bạn đã nhập sai quá 5 lần. Vui lòng gửi lại mã mới.", dead: true };

  if ((await hashOtp(otp, user.id)) === user.resetOtpHash) return { ok: true, user };

  if (countAttempt) {
    const used = attempts + 1;
    const left = MAX_ATTEMPTS - used;
    // Sai đủ 5 lần → hủy mã ngay
    await updateUser(user.id, left > 0 ? { resetOtpAttempts: used } : { resetOtpAttempts: used, resetOtpHash: "" });
    return { ok: false, msg: left > 0 ? `Mã không đúng. Bạn còn ${left} lần thử.` : "Bạn đã nhập sai 5 lần, mã đã bị hủy. Vui lòng gửi lại mã mới.", dead: left <= 0 };
  }
  return { ok: false, msg: "Mã xác nhận không còn hợp lệ." };
}

forms[2].addEventListener("submit", async (e) => {
  e.preventDefault();
  const otp = boxes.map((b) => b.value).join("");
  $("otpError").textContent = "";
  if (otp.length !== 6) { $("otpError").textContent = "Vui lòng nhập đủ 6 số."; return; }
  const btn = $("otpBtn");
  btn.disabled = true; btn.textContent = "Đang kiểm tra...";
  try {
    const r = await verifyOtp(otp);
    if (!r.ok) {
      $("otpError").textContent = r.msg;
      boxes.forEach((b) => { b.value = ""; });
      boxes[0].focus();
      if (r.dead) { clearInterval(resendTimer); $("resendBtn").disabled = false; $("resendTimer").textContent = ""; }
      return;
    }
    state.otp = otp;
    goStep(3);
    $("newPwIntro").textContent = `Mã chính xác ✓ Đặt mật khẩu mới cho tài khoản ${r.user.email}.`;
    $("newPassword").focus();
  } catch (err) {
    $("otpError").textContent = "Lỗi: " + err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Xác nhận mã";
  }
});

$("resendBtn").addEventListener("click", async () => {
  $("resendBtn").disabled = true;
  try {
    const r = await issueOtp(state.email);
    await showOtpStep(r);
    if (r.sent) showToast("✓ Đã gửi mã mới. Mã cũ không còn dùng được.");
  } catch (err) {
    $("otpError").textContent = "Không gửi lại được mã: " + err.message;
    $("resendBtn").disabled = false;
  }
});

$("changeEmailBtn").addEventListener("click", () => {
  clearInterval(resendTimer);
  state = { email: "", userId: null, otp: "" };
  goStep(1);
  $("email").focus();
});

// ---------- Bước 3: mật khẩu mới ----------
attachPasswordStrengthMeter($("newPassword"), document.querySelector(".pw-meter__bar"), $("pwStrengthText"));

forms[3].addEventListener("submit", async (e) => {
  e.preventDefault();
  $("pwError").textContent = "";
  $("confirmError").textContent = "";
  const pw = $("newPassword").value;
  const strength = checkPasswordStrength(pw);
  if (!strength.ok) { $("pwError").textContent = `Mật khẩu quá yếu. Cần: ${strength.issues.join(", ")}.`; return; }
  if (pw !== $("confirmPassword").value) { $("confirmError").textContent = "Xác nhận mật khẩu không khớp."; return; }

  const btn = $("newPwBtn");
  btn.disabled = true; btn.textContent = "Đang cập nhật...";
  try {
    // Kiểm tra lại mã (còn hạn, chưa bị dùng) ngay trước khi đổi
    const r = await verifyOtp(state.otp, false);
    if (!r.ok) {
      goStep(2);
      $("otpError").textContent = r.msg;
      return;
    }
    if (pw === r.user.password) { $("pwError").textContent = "Mật khẩu mới phải khác mật khẩu cũ."; return; }

    await updateUser(r.user.id, {
      password: pw,
      resetOtpHash: "", resetOtpExpiry: "", resetOtpAttempts: 0, resetOtpSentAt: "",
      resetToken: "", resetTokenExpiry: "",
      passwordChangedAt: new Date().toISOString(),
    });
    // Email báo đổi mật khẩu thành công (để chủ tài khoản phát hiện nếu không phải họ)
    sendEmail({
      to: r.user.email,
      toUserId: r.user.id,
      subject: "Mật khẩu tài khoản Lá & Sỏi đã được thay đổi",
      body:
        `Xin chào ${r.user.name},\n\n` +
        `Mật khẩu tài khoản Lá & Sỏi của bạn vừa được đặt lại lúc ${new Date().toLocaleString("vi-VN")}.\n\n` +
        `Nếu không phải bạn thực hiện, hãy liên hệ shop ngay để được hỗ trợ khóa tài khoản.`,
      type: "password_changed",
    }).catch(() => {});

    showToast("✓ Đặt lại mật khẩu thành công! Đang chuyển sang đăng nhập...");
    await delay(1300);
    window.location.href = "login.html";
  } catch (err) {
    $("pwError").textContent = "Lỗi: " + err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Đặt lại mật khẩu";
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
