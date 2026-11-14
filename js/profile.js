// ==========================================================
// profile.js — Trang hồ sơ người dùng:
// thông tin + avatar, đổi mật khẩu, ví, yêu thích.
// ==========================================================
import { getUser, setUser } from "./storage.js";
import { getUserById, updateUser, getWalletTransactions, createWalletTransaction, getProducts } from "./api.js";
import { openTopupModal } from "./payment.js";
import {
  initPage, showToast, escapeHTML, formatPrice, compressImageToDataURL,
  checkPasswordStrength, attachPasswordStrengthMeter, renderProductCard, attachImageFallback,
  normalizePhone, isValidPhone,
} from "./ui.js";

let currentUser = null;

await initPage();

// Guard: phải đăng nhập
const sessUser = await getUser();
if (!sessUser) {
  sessionStorage.setItem("redirectAfterLogin", window.location.href);
  window.location.href = "login.html";
} else {
  // Lấy dữ liệu mới nhất từ server (đề phòng đã đổi ở nơi khác)
  currentUser = (await getUserById(sessUser.id).catch(() => null)) || sessUser;
  initTabs();
  renderInfo();
  initInfoForm();
  initAvatarUpload();
  initPasswordForm();
  loadWallet();
  loadFavorites();
  import("./chat.js").then((m) => m.initCustomerChat()).catch(() => {});
}

/* ---------- Tabs ---------- */
function initTabs() {
  const tabs = document.querySelectorAll("[data-profile-tab]");
  const panels = {
    info: document.getElementById("panelInfo"),
    password: document.getElementById("panelPassword"),
    wallet: document.getElementById("panelWallet"),
    favorites: document.getElementById("panelFavorites"),
  };
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");
      const target = btn.dataset.profileTab;
      Object.entries(panels).forEach(([k, el]) => { if (el) el.hidden = k !== target; });
    });
  });
}

/* ---------- Thông tin + avatar ---------- */
function renderInfo() {
  document.getElementById("pf_name").value = currentUser.name || "";
  document.getElementById("pf_email").value = currentUser.email || "";
  document.getElementById("pf_phone").value = currentUser.phone || "";
  document.getElementById("pf_address").value = currentUser.address || "";
  const roleLabel = { admin: "Quản trị viên", staff: "Nhân viên", user: "Khách hàng" }[currentUser.role] || currentUser.role;
  document.getElementById("pf_role").value = roleLabel;
  const avatar = document.getElementById("avatarPreview");
  if (currentUser.avatar) avatar.src = currentUser.avatar;
}

function initInfoForm() {
  document.getElementById("infoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const patch = {
      name: document.getElementById("pf_name").value.trim(),
      phone: normalizePhone(document.getElementById("pf_phone").value),
      address: document.getElementById("pf_address").value.trim(),
    };
    if (!patch.name) { showToast("Vui lòng nhập họ tên", { icon: "alert" }); return; }
    if (patch.phone && !isValidPhone(patch.phone)) {
      showToast("Số điện thoại gồm 10 số, bắt đầu bằng 0 (ví dụ: 0908 123 456).", { icon: "alert" });
      document.getElementById("pf_phone").focus();
      return;
    }
    try {
      await updateUser(currentUser.id, patch);
      currentUser = { ...currentUser, ...patch };
      await setUser(currentUser); // cập nhật session để header/nơi khác dùng tên mới
      showToast("✓ Đã lưu thông tin");
      // cập nhật header
      const { renderHeaderUser } = await import("./ui.js");
      await renderHeaderUser();
    } catch (err) {
      showToast("Lỗi lưu: " + err.message, { icon: "alert" });
    }
  });
}

function initAvatarUpload() {
  const fileInput = document.getElementById("avatarFile");
  const preview = document.getElementById("avatarPreview");
  const okTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!okTypes.includes(file.type)) {
      alert(`❌ Chỉ cho phép ảnh JPG, PNG, GIF, WEBP.`);
      e.target.value = ""; return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert(`❌ Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(2)} MB). Tối đa 10 MB.`);
      e.target.value = ""; return;
    }
    try {
      const dataUrl = await compressImageToDataURL(file, { maxChars: 60000, maxSide: 400 });
      preview.src = dataUrl;
      await updateUser(currentUser.id, { avatar: dataUrl });
      currentUser = { ...currentUser, avatar: dataUrl };
      await setUser(currentUser);
      showToast("✓ Đã cập nhật ảnh đại diện");
      const { renderHeaderUser } = await import("./ui.js");
      await renderHeaderUser();
    } catch (err) {
      showToast("Lỗi lưu ảnh: " + err.message, { icon: "alert" });
    }
  });
}

/* ---------- Đổi mật khẩu ---------- */
function initPasswordForm() {
  const oldI = document.getElementById("pw_old");
  const newI = document.getElementById("pw_new");
  const confirmI = document.getElementById("pw_confirm");
  const msg = document.getElementById("pwMsg");

  attachPasswordStrengthMeter(newI, document.querySelector("#panelPassword .pw-meter__bar"), document.getElementById("pwStrengthText"));

  document.getElementById("passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.style.color = "";

    // Lấy mật khẩu hiện tại từ server (đề phòng session không có password)
    const fresh = await getUserById(currentUser.id).catch(() => currentUser);
    if (oldI.value !== fresh.password) {
      msg.textContent = "Mật khẩu hiện tại không đúng.";
      msg.style.color = "#c0392b"; return;
    }
    const strength = checkPasswordStrength(newI.value);
    if (!strength.ok) {
      msg.textContent = `Mật khẩu mới quá yếu. Cần: ${strength.issues.join(", ")}.`;
      msg.style.color = "#c0392b"; return;
    }
    if (newI.value === oldI.value) {
      msg.textContent = "Mật khẩu mới phải khác mật khẩu cũ.";
      msg.style.color = "#c0392b"; return;
    }
    if (newI.value !== confirmI.value) {
      msg.textContent = "Xác nhận mật khẩu không khớp.";
      msg.style.color = "#c0392b"; return;
    }
    try {
      await updateUser(currentUser.id, { password: newI.value });
      currentUser.password = newI.value;
      msg.textContent = "✓ Đổi mật khẩu thành công!";
      msg.style.color = "#2E5E3A";
      oldI.value = newI.value = confirmI.value = "";
      document.querySelector("#panelPassword .pw-meter__bar").className = "pw-meter__bar pw-meter__bar--empty";
      document.getElementById("pwStrengthText").textContent = "";
      showToast("✓ Đã đổi mật khẩu");
    } catch (err) {
      msg.textContent = "Lỗi: " + err.message;
      msg.style.color = "#c0392b";
    }
  });
}

/* ---------- Ví ---------- */
const TX_LABEL = {
  topup: "Nạp ví",
  payment: "Thanh toán đơn",
  refund: "Hoàn tiền",
};
const TX_STATUS = {
  pending: `<span class="chip chip--mid">Chờ duyệt</span>`,
  confirmed: `<span class="chip chip--active">Thành công</span>`,
  rejected: `<span class="chip chip--alert">Từ chối</span>`,
};

async function loadWallet() {
  document.getElementById("walletBalance").textContent = formatPrice(currentUser.walletBalance || 0);

  const box = document.getElementById("walletHistory");
  const txs = await getWalletTransactions({ userId: currentUser.id }).catch(() => []);
  if (!txs.length) {
    box.innerHTML = `<p class="muted">Chưa có giao dịch nào.</p>`;
  } else {
    const rows = txs
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((t) => {
        const sign = t.type === "payment" ? "−" : "+";
        const color = t.type === "payment" ? "#c0392b" : "#2E5E3A";
        return `
          <tr>
            <td>${new Date(t.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
            <td>${escapeHTML(TX_LABEL[t.type] || t.type)}</td>
            <td style="color:${color};font-weight:600">${sign}${formatPrice(t.amount)}</td>
            <td>${TX_STATUS[t.status] || escapeHTML(t.status)}</td>
            <td>${escapeHTML(t.note || "")}</td>
          </tr>`;
      }).join("");
    box.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Thời gian</th><th>Loại</th><th>Số tiền</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Nút nạp ví — mở modal QR + upload ảnh → tạo yêu cầu chờ nhân viên duyệt
  document.getElementById("btnTopup").addEventListener("click", async () => {
    const result = await openTopupModal();
    if (!result) return;
    try {
      await createWalletTransaction({
        userId: String(currentUser.id),
        type: "topup",
        amount: result.amount,
        status: "pending",
        proofImage: result.proofImage,
        note: "Nạp ví qua chuyển khoản",
        createdAt: new Date().toISOString(),
      });
      showToast("✓ Đã gửi yêu cầu nạp ví. Chờ nhân viên xác nhận.");
      loadWallet();
    } catch (err) {
      showToast("Lỗi tạo yêu cầu nạp: " + err.message, { icon: "alert" });
    }
  });
}

/* ---------- Yêu thích ---------- */
async function loadFavorites() {
  const box = document.getElementById("favoritesList");
  const favIds = Array.isArray(currentUser.favorites) ? currentUser.favorites.map(String) : [];
  if (!favIds.length) {
    box.innerHTML = `<p class="muted">Bạn chưa có sản phẩm yêu thích nào. Bấm ❤ trên sản phẩm để lưu.</p>`;
    return;
  }
  const products = await getProducts().catch(() => []);
  const favs = products.filter((p) => favIds.includes(String(p.id)));
  if (!favs.length) {
    box.innerHTML = `<p class="muted">Sản phẩm yêu thích không còn tồn tại.</p>`;
    return;
  }
  box.innerHTML = `<ul class="product-grid">${favs.map((p) => `<li>${renderProductCard(p)}</li>`).join("")}</ul>`;
  attachImageFallback(box);
}
