# 🌿 Lá & Sỏi — Tiệm Cây Cảnh & Sen Đá

> **Bài thi cuối kỳ — Lập trình Web Client**
> Website thương mại điện tử bán cây cảnh & sen đá, dựng bằng **Vanilla JavaScript ES Modules** + **json-server**, không framework.

---

## 1. Giới thiệu đề tài

**Lá & Sỏi** là một website thương mại điện tử hoàn chỉnh cho một tiệm cây cảnh, lấy cảm hứng từ phong cách **"phiếu tiêu bản thực vật"** (herbarium sheet) — sạch sẽ, mộc mạc, giàu thông tin. Dự án được xây dựng để **thể hiện toàn bộ kiến thức lập trình Web Client**: HTML ngữ nghĩa, CSS hệ thống token, JavaScript ES Modules, REST API, LocalStorage/SessionStorage, 3D với Three.js, xuất PDF/Excel, gửi email thật, thanh toán QR và nhiều hiệu ứng tương tác.

### 🎯 Mục tiêu
- Dựng một website bán hàng **đủ 3 phía**: Khách hàng · Nhân viên · Quản trị.
- Chỉ dùng **Vanilla JS** (không React/Vue/framework), không build step.
- Đủ nghiệp vụ thực tế: giỏ hàng, thanh toán, hóa đơn, ví điện tử, chat realtime, thông báo, audit log.
- Giao diện đẹp, có hiệu ứng **Three.js**, responsive, light/dark theme.

### 🌟 Điểm nhấn
| Mảng | Nội dung |
|---|---|
| **UI/UX** | Thiết kế tông ấm (paper + xanh rêu), pill buttons, frosted header, footer xanh sâu, hiệu ứng hover "nhãn tiêu bản" hiện tên khoa học |
| **3D & Animation** | 4 hiệu ứng Three.js: particle field (hero), floating leaves (nền), topo field (quiz), banner particles (tuyết Giáng Sinh / lấp lánh vàng) |
| **Thanh toán** | QR **VietQR thật** (Vietcombank) + Ví web; nhân viên duyệt thủ công từng đơn QR có ảnh chuyển khoản |
| **Gmail thật** | Tích hợp **EmailJS** — gửi hóa đơn, thông báo, link reset mật khẩu qua Gmail (có fallback mailbox mô phỏng) |
| **Realtime** | Chat khách ↔ nhân viên polling 2.5s, chuông thông báo 🔔 poll 10s |
| **Tài liệu** | PDF hóa đơn (jsPDF + font Việt), Excel báo cáo (SheetJS), Chart.js dashboards |
| **Vòng đời đơn** | Một bộ luật duy nhất (`order-flow.js`) cho giao hàng · khiếu nại chưa nhận · hủy · hoàn hàng 7 ngày · hoàn tiền vào ví · tự hoàn tất sau N ngày (nhắc khách trước 24 giờ) |
| **Giao hàng minh bạch** | Bắt buộc địa chỉ + SĐT người nhận khi đặt · **dự kiến giao** tính theo lịch làm việc của shop (giờ chốt, ngày chuẩn bị, ngày vận chuyển, bỏ Chủ nhật / ngày nghỉ) và giải thích cách tính cho khách · nhân viên **hẹn ngày giao** và báo **"Sắp tới bạn"** · thanh tiến trình đơn có xe chạy |
| **Bán chạy** | "Bảng tin của tiệm": tối đa 3 cây được khách thương nhất, không cắt ngang nhóm bán bằng nhau; chưa phân được hạng thì thành "Tiệm chọn giúp bạn" |
| **An toàn dữ liệu** | Tồn kho tính chung mọi size, kiểm tra lại lúc đặt · **mỗi đơn chỉ ghi đúng một lần** (mã riêng do trình duyệt sinh, tra theo mã trước khi gửi lại) · thanh toán ví theo thứ tự tạo đơn → trừ ví → đánh dấu đã thanh toán · hàng đợi ghi · json-server 0.17.4 không `--watch` |
| **Minh bạch** | **Audit log** mọi thao tác nhạy cảm của nhân viên; mỗi đơn có **lịch sử từng bước** (ai · lúc nào · lý do) cho cả khách lẫn shop |
| **Hiệu ứng vi mô** | Ảnh **bay vào giỏ** theo đường cong · tim nảy + hạt tim · tick vẽ dần + confetti khi đặt hàng · ripple nút · chuyển trang mờ dần · toast có thanh thời gian — viết tay bằng CSS/JS, tôn trọng `prefers-reduced-motion` |
| **Tự cập nhật** | Màn hình đơn hàng (khách & nhân viên) tự làm mới khi dữ liệu đổi — không phải F5 |
| **Tự động theo lịch** | Banner Giáng Sinh / Tết tự bật đúng dịp; sản phẩm "Mới về" tự hết hạn sau 30 ngày; KH mới < 1 tháng được sale |

### 👥 Vai trò & tính năng

| Vai trò | Tính năng chính |
|---|---|
| **Khách vãng lai** | Duyệt sản phẩm · tìm kiếm · lọc · xem chi tiết · hỏi chatbot FAQ |
| **Khách hàng** | Mua hàng · nhập địa chỉ giao · thanh toán QR/Ví · nạp ví · hóa đơn PDF · **theo dõi & xử lý đơn** (dự kiến giao, "Sắp tới bạn", hủy, xác nhận đã nhận, báo chưa nhận, yêu cầu hoàn hàng) · **đánh giá sao + bình luận sau khi nhận hàng** · yêu thích · chat với shop · nhận thông báo & email · đặt trước hàng hết |
| **Nhân viên** | Duyệt thanh toán QR + nạp ví · chat khách · **bảng việc cần làm cho đơn hàng** (hẹn ngày giao, giao hàng, báo shipper sắp tới, khiếu nại, hoàn hàng, hoàn tiền, dọn đơn cũ) · cập nhật tồn kho · thống kê ngày/tuần · xuất Excel |
| **Quản trị** | Toàn quyền: sản phẩm · đơn · tài khoản (khóa/mở, đổi vai trò) · danh mục · nhãn sản phẩm · mã giảm · banner theo lịch · khuyến mãi (gửi toàn khách) · cài đặt shop + **lịch giao hàng** + EmailJS · nhật ký nhân viên · **giá vốn & lợi nhuận** (dashboard + export) |

### 🛠 Công nghệ sử dụng

| Lớp | Công nghệ |
|---|---|
| **Frontend** | HTML5, CSS3 (design tokens), Vanilla JS ES2020+ Modules + importmap |
| **Backend** | **json-server 0.17.4** (REST giả lập, cùng một bản cho local và Render) đọc/ghi `db.json` |
| **Static server** | `serve.py` — Python ThreadingHTTPServer, no-cache |
| **HTTP** | axios 1.7.9 |
| **3D** | three.js 0.170.0 |
| **PDF** | jsPDF 2.5.1 + jsPDF-AutoTable 3.8.0 |
| **Excel** | SheetJS 0.18.5 |
| **Charts** | Chart.js 4.4.0 |
| **Email** | @emailjs/browser 4.4.1 (nạp động) |
| **Payment QR** | VietQR qua `img.vietqr.io` |
| **Font** | Google Fonts — *Lora* (display) + *Be Vietnam Pro* (UI) |

### 📊 Số liệu dự án
- **11 trang HTML** · **41 module JS** · **4 file CSS** (tokens → base → components → pages)
- **19 collection dữ liệu** · 21 sản phẩm (ảnh tự chụp) · 4 tài khoản demo
- **27 chức năng** nghiệp vụ (xem [CHUC-NANG.md](CHUC-NANG.md)) · **10 trạng thái đơn hàng** · **26 quy tắc nghiệp vụ** (xem [USECASE.md](USECASE.md))

---

## 2. Cài đặt & chạy dự án

### Yêu cầu
- **Node.js** ≥ 16 và `npm` — lần đầu chạy `npm install` để cài đúng **json-server 0.17.4** ghi trong `package.json` (bấm đúp `start-db.bat` thì tự cài)
- **Python** ≥ 3.8 (cho static server)

### Bước 1: Backend API (Terminal 1) — cổng 3000
```bash
npm install                 # chỉ cần lần đầu: cài json-server 0.17.4 theo package.json
node tools/start-db.mjs
```
> **Vì sao không chạy thẳng `npx json-server db.json`?** (1) `npx` tự tải bản mới nhất (1.x), khác bản 0.17.4 trên Render — 1.x bỏ qua `id` do trình duyệt gửi lên. (2) Ở chế độ `--watch`, json-server **đọc lại cả file** sau mỗi lần ghi: lượt ghi tới ngay lúc đó có thể bị đè mất, và trên Windows máy chủ có thể sập. (3) json-server 0.17 mặc định **tự xóa "bản ghi mồ côi"** mỗi khi có lệnh xóa; script chạy kèm `--fks __none__` để tắt. `tools/start-db.mjs` lo cả ba việc.
>
> Trên Windows có thể bấm đúp `start-db.bat` (gọi đúng lệnh trên). Phòng khi server vẫn bị bật kiểu `json-server --watch db.json`, `js/api.js` có **hàng đợi ghi**: các lượt ghi đi lần lượt, cách nhau 0,3 giây, và bước đặt hàng tự kiểm tra lại đơn đã thật sự nằm trên server.
> Đánh đổi: nếu **sửa tay `db.json`** khi server đang chạy thì phải khởi động lại server.

### Bước 2: Static server (Terminal 2) — cổng 8090
```bash
python serve.py 8090
```

Mở trình duyệt: **http://localhost:8090/index.html**

> Cấu hình sẵn trong `.claude/launch.json` cho Claude Code.

---

## 3. Tài khoản demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| 🛡 **Quản trị** | `admin@lasoi.vn` | `admin123` |
| 👔 **Nhân viên** | `nhanvien@lasoi.vn` | `staff123` |
| 👤 **Khách hàng mới** | `an@gmail.com` | `123456` |
| 👤 **Khách hàng cũ** | `cu@gmail.com` | `123456` |

> Đây là **tài khoản mẫu phục vụ demo**, không phải dữ liệu người dùng thật (xem mục 8.1).
>
> Có thể mở **2 tab song song** (vd 1 khách + 1 nhân viên) để thử luồng chat realtime và duyệt thanh toán — xác thực theo `sessionStorage` nên mỗi tab độc lập.

---

## 4. Cấu trúc thư mục

```
CayXinh/
├── db.json                      # CSDL JSON (19 collection)
├── serve.py                     # Static server no-cache :8090
├── start-db.bat                 # Bấm đúp để bật json-server đúng chế độ (Windows)
├── tools/start-db.mjs           # Bật json-server 0.17.4 từ node_modules (không --watch, --fks __none__)
│
├── index.html                   # Trang chủ + catalog + dải mời "Gợi ý chọn cây"
├── product-detail.html          # Chi tiết sản phẩm + đánh giá + yêu thích
├── cart.html                    # Giỏ hàng + địa chỉ giao + dự kiến nhận + checkout (QR / Ví)
├── donhang.html                 # Đơn hàng của tôi: thanh tiến trình + dự kiến giao + xử lý đơn + PDF + đánh giá sao
├── profile.html                 # Hồ sơ + avatar + ví + yêu thích
├── wishlist.html                # Trang Yêu thích (xem được cả khi chưa đăng nhập)
├── login.html / dangky.html     # Đăng nhập / đăng ký
├── quenmatkhau.html             # Quên mật khẩu (mã OTP 6 số qua email)
├── staff.html                   # Trang nghiệp vụ nhân viên (5 tab)
├── admin.html                   # Trang quản trị (12 tab)
│
├── assets/favicon.svg           # Biểu tượng tab trình duyệt
├── assets/img/                  # Ảnh sản phẩm thật (tự chụp) — JPG gốc
├── assets/img/webp/             # Bản WebP nhẹ, tự sinh bằng: python tools/make-webp.py
├── css/
│   ├── tokens.css               # Design tokens (màu, font, radius, shadow)
│   ├── base.css                 # Reset + typography + layout
│   ├── components.css           # Header, button, card, chat, bell, modal...
│   └── pages.css                # Style riêng từng trang
└── js/
    ├── api.js                   # Tất cả REST endpoint (axios) + hàng đợi ghi
    ├── storage.js               # sessionStorage auth + localStorage giỏ (chặn tồn kho)
    ├── ui.js                    # UI chung (header, toast, card, init)
    ├── app.js                   # Trang chủ
    ├── detail.js                # Chi tiết sản phẩm
    ├── product-flow.js          # Chuyển cảnh thẻ sản phẩm → trang chi tiết (ảnh bay, khung xương, quay lại đúng chỗ cũ)
    ├── payment.js               # Modal thanh toán QR / Ví
    ├── invoice.js               # Xuất PDF hóa đơn
    ├── notify.js                # Thông báo web + chuông 🔔
    ├── email.js                 # Gửi email (EmailJS + mailbox)
    ├── favorites.js             # Yêu thích: tài khoản + lưu tạm trên máy cho khách vãng lai
    ├── wishlist.js              # Trang Yêu thích
    ├── labels.js                # Nhãn sản phẩm quản lý được: nạp nhãn, dựng chip
    ├── admin-labels.js          # Quản trị › Nhãn sản phẩm (nhóm nhãn, nhãn, gán cho sản phẩm)
    ├── admin-dashboard.js       # Quản trị › Thống kê theo khoảng thời gian chọn được (câu tóm tắt + phiếu số liệu + biểu đồ đường xu hướng + biểu đồ cột so sánh)
    ├── dash-kit.js              # Ô phiếu số liệu + biểu đồ cột "luống cây" dùng chung cho Quản trị và Nhân viên
    ├── slide-marker.js          # Dấu "đang chọn" trượt giữa các thẻ phân trang / nút chọn kỳ
    ├── detail-extras.js         # Trang chi tiết: thanh mua dính, lịch chăm sóc tuần đầu, thường mua cùng
    ├── care-card.js             # Phiếu chăm sóc kiểu nhãn tiêu bản: đọc từ careCard (admin chỉnh) hoặc fallback text-parsing; lịch tưới 4 tuần, sơ đồ phòng, giọt sương, chậu cạnh ly cà phê
    ├── care-week.js             # Lịch tuần đầu: đọc từ careWeekSteps hoặc fallback careLevel; tải .ics (data URI, tương thích mobile) + nút Google Calendar
    ├── shop-extras.js           # Giỏ hàng trượt + menu danh mục dưới "Sản phẩm"
    ├── search-suggest.js        # Gợi ý tức thì dưới ô tìm kiếm
    ├── img-manifest.js          # (tự sinh) danh sách ảnh đã có bản WebP
    ├── quiz.js                  # Gợi ý chọn cây: hộp thoại 3 câu hỏi, kết quả hiện ngay
    ├── nav.js                   # Thanh điều hướng dùng chung: mục nav, active state, cuộn mượt, menu ☰
    ├── fx.js                    # Hiệu ứng: bay vào giỏ, tim nảy, confetti, ripple, chuyển trang
    ├── sale.js                  # Khuyến mãi, hàng mới về, bán chạy top 3, countdown
    ├── banner.js                # Banner theo lịch
    ├── three-ambient.js         # 4 hiệu ứng Three.js
    ├── chat.js                  # Chat khách ↔ NV (polling 2.5s)
    ├── chatbot.js               # Trợ lý AI (Gemini) + fallback rule-based
    ├── ai-config.example.js     # Mẫu cấu hình API key Gemini
    ├── staff.js                 # Trang nhân viên
    ├── profile.js               # Trang hồ sơ
    ├── orders.js                # Đơn của tôi (thanh tiến trình, dự kiến giao, nút thao tác, đánh giá sao)
    ├── order-flow.js            # Luật vòng đời đơn + lịch giao hàng + tự hoàn tất — nguồn sự thật duy nhất
    ├── order-ui.js              # Giao diện đơn dùng chung + bảng việc của shop + hộp hẹn ngày giao
    ├── live.js                  # Tự làm mới khi dữ liệu trên server đổi
    ├── i18n.js                  # Đổi ngôn ngữ (6 thứ tiếng)
    ├── login.js / register.js   # Form auth
    ├── forgot-password.js       # Quên mật khẩu bằng OTP
    ├── report.js                # Xuất Excel / nhập Excel
    └── image-viewer.js          # Phóng to ảnh sản phẩm
```

---

## 5. Tài liệu chi tiết

| File | Nội dung |
|---|---|
| 📘 [database.md](database.md) | Thiết kế CSDL — ER diagram, 17 collection, các trường |
| 🔌 [API_DOCUMENT.md](API_DOCUMENT.md) | Tài liệu API REST — mọi endpoint + ví dụ request/response |
| 🏛 [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc phần mềm — layered, tech stack, decisions |
| 🔄 [WORKFLOW.md](WORKFLOW.md) | Workflow nghiệp vụ — 12 luồng chính kèm sơ đồ Mermaid (có luồng dự kiến giao & hẹn ngày giao) |
| ✅ [CHUC-NANG.md](CHUC-NANG.md) | 27 chức năng, mỗi chức năng kèm sơ đồ riêng |
| 🎭 [USECASE.md](USECASE.md) | Tác nhân, sơ đồ use case, đặc tả chi tiết, 26 quy tắc nghiệp vụ & vòng đời đơn hàng |
| 📈 [SCALING.md](SCALING.md) | Khả năng chịu tải (số đo thật) & lộ trình nâng cấp 100 → 200 → 10.000 người |

> **Mở file `.md` để xem sơ đồ:** GitHub tự render Mermaid; VS Code cần extension **"Markdown Preview Mermaid Support"** (nhấn `Ctrl+Shift+V` sau khi cài).

---

## 6. Tính năng nổi bật — Demo

### 🎨 Hiệu ứng Three.js
- **Hero particles** — hạt lơ lửng trên trang chủ
- **Floating leaves** — lá rơi nhẹ ở nền
- **Topo field** — địa hình động cho khối quiz
- **Banner particles** — tuyết trắng Giáng Sinh ❄️ hoặc lấp lánh vàng ✨ tùy dịp

### 💳 Thanh toán QR thật
Dùng VietQR của Vietcombank — ảnh QR được dựng động từ `settings` (BIN 970436, số TK, số tiền, nội dung). Khách chụp màn hình chuyển khoản → upload bằng chứng → nhân viên duyệt.

### 📧 Email thật qua EmailJS
Admin dán Public Key / Service ID / Template ID ở trang Cài đặt → hệ thống tự gửi Gmail thật khi:
- Khách quên mật khẩu (mã OTP 6 số, hạn 10 phút)
- Nhân viên duyệt thanh toán (hóa đơn)
- Hàng về lại (cho người đã đăng ký báo)
- Admin tạo khuyến mãi (gửi toàn khách)

### 🚚 Dự kiến giao & "Sắp tới bạn"
- **Cách tính** (Quản trị › Cài đặt › Lịch giao hàng): thanh toán trước **giờ chốt** (mặc định 16:00) → đóng gói trong ngày, sau giờ chốt → ngày làm việc kế tiếp; + **ngày chuẩn bị** (mặc định 0); + **ngày vận chuyển** nhanh nhất – chậm nhất (mặc định 1–2). Chỉ đếm ngày làm việc: bỏ Chủ nhật (nếu không giao) và ngày nghỉ khai báo. Ví dụ: thanh toán Thứ Hai 10:00 → nhận Thứ Ba – Thứ Tư.
- Khách thấy khoảng ngày + **câu giải thích cách tính** ở giỏ hàng và ở từng đơn; quá ngày mà chưa giao → "Chậm hơn dự kiến".
- Nhân viên **Hẹn ngày giao** cho từng đơn (ngày hẹn thay cho ước tính) và bấm **Shipper sắp giao tới** → khách thấy "Sắp tới bạn"; cả hai đều gửi thông báo + email.
- **Khách quên xác nhận:** đơn đã giao hiện đếm ngược; còn < 24 giờ → nhắc 1 lần; hết N ngày (mặc định 3) → tự hoàn tất; đơn tự hoàn tất vẫn cho báo "chưa nhận" trong 7 ngày.

### 🌿 Cây được khách thương nhất (bán chạy)
Trang chủ có "Bảng tin của tiệm — Cây được khách thương nhất": **tối đa 3 cây** bán nhiều nhất (đếm số chậu trong đơn đã thanh toán, bỏ phụ kiện; không cắt ngang nhóm hòa nhau: `[10, 8, 8, 8]` → 1 cây, `[10, 10, 8, 5]` → 3 cây, hai cây đầu đồng hạng 1). Bố cục co giãn theo số cây: 1 cây → một khối ngang lớn; 2–3 cây → cây hạng 1 lớn, các cây sau nhỏ hơn. Thứ hạng thể hiện bằng con dấu. Số bán chỉ nêu khi từ 10 chậu ("14 chậu đã về nhà mới"), thấp hơn thì nói bằng lời ("Khách ghé tiệm hay chọn nhất dạo này"). Chưa có cây nào phân được hạng → mục đổi thành "Tiệm chọn giúp bạn" (cây dễ chăm, còn hàng) thay vì để trống.

### 🔔 Thông báo realtime
Chuông ở header (khách) — poll 10s, badge chưa đọc, dropdown với icon phân loại.

### 🛡 Minh bạch chống gian lận
Mọi thao tác nhạy cảm của nhân viên (duyệt TT, duyệt nạp ví, đổi trạng thái đơn, sửa kho) **và của quản trị** (sản phẩm, đổi giá, tồn kho, khuyến mãi, mã giảm giá, tài khoản) đều ghi `auditLog` — admin xem được **ai · làm gì · lúc nào · chi tiết**. Tab **Nhật ký nhân viên** (`js/admin-audit.js`) mặc định xem **hôm nay** (chọn nhanh 7 / 30 ngày / khoảng tùy chọn), chia theo ngày; **gom mọi thao tác trên cùng một đơn / ví / sản phẩm thành một dòng** (trạng thái đơn hiện tại, nhân viên, số bước), bấm để mở dòng thời gian — hoặc chuyển sang **danh sách đầy đủ**. Lọc theo nhân viên (bấm ô tóm tắt), loại thao tác, **chỉ thao tác quan trọng** (tiền, hủy, xóa, sửa kho — viền đỏ đất), tìm theo mã đơn / sản phẩm / tên khách; xuất Excel đúng bộ lọc. Máy chủ lọc + phân trang (60 thao tác / lượt, "Xem thêm").

**Mỗi đơn chỉ được hoàn tiền đúng một lần** (`refundToWallet` trong `order-flow.js`): đọc lại đơn từ máy chủ trước khi làm; đơn đã có giao dịch hoàn `confirmed` thì không cộng nữa; lượt hoàn giữ chỗ bằng một giao dịch mã cố định `rf-<mã đơn>` (json-server từ chối mã trùng → chỉ một lượt giữ được, dù bấm hai lần, hai tab cùng làm hay phản hồi rớt rồi bấm lại); cộng ví bằng số dư đích, lỗi mạng thì đọc lại số dư để biết đã cộng chưa; phiếu chỉ chuyển `confirmed` sau khi đơn đã ghi xong. Trong cùng một tab, đơn đang xử lý thì lần bấm thứ hai bị từ chối; nút thao tác khóa trong lúc chạy.

---

## 7. Yêu cầu phi chức năng (Non-functional requirements)

| # | Yêu cầu | Trạng thái | Cách đáp ứng |
|---|---|---|---|
| 1 | Xử lý **1000 req/s** | ⚠️ Giới hạn do stack học thuật | json-server đơn luồng chỉ đáp ứng vài trăm req/s cục bộ. **Kiến trúc layered** (client ↔ `api.js` ↔ REST ↔ data) đã **sẵn sàng scale**: chỉ cần đổi backend sang Node/Express + PostgreSQL + Redis + load balancer, không chạm UI. |
| 2 | **Tốc độ tải trang nhanh** | ✅ Có | ES Modules + importmap (không build), `preconnect` Google Fonts, `font-display: swap`, **lazy-load** EmailJS SDK & chatbot (dynamic `import()`), ảnh có `onerror` placeholder. |
| 3 | **Bảo mật thông tin người dùng** | ✅ Mức cơ bản (hạn chế học thuật) | `escapeHTML()` chống XSS trong mọi template string; `password` **xóa khỏi object** trước khi lưu session; `requireRole` guard mọi trang nhạy cảm và **đối chiếu phiên với máy chủ** (chặn sửa tay vai trò trong trình duyệt); **audit log** mọi thao tác nhân viên; tài khoản có thể **khóa/mở**. *Giới hạn:* mật khẩu lưu dạng thô (đồ án học thuật, chưa hash). |
| 4 | **Mã hóa truyền tải** | ⚠️ Phụ thuộc deploy | Đồ án chạy local HTTP. Khi deploy thật, chỉ cần đặt sau reverse proxy (nginx/Caddy) + Let's Encrypt → HTTPS tự động, không cần sửa code. |
| 5 | **Khả năng mở rộng** | ✅ Có | Kiến trúc **phân lớp 5 tầng** (xem ARCHITECTURE.md), mọi call REST đi qua **1 điểm** (`api.js`), UI tách rời logic → đổi backend/scale horizontal không ảnh hưởng UI. |
| 6 | **Giao diện thân thiện** | ✅ Có | Design tokens thống nhất, toast nhận phản hồi, loading skeleton, empty state, modal, hover specimen-tag, keyboard shortcuts (Enter tìm kiếm, Esc đóng menu). |
| 7 | **Hỗ trợ nhiều ngôn ngữ** | ✅ **Đã thêm** | `js/i18n.js` + Google Website Translator → **6 ngôn ngữ** (🇻🇳 VI · 🇬🇧 EN · 🇯🇵 JA · 🇰🇷 KO · 🇨🇳 ZH · 🇫🇷 FR). Nút tròn góc dưới trái, nhớ lựa chọn vào `localStorage`, dịch cả nội dung động từ db.json. |
| 8 | **Nhiều thiết bị (responsive)** | ✅ Có | `<meta viewport>` trên **11/11** trang; **30 @media queries** trong CSS cho desktop/tablet/mobile; thanh header thu gọn ở mobile, menu drawer, grid tự xếp cột. |
| 9 | **Nhiều trình duyệt** | ✅ Có | ES2020+ chạy tốt trên **Chrome / Edge / Firefox / Safari** (các bản hiện đại 2+ năm gần đây). `<meta charset="UTF-8">`, `lang="vi"`, font Vietnamese subset. `importmap` được tất cả trình duyệt hiện đại hỗ trợ (Chrome 89+, Firefox 108+, Safari 16.4+). |

### 7.1 Chi tiết đa ngôn ngữ (mục 7)

- **Module:** `js/i18n.js` (~190 dòng, có bình luận).
- **Kích hoạt:** nạp động từ `js/ui.js` → `initPage()` → `import("./i18n.js").then(m => m.initI18n()).catch(() => {})` → **chạy trên mọi trang** mà không cần sửa 11 file HTML.
- **An toàn:** nếu Google bị chặn / mạng mất, nút vẫn hiện nhưng im lặng không làm hỏng trang (bọc try/catch 2 lớp).
- **Dịch được cả nội dung động:** tên sản phẩm, mô tả, thông báo từ `db.json` — vì Google Translate dịch toàn bộ DOM đã render, không cần dictionary thủ công.
- **UX sạch:** CSS ẩn hoàn toàn banner "Được dịch sang..." mặc định xấu xí của Google, chỉ hiện nút tròn glass-effect ở góc dưới trái (không đè chatbot bên phải).
- **Nhớ lựa chọn:** `localStorage.preferred_lang` + cookie `googtrans` → lần truy cập sau tự dịch ngay.

---

## 8. Hạn chế đã biết & hướng phát triển

Dự án được xây dựng trong phạm vi môn Lập trình Web Client, với backend giả lập bằng `json-server`. Các hạn chế dưới đây xuất phát từ lựa chọn công nghệ đó, không sửa được nếu giữ nguyên kiến trúc hiện tại; chúng được ghi nhận để người đọc đánh giá đúng phạm vi của sản phẩm.

### 8.1 Bảo mật API

**Hiện trạng.** `json-server` không có cơ chế xác thực phía máy chủ. Bất kỳ ai biết đường dẫn API (ví dụ `/users`, `/orders`) đều:

- đọc được toàn bộ dữ liệu, kể cả **mật khẩu đang lưu dạng văn bản thường** trong `db.json`;
- thêm, sửa, xóa được mọi bản ghi bằng các lệnh `POST` / `PATCH` / `DELETE` gửi thẳng tới API.

Việc phân quyền (`requireRole`, đối chiếu phiên với máy chủ) chỉ diễn ra ở trình duyệt. Cơ chế này chặn được thao tác sai trên giao diện nhưng không chặn được người gọi API trực tiếp.

Các tài khoản trong `db.json` (mục 3) là **tài khoản mẫu phục vụ demo**, không chứa dữ liệu người dùng thật.

**Hướng khắc phục khi phát triển tiếp:**

1. Thay `json-server` bằng một backend thật (Node.js/Express hoặc tương đương). Nhờ kiến trúc phân lớp, mọi lệnh gọi đã đi qua `js/api.js`, nên phần giao diện gần như không phải sửa.
2. Băm mật khẩu bằng **bcrypt** trước khi lưu, và không bao giờ trả mật khẩu về client.
3. Xác thực bằng **JWT** (hoặc session cookie `HttpOnly`): mỗi request mang token, máy chủ kiểm tra trước khi xử lý.
4. **Phân quyền phía máy chủ**: mỗi endpoint tự kiểm tra vai trò (khách / nhân viên / quản trị) và quyền sở hữu dữ liệu (khách chỉ xem đơn của mình).

### 8.2 Dữ liệu không bền vững trên bản deploy

**Hiện trạng.** Bản online chạy API trên gói miễn phí của Render. Gói này không giữ lại thay đổi ghi vào file khi máy chủ khởi động lại, "ngủ" do không có truy cập, hoặc deploy lại. Vì vậy đơn hàng, tài khoản, đánh giá… tạo trên bản online **có thể mất**, và dữ liệu quay về trạng thái gốc của `db.json` trong mã nguồn. Bản chạy local (`start-db.bat`) không bị ảnh hưởng: mọi thay đổi được ghi thẳng vào `db.json` trên máy.

**Hướng khắc phục:** lưu dữ liệu trong một cơ sở dữ liệu thật như **MongoDB Atlas** hoặc **PostgreSQL** (Supabase, Neon, Render PostgreSQL…) thay cho file JSON. Kết hợp với backend ở mục 8.1, dữ liệu sẽ tồn tại độc lập với vòng đời của máy chủ ứng dụng.

### 8.3 Thanh toán ví khi mạng rớt liên tiếp

**Hiện trạng.** Luồng trả bằng ví đi qua nhiều lệnh ghi (tạo đơn → trừ ví → đánh dấu đã thanh toán → trừ kho). Mỗi khi một lệnh báo lỗi, trình duyệt **đọc lại** dữ liệu trên máy chủ rồi mới quyết định (đi tiếp, hủy đơn, hay hoàn tiền), để không ghi trùng và không hoàn tiền nhầm. Còn một khe không đóng được ở phía trình duyệt: khi lệnh ghi báo lỗi **và** lần đọc lại cũng thất bại (mạng rớt liên tiếp), trình duyệt không biết máy chủ đã làm tới đâu:

- Lệnh **trừ ví** lỗi mà không đọc lại được số dư → đơn ở lại "Chưa thanh toán", khách được báo kiểm tra số dư ví. Ví có thể đã bị trừ hoặc chưa.
- Lệnh **đánh dấu đã thanh toán** lỗi mà không đọc lại được đơn → hệ thống **không tự hoàn tiền** (vì đơn có thể đã được ghi là đã thanh toán). Đơn được gắn cờ "Cần kiểm tra Ví web" (nếu mạng cho phép ghi), hiện ở mục "Cần xử lý" của nhân viên; khách được dặn liên hệ tiệm.

Trong cả hai trường hợp, nhân viên phải đối chiếu số dư ví và lịch sử giao dịch rồi xử lý tay; hiện chưa có nút "hoàn tiền thủ công" riêng cho tình huống này.

**Hướng khắc phục:** chuyển toàn bộ bước thanh toán lên máy chủ thật, gói "trừ ví + đánh dấu đã thanh toán" trong **một giao dịch cơ sở dữ liệu** (transaction) và cho phép gọi lại an toàn bằng khóa chống trùng (idempotency key). Khi đó trình duyệt chỉ gửi một lệnh, và máy chủ bảo đảm hoặc làm trọn, hoặc không làm gì.

### 8.4 Các giới hạn khác

- Không có máy chủ chạy nền: **nhắc xác nhận nhận hàng** và **tự hoàn tất đơn** chỉ chạy khi có người mở trang đơn hàng (khách hoặc shop). *Hướng phát triển:* tác vụ định kỳ (cron) phía máy chủ.
- Không có WebSocket — realtime dùng polling. *Hướng phát triển:* WebSocket / Server-Sent Events.
- Public Key EmailJS lộ ở client là **bình thường và an toàn** (chỉ cho gửi, không đọc được hộp thư).

### 8.5 Đối soát hoàn tiền trùng (11/2026)

Phiên bản cũ chưa có cơ chế chống hoàn tiền nhiều lần cho cùng một đơn. Khi lệnh hủy đơn bị lặp (nhấn nhiều lần hoặc phản hồi mạng bị rớt), ví khách có thể được cộng hoàn tiền trùng. Lỗi đã được phát hiện qua đối soát, chặn bằng phiếu hoàn mã cố định (`rf-<orderId>`, xem `order-flow.js`), và xử lý bằng giao dịch điều chỉnh trong `walletTransactions` — không xóa giao dịch cũ, chỉ thêm bút toán thu hồi / ghi nhận chênh lệch.

### 8.6 Phiếu chăm sóc do admin quản lý & sửa lỗi .ics mobile (11/2026)

**Vấn đề 1 — .ics trên điện thoại:** Nút "Thêm vào lịch điện thoại" dùng `Blob URL + <a>.click()` không hoạt động trên một số trình duyệt mobile (Android báo "Không tìm thấy ứng dụng"). Đã chuyển sang `data:text/calendar` URI — tương thích rộng hơn. Thêm nút phụ "Thêm Google Calendar" mở trực tiếp Google Calendar web, hữu ích khi máy không mở được file .ics.

**Vấn đề 2 — Dữ liệu phiếu chăm sóc:** Trước đây dữ liệu phiếu chăm sóc và lịch tuần đầu được suy ra từ text trong `specs` và `careLevel`. Nay mỗi sản phẩm có thể chứa 2 trường structured:
- `careCard`: `{water, light, humidity, pot}` — dữ liệu phiếu chăm sóc
- `careWeekSteps`: mảng 4 object `{key, from, to, day, title, text}` — 4 mốc lịch tuần đầu

Cả `care-card.js` và `care-week.js` đều đọc trường structured trước, fallback sang text-parsing cũ nếu thiếu. Admin có thể chỉnh sửa qua form trong tab "Sản phẩm" (mục "Phiếu chăm sóc" và "Lịch tuần đầu" dạng `<details>` — mở ra để sửa, giữ đóng = không ghi đè).

### 8.7 Tích hợp AI chatbot — Google Gemini (11/2026)

Chatbot tư vấn cây cảnh giờ sử dụng **Google Gemini** (model `gemini-flash-lite-latest`, tầng miễn phí) để trả lời tự nhiên hơn. System prompt chứa toàn bộ danh mục sản phẩm, giá, tồn kho, khuyến mãi, mã giảm giá — giúp AI trả lời chính xác theo dữ liệu thật.

- **Lịch sử hội thoại:** lưu tối đa 16 tin nhắn gần nhất, AI nhớ ngữ cảnh câu hỏi trước.
- **Link sản phẩm:** AI trả về link dẫn thẳng đến trang chi tiết sản phẩm.
- **Nhãn AI:** Tin nhắn từ Gemini có badge "AI" màu xanh, phân biệt với rule-based.
- **Markdown đơn giản:** In đậm, in nghiêng, danh sách, link — render ngay trong chat.
- **Fallback rule-based:** Không có API key hoặc API lỗi → tự động dùng hệ thống rule-based cũ (không gián đoạn).
- **Bảo mật API key:** Key lưu riêng trong `js/ai-config.js` (nằm trong `.gitignore`). File mẫu `js/ai-config.example.js` hướng dẫn cấu hình. **Lưu ý:** đây là project học tập — key nằm ở frontend (client-side), không an toàn cho production. Ở môi trường thực cần proxy backend.

### 8.8 Giá vốn & lợi nhuận — chỉ admin (11/2026)

Thêm quản lý **giá vốn** (`costPrice`) cho từng sản phẩm và hiển thị **lợi nhuận gộp** trên dashboard admin. Giá vốn tuyệt đối không hiện cho khách, nhân viên, chatbot hay hóa đơn.

- **Dữ liệu:** Mỗi sản phẩm có trường `costPrice`. Khi tạo đơn, `costAtSale` (giá vốn lúc bán) tự động chụp vào từng item — đơn cũ không có `costAtSale` sẽ ước tính từ `costPrice` hiện tại.
- **Bảo mật:** `api.js` interceptor lọc bỏ `costPrice`/`costAtSale` khỏi response nếu người gọi không phải admin.
- **Form sản phẩm:** Ô "Giá vốn" với hiển thị biên lợi nhuận tức thì (`Lãi gộp Xđ — Y%`), cảnh báo đỏ khi bán lỗ.
- **Dashboard:** Phiếu "Lợi nhuận gộp" + "Biên lợi nhuận %", đường lợi nhuận cam trên biểu đồ xu hướng, bảng lợi nhuận theo sản phẩm (SL, doanh thu, giá vốn, lợi nhuận, biên %).
- **Export:** Báo cáo Excel/TXT admin có thêm cột giá vốn/lợi nhuận; staff không có.
- **Nhật ký:** Thay đổi giá vốn ghi audit log (`product_cost`).

---

## 9. Tác giả

- **Sinh viên:** Phan Tạ Hữu Đức
- **Email:** phantahuuduc@gmail.com
- **Môn:** Lập trình Web Client
- **Năm học:** 2026

---

*Cảm ơn thầy cô đã xem dự án! 🌱*
