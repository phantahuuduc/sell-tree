// ==========================================================
// login.js — Logic đăng nhập (ĐÃ SỬA TẤT CẢ LỖI TRONG MỤC 8)
// Lỗi #1: Đã sửa từ /user -> /users
// Lỗi #2: Đăng nhập bằng email + password
// Lỗi #3: Xóa password trước khi lưu vào localStorage
// Lỗi #5: Bọc try/catch xử lý lỗi mạng
// ==========================================================
import { findUserByCredentials, isNetworkError } from "./api.js";
import { setUser } from "./storage.js";
import { initPage, showToast, delay } from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initPage();

  // Animation on load
  const card = document.querySelector(".auth__card");
  if (card) card.classList.add("animate__animated", "animate__fadeInUp");
  const visual = document.querySelector(".auth__visual");
  if (visual) visual.classList.add("animate__animated", "animate__fadeIn");

  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const summary = document.getElementById("formSummary");
  const submitBtn = document.getElementById("submitBtn");

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

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let hasError = false;

    if (!email) {
      showError(emailInput, document.getElementById("emailError"), "Vui lòng nhập email.");
      hasError = true;
    }
    if (!password) {
      showError(passwordInput, document.getElementById("passwordError"), "Vui lòng nhập mật khẩu.");
      hasError = true;
    }

    if (hasError) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Đang kiểm tra...";

    try {
      // Lỗi #1 & #2: Gọi /users với email + password
      const users = await findUserByCredentials(email, password);

      if (!users || users.length === 0) {
        if (summary) {
          summary.hidden = false;
          summary.textContent = "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.";
        }
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng nhập";
        return;
      }

      const user = users[0];

      // Chặn đăng nhập nếu tài khoản bị admin khóa
      if (user.locked) {
        if (summary) {
          summary.hidden = false;
          summary.textContent = "Tài khoản này đã bị khóa. Vui lòng liên hệ quản trị viên.";
        }
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng nhập";
        return;
      }

      // Lỗi #3: Xóa password khỏi object trước khi lưu vào localStorage
      const { password: _pw, resetOtpHash: _h, resetOtpExpiry: _e, resetOtpAttempts: _a, resetOtpSentAt: _s, resetToken: _t, resetTokenExpiry: _te, ...safeUser } = user;
      await setUser(safeUser);

      showToast(`Chào mừng ${safeUser.name} quay trở lại!`);

      // Quay lại trang trước đó nếu bị chuyển hướng từ addToCart
      const redirect = sessionStorage.getItem("redirectAfterLogin");
      sessionStorage.removeItem("redirectAfterLogin");

      // Admin/nhân viên luôn vào trang của đúng vai trò. Redirect cũ có thể do
      // tài khoản KHÁC để lại (vd nhân viên đăng xuất ở staff.html rồi admin đăng nhập).
      let target = "index.html";
      if (safeUser.role === "admin") target = "admin.html";
      else if (safeUser.role === "staff") target = "staff.html";
      else if (redirect && !/(admin|staff)\.html/i.test(redirect)) target = redirect;

      await delay(500);
      window.location.href = target;
    } catch (err) {
      console.error("Lỗi đăng nhập:", err);
      if (summary) {
        summary.hidden = false;
        summary.textContent = isNetworkError(err)
          ? "Không thể kết nối đến máy chủ. Vui lòng bật JSON-Server (port 3000)."
          : `Lỗi đăng nhập: ${err.message}`;
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Đăng nhập";
    }
  });
});
