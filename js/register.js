// ==========================================================
// register.js — Logic đăng ký (ĐÃ SỬA TẤT CẢ LỖI TRONG MỤC 8)
// Lỗi #1: Gọi /users thay vì /user
// Lỗi #4: Sau đăng ký chuyển về login.html (không phải index.html)
// Lỗi #5: Bọc try/catch xử lý lỗi mạng
// ==========================================================
import { findUserByEmail, createUser, isNetworkError } from "./api.js";
import { initPage, showToast, delay, checkPasswordStrength, attachPasswordStrengthMeter, normalizePhone, isValidPhone } from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initPage();

  // Animation on load
  const card = document.querySelector(".auth__card");
  if (card) card.classList.add("animate__animated", "animate__fadeInUp");
  const visual = document.querySelector(".auth__visual");
  if (visual) visual.classList.add("animate__animated", "animate__fadeIn");

  const form = document.getElementById("registerForm");
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const addressInput = document.getElementById("address");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");
  const summary = document.getElementById("formSummary");
  const submitBtn = document.getElementById("submitBtn");

  // Thanh đo độ mạnh mật khẩu realtime
  attachPasswordStrengthMeter(
    passwordInput,
    document.querySelector(".pw-meter__bar"),
    document.getElementById("pwStrengthText")
  );

  function showError(input, errorEl, msg) {
    if (input) input.closest(".field")?.classList.add("has-error");
    if (errorEl) errorEl.textContent = msg;
  }

  function clearErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("has-error"));
    form.querySelectorAll(".field__error").forEach((e) => (e.textContent = ""));
    if (summary) {
      summary.hidden = true;
      summary.textContent = "";
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase(); // lưu email viết thường để đăng nhập không phân biệt hoa / thường
    const phone = normalizePhone(phoneInput?.value || "");
    const address = addressInput?.value.trim() || "";
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    let hasError = false;

    if (!name) {
      showError(nameInput, document.getElementById("nameError"), "Vui lòng nhập họ tên.");
      hasError = true;
    }
    if (!email) {
      showError(emailInput, document.getElementById("emailError"), "Vui lòng nhập email.");
      hasError = true;
    } else if (!emailRegex.test(email)) {
      showError(emailInput, document.getElementById("emailError"), "Email không đúng định dạng (ví dụ: an@gmail.com).");
      hasError = true;
    }

    if (phone && !isValidPhone(phone)) {
      showError(phoneInput, document.getElementById("phoneError"), "Số điện thoại gồm 10 số, bắt đầu bằng 0 (ví dụ: 0908 123 456).");
      hasError = true;
    }

    if (!password) {
      showError(passwordInput, document.getElementById("passwordError"), "Vui lòng tạo mật khẩu.");
      hasError = true;
    } else {
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        showError(passwordInput, document.getElementById("passwordError"),
          `Mật khẩu quá yếu. Cần: ${strength.issues.join(", ")}.`);
        hasError = true;
      }
    }

    if (!confirmPassword) {
      showError(confirmInput, document.getElementById("confirmError"), "Vui lòng nhập lại mật khẩu.");
      hasError = true;
    } else if (confirmPassword !== password) {
      showError(confirmInput, document.getElementById("confirmError"), "Mật khẩu xác nhận không trùng khớp.");
      hasError = true;
    }

    if (hasError) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Đang xử lý...";

    try {
      // Lỗi #1: Lấy danh sách user theo email từ /users
      const existing = await findUserByEmail(email);

      if (existing && existing.length > 0) {
        showError(emailInput, document.getElementById("emailError"), "Email này đã được sử dụng. Vui lòng đăng nhập.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng ký";
        return;
      }

      // Tạo user mới với role "user" + createdAt ISO + đầy đủ field
      await createUser({
        name,
        email,
        password,
        role: "user",
        createdAt: new Date().toISOString(),
        phone,
        address,
        avatar: "",
        walletBalance: 0,
        favorites: [],
      });

      showToast("Đăng ký tài khoản thành công! Đang chuyển hướng sang Đăng nhập...");

      // Lỗi #4: Chuyển về login.html để đăng nhập
      await delay(1200);
      window.location.href = "login.html";
    } catch (err) {
      console.error("Lỗi đăng ký:", err);
      if (summary) {
        summary.hidden = false;
        summary.textContent = isNetworkError(err)
          ? "Không thể kết nối đến máy chủ. Vui lòng bật JSON-Server (port 3000)."
          : `Lỗi đăng ký: ${err.message}`;
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Đăng ký";
    }
  });
});
