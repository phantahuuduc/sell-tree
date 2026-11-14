// ==========================================================
// payment.js — Thanh toán: VietQR + modal chọn Ví/QR + upload ảnh CK.
// ==========================================================
import { getUser } from "./storage.js";
import { getSettings } from "./api.js";
import { formatPrice, compressImageToDataURL } from "./ui.js";

let _settings = null;
async function settings() {
  if (_settings) return _settings;
  try { _settings = await getSettings(); } catch { _settings = null; }
  return _settings || {};
}

// Tạo URL ảnh VietQR thật (quét được bằng app ngân hàng).
// Dùng dịch vụ img.vietqr.io (miễn phí, không cần key).
export async function buildVietQRUrl({ amount, addInfo = "" }) {
  const s = await settings();
  const bin = s.bankBin || "970436";          // Vietcombank
  const acc = s.bankAccountNumber || "1051236810";
  const name = s.bankAccountName || "PHAN TA HUU DUC";
  const tpl = "compact2";
  const params = new URLSearchParams();
  if (amount) params.set("amount", String(Math.round(amount)));
  if (addInfo) params.set("addInfo", addInfo);
  params.set("accountName", name);
  return `https://img.vietqr.io/image/${bin}-${acc}-${tpl}.png?${params.toString()}`;
}

async function bankInfo() {
  const s = await settings();
  return {
    bankName: s.bankName || "Vietcombank",
    accountNumber: s.bankAccountNumber || "1051236810",
    accountName: s.bankAccountName || "PHAN TA HUU DUC",
  };
}

const IMG_OK = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

// Mở modal thanh toán. Trả về Promise:
//   { method: "wallet" } | { method: "qr", proofImage: dataUrl } | null (hủy)
// options: { amount, title, addInfo, allowWallet=true, walletBalance }
export async function openPaymentModal(options) {
  const { amount, title = "Thanh toán đơn hàng", addInfo = "" } = options;
  const user = await getUser();
  // Ưu tiên số dư mới nhất do trang gọi lấy từ server (số dư trong phiên có thể cũ — vd vừa được duyệt nạp ví)
  const balance = Number(options.walletBalance ?? user?.walletBalance ?? 0);
  const canWallet = options.allowWallet !== false && balance >= amount && amount > 0;
  // Hiện tab Ví (disabled) khi user có login nhưng số dư không đủ — để KH biết là CÓ tùy chọn ví
  const showWalletDisabled = options.allowWallet !== false && !!user && !canWallet && amount > 0;
  const qrUrl = await buildVietQRUrl({ amount, addInfo });
  const bank = await bankInfo();

  return new Promise((resolve) => {
    document.getElementById("paymentModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "paymentModal";
    modal.className = "pay-overlay";
    modal.innerHTML = `
      <div class="pay-box animate__animated animate__fadeInUp animate__faster">
        <button class="pay-close" type="button" aria-label="Đóng">×</button>
        <h2 class="pay-title">${escapeHtml(title)}</h2>
        <p class="pay-amount">Số tiền: <strong>${formatPrice(amount)}</strong></p>

        <div class="pay-methods">
          ${canWallet ? `<button class="pay-method is-active" type="button" data-method="wallet">💳 Ví web<br><small>Số dư: ${formatPrice(balance)}</small></button>` : ""}
          ${showWalletDisabled ? `<button class="pay-method" type="button" data-method="wallet" disabled title="Số dư ví không đủ (${formatPrice(balance)}). Nạp thêm ở trang Hồ sơ." style="cursor:not-allowed;opacity:0.55">💳 Ví web<br><small>Số dư: ${formatPrice(balance)} — không đủ</small></button>` : ""}
          <button class="pay-method ${canWallet ? "" : "is-active"}" type="button" data-method="qr">🏦 Chuyển khoản QR</button>
        </div>

        ${canWallet ? `
        <div class="pay-pane" data-pane="wallet">
          <p>Thanh toán bằng số dư ví Lá & Sỏi. Số tiền sẽ bị trừ ngay sau khi bạn xác nhận.</p>
          <div class="pay-wallet-calc">
            <div>Số dư hiện tại: <strong>${formatPrice(balance)}</strong></div>
            <div>Sau thanh toán: <strong>${formatPrice(balance - amount)}</strong></div>
          </div>
          <button class="btn btn--primary pay-confirm-wallet" type="button">Xác nhận trả bằng ví</button>
        </div>` : ""}

        <div class="pay-pane ${canWallet ? "" : "is-shown"}" data-pane="qr" ${canWallet ? 'hidden' : ''}>
          <div class="pay-qr">
            <img src="${qrUrl}" alt="Mã QR chuyển khoản" width="240" height="300" data-fallback>
          </div>
          <div class="pay-bank">
            <div><span>Ngân hàng:</span> <strong>${escapeHtml(bank.bankName)}</strong></div>
            <div><span>Số TK:</span> <strong>${escapeHtml(bank.accountNumber)}</strong></div>
            <div><span>Chủ TK:</span> <strong>${escapeHtml(bank.accountName)}</strong></div>
            <div><span>Nội dung:</span> <strong>${escapeHtml(addInfo)}</strong></div>
          </div>
          <p class="pay-warning">📸 Vui lòng <strong>chụp màn hình lại khi đã thanh toán</strong> để nhân viên xác nhận.</p>
          <div class="pay-upload">
            <label for="payProof" class="btn btn--ghost btn--sm" style="cursor:pointer">📁 Tải ảnh chuyển khoản</label>
            <input id="payProof" type="file" accept="${IMG_OK.join(",")}" style="display:none">
            <img id="payProofPreview" class="pay-proof-preview" hidden>
          </div>
          <button class="btn btn--primary pay-confirm-qr" type="button" disabled title="Vui lòng tải ảnh chuyển khoản trước" style="cursor:not-allowed">Tôi đã thanh toán</button>
          <button class="btn btn--text pay-forgot-proof" type="button">Tôi đã chuyển khoản nhưng quên chụp ảnh</button>
          <p class="pay-note">Sau khi gửi, đơn sẽ ở trạng thái <strong>chờ nhân viên xác nhận</strong>. Hóa đơn được xuất và gửi email sau khi được duyệt.</p>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.body.classList.add("is-locked");

    let proofData = null;

    const close = (result) => {
      modal.remove();
      document.body.classList.remove("is-locked");
      resolve(result);
    };

    modal.querySelector(".pay-close").addEventListener("click", () => close(null));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(null); });

    // Chuyển phương thức
    modal.querySelectorAll(".pay-method").forEach((btn) => {
      btn.addEventListener("click", () => {
        modal.querySelectorAll(".pay-method").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const m = btn.dataset.method;
        modal.querySelectorAll(".pay-pane").forEach((p) => { p.hidden = p.dataset.pane !== m; });
      });
    });

    // Ví
    modal.querySelector(".pay-confirm-wallet")?.addEventListener("click", () => {
      close({ method: "wallet" });
    });

    // Upload ảnh CK
    const proofInput = modal.querySelector("#payProof");
    const proofPreview = modal.querySelector("#payProofPreview");
    const confirmQrBtn = modal.querySelector(".pay-confirm-qr");
    proofInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!IMG_OK.includes(file.type)) { alert("Chỉ cho phép ảnh JPG, PNG, GIF, WEBP."); e.target.value = ""; return; }
      if (file.size > 10 * 1024 * 1024) { alert("Ảnh quá lớn (tối đa 10 MB)."); e.target.value = ""; return; }
      compressImageToDataURL(file).then((data) => {
        proofData = data;
        proofPreview.src = proofData;
        proofPreview.hidden = false;
        confirmQrBtn.disabled = false;
        confirmQrBtn.title = "";
        confirmQrBtn.style.cursor = "";
      }).catch(() => { alert("Không xử lý được ảnh này, vui lòng chọn ảnh khác."); e.target.value = ""; });
    });

    confirmQrBtn.addEventListener("click", () => {
      if (!proofData) { alert("Vui lòng tải ảnh chuyển khoản trước."); return; }
      close({ method: "qr", proofImage: proofData });
    });

    modal.querySelector(".pay-forgot-proof").addEventListener("click", () => {
      const ok = confirm(
        `Không sao! Nhân viên sẽ đối soát sao kê ngân hàng theo nội dung chuyển khoản "${addInfo}" và số tiền ${formatPrice(amount)}.\n\n` +
        `Bạn có thể bổ sung ảnh sau trong mục "Đơn hàng của tôi" để được duyệt nhanh hơn.\n\nGửi đơn ngay?`
      );
      if (ok) close({ method: "qr", proofImage: "", proofMissing: true });
    });
  });
}

// Modal nạp ví: nhập số tiền → QR → upload ảnh CK. Trả về { amount, proofImage } | null.
export async function openTopupModal() {
  const bank = await bankInfo();
  return new Promise((resolve) => {
    document.getElementById("paymentModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "paymentModal";
    modal.className = "pay-overlay";
    modal.innerHTML = `
      <div class="pay-box animate__animated animate__fadeInUp animate__faster">
        <button class="pay-close" type="button" aria-label="Đóng">×</button>
        <h2 class="pay-title">Nạp tiền vào ví</h2>
        <div class="sale-form__group" style="margin-bottom:12px">
          <label for="topupAmount">Số tiền muốn nạp (VND)</label>
          <input id="topupAmount" type="number" min="10000" step="10000" value="100000" style="padding:8px 10px;border:1px solid var(--rule);border-radius:6px;width:100%;box-sizing:border-box">
        </div>
        <button class="btn btn--primary btn--sm" id="genQrBtn" type="button" style="width:100%">Tạo mã QR</button>
        <div id="topupQrArea" hidden style="margin-top:14px">
          <div class="pay-qr"><img id="topupQrImg" alt="QR nạp ví" width="240" height="300" data-fallback></div>
          <div class="pay-bank">
            <div><span>Ngân hàng:</span> <strong>${escapeHtml(bank.bankName)}</strong></div>
            <div><span>Số TK:</span> <strong>${escapeHtml(bank.accountNumber)}</strong></div>
            <div><span>Chủ TK:</span> <strong>${escapeHtml(bank.accountName)}</strong></div>
          </div>
          <p class="pay-warning">📸 Vui lòng <strong>chụp màn hình khi đã chuyển</strong> để nhân viên xác nhận cộng ví.</p>
          <div class="pay-upload">
            <label for="topupProof" class="btn btn--ghost btn--sm" style="cursor:pointer">📁 Tải ảnh chuyển khoản</label>
            <input id="topupProof" type="file" accept="${IMG_OK.join(",")}" style="display:none">
            <img id="topupProofPreview" class="pay-proof-preview" hidden>
          </div>
          <button class="btn btn--primary pay-confirm-qr" id="topupConfirm" type="button" disabled title="Vui lòng tải ảnh chuyển khoản trước" style="width:100%;cursor:not-allowed">Tôi đã chuyển khoản</button>
          <p class="pay-note">Yêu cầu nạp sẽ ở trạng thái <strong>chờ nhân viên duyệt</strong>.</p>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.body.classList.add("is-locked");

    let proofData = null;
    let amount = 0;
    const close = (r) => { modal.remove(); document.body.classList.remove("is-locked"); resolve(r); };
    modal.querySelector(".pay-close").addEventListener("click", () => close(null));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(null); });

    modal.querySelector("#genQrBtn").addEventListener("click", async () => {
      amount = Number(modal.querySelector("#topupAmount").value);
      if (!amount || amount < 10000) { alert("Số tiền tối thiểu 10.000 ₫"); return; }
      const url = await buildVietQRUrl({ amount, addInfo: `NAPVI ${Date.now().toString().slice(-5)}` });
      modal.querySelector("#topupQrImg").src = url;
      modal.querySelector("#topupQrArea").hidden = false;
    });

    const proofInput = modal.querySelector("#topupProof");
    const confirmBtn = modal.querySelector("#topupConfirm");
    proofInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!IMG_OK.includes(file.type)) { alert("Chỉ cho phép ảnh."); e.target.value = ""; return; }
      if (file.size > 10 * 1024 * 1024) { alert("Ảnh quá lớn (tối đa 10 MB)."); e.target.value = ""; return; }
      compressImageToDataURL(file).then((data) => {
        proofData = data;
        modal.querySelector("#topupProofPreview").src = proofData;
        modal.querySelector("#topupProofPreview").hidden = false;
        confirmBtn.disabled = false;
        confirmBtn.title = "";
        confirmBtn.style.cursor = "";
      }).catch(() => { alert("Không xử lý được ảnh này, vui lòng chọn ảnh khác."); e.target.value = ""; });
    });

    confirmBtn.addEventListener("click", () => {
      if (!proofData) { alert("Vui lòng tải ảnh chuyển khoản."); return; }
      close({ amount, proofImage: proofData });
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
