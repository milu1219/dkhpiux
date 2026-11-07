# ⚡ IUH DKHP PRO (v1.2 ULTRA TURBO) — Hướng Dẫn Chức Năng & Sử Dụng

Tiện ích mở rộng (**Browser Extension - Manifest V3**) dành cho sinh viên **Đại học Công nghiệp TP.HCM (IUH)** trên các trình duyệt nhân Chromium (**Brave, Chrome, Edge, Cốc Cốc**), hỗ trợ **tự động đăng ký học phần từ A–Z**, **lọc lớp không trùng lịch**, **săn slot lớp đầy** và **vượt lag nghẽn mạng giờ G**.

---

## 🛠️ 1. Hướng Dẫn Cài Đặt Nhanh

1. Tải hoặc giải nén thư mục code của tiện ích về máy tính.
2. Mở trình duyệt và truy cập trang quản lý tiện ích:
   - **Brave:** `brave://extensions/`
   - **Chrome:** `chrome://extensions/`
   - **Edge:** `edge://extensions/`
3. Bật công tắc **Developer mode** (*Chế độ dành cho nhà phát triển*) ở góc trên bên phải.
4. Bấm nút **Load unpacked** (*Tải tiện ích đã giải nén*) ở góc trên bên trái $\rightarrow$ Chọn thư mục chứa file `manifest.json` của tool.
5. Truy cập cổng đăng ký học phần: `https://dkhp.iuh.edu.vn/DangKyHocPhan` hoặc `https://sv.iuh.edu.vn`.

> 💡 **Lưu ý:** Ở góc dưới bên phải màn hình sẽ xuất hiện nút nổi **`⚡ IUH DKHP PRO`**. Bấm vào nút này để bung bảng điều khiển chính (HUD).

---

## 🎯 2. Hướng Dẫn 3 Cách Săn & Đăng Ký Học Phần Tự Động

### 📌 Phân biệt các loại mã trên cổng IUH
| Loại mã | Độ dài | Ví dụ | Ý nghĩa & Cách hoạt động trong Tool |
| :--- | :---: | :---: | :--- |
| **Mã môn học / Mã MH cũ** | 6–7 số | `015296`, `2101777` | Chỉ là mã định danh môn, **không dùng** để săn. |
| **Mã học phần (Mã HP)** | **10 số** | `4203015296` | Mã của **cả môn học**. Khi dùng mã này, Tool sẽ tự mở môn học và chọn **bất kỳ lớp nào còn chỗ & không trùng lịch** của môn đó. |
| **Mã lớp học phần (Mã LHP)** | **12 số** | `420301529601` | Mã của **1 lớp cụ thể** (`Mã HP 10 số` + `2 số thứ tự lớp`). Khi dùng mã này, Tool sẽ canh và đăng ký **đúng chính xác lớp đó**. |

---

### Cách 1: Tự tay click chọn môn / lớp trên bảng (Nhanh nhất khi cổng đang mở)
Khi ô **"Tự động bấm Đăng Ký khi có slot"** đang được bật (mặc định bật sẵn):
1. Tại bảng **Môn học chờ đăng ký** (bảng trên), bạn chỉ cần **chấm chọn vào 1 môn học** (hiện dấu tích tròn).
2. Tool sẽ **tự động thực hiện toàn bộ các bước còn lại**:
   - ✅ Tự động tích chọn ô **`☑ HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH`**.
   - ✅ Chờ bảng **Lớp học phần chờ đăng ký** (bảng dưới) tải xong.
   - ✅ Tự động dò tìm lớp có trạng thái **`"Chờ sinh viên đăng ký"`** và còn chỗ trống (`Đã đăng ký < Sĩ số tối đa`).
   - ✅ Tự động chọn **Nhóm Thực Hành** (nếu môn học có chia ca thực hành).
   - ✅ Tự động bấm nút **`Đăng Ký / Lưu đăng ký`** và tự bấm **`Đồng ý / Xác nhận`** trên hộp thoại thông báo.

### Cách 2: Bấm nút `⚡ Săn` gắn sẵn trên từng dòng
- Trên bảng **Môn học tự chọn** hoặc bảng **Lớp học phần chờ đăng ký**, bên cạnh mã `4203...` sẽ có nút **`⚡ Săn`**.
- Khi bấm **`⚡ Săn`**:
  - Mã đó lập tức được thêm vào danh sách theo dõi.
  - Tool **tự động bật chế độ Săn** và **tiến hành chọn lớp + bấm Đăng Ký ngay lập tức** (bạn không cần phải bấm thêm nút *"Bắt đầu săn"*).

### Cách 3: Nhập sẵn danh sách Mã LHP để canh slot / trực chiến trước giờ G
1. Mở bảng điều khiển **IUH DKHP PRO** $\rightarrow$ Tab **🎯 Săn Lớp**.
2. Nhập **Mã LHP (12 số)** hoặc **Mã HP (10 số)** vào ô nhập liệu $\rightarrow$ Bấm **`+ Thêm`** (hoặc `Enter`).
3. Bấm nút **`🚀 BẮT ĐẦU SĂN`**.
4. Tool sẽ quét liên tục theo chu kỳ (250ms – 500ms). Ngay khi phát hiện lớp mở cổng hoặc có người nhả slot trống, Tool sẽ phát âm thanh báo hiệu và tự động đăng ký trong **20ms**.

---

## 🧠 3. Các Cơ Chế Bảo Vệ & Lọc Thông Minh Tự Động

1. **🚫 Tự động lọc bỏ lớp Trùng Lịch:**
   - Tự động kiểm tra và tích vào ô **`☑ HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH`** của trường để đảm bảo không bao giờ đăng ký nhầm lớp bị trùng thời khóa biểu.
2. **🔒 Chỉ chọn lớp `"Chờ sinh viên đăng ký"`:**
   - Tự động nhận diện cột **Trạng thái** ở cuối bảng Lớp học phần.
   - **Chỉ chọn** các lớp có trạng thái **`"Chờ sinh viên đăng ký"`** (hoặc `"Chấp nhận mở lớp"`) và còn chỉ tiêu.
   - **Tuyệt đối bỏ qua** các lớp có trạng thái **`"Đã khóa"`**, **`"Đang lên kế hoạch"`** hoặc đã đầy sĩ số.
3. **🧹 Tự động bỏ qua Học Phần Bắt Buộc:**
   - Tự động ẩn nút **`⚡ Săn`** ở mục **Học phần bắt buộc** (trong Chương trình khung) và các môn có dấu tích ở cột **Bắt buộc**, chỉ hiển thị ở các môn **Học phần tự chọn** và các lớp đang mở đăng ký.
4. **🔬 Tự động chọn Nhóm Thực Hành (Ca TH):**
   - Nếu môn học có chia nhóm/ca thực hành, ngay khi bảng chi tiết nhóm thực hành hiện ra, Tool tự động chọn nhóm thực hành đầu tiên còn chỗ rồi mới bấm nút Đăng Ký.

---

## 🖥️ 4. Chi Tiết 5 Tab Chức Năng Trên Bảng Điều Khiển (HUD)

### 🎯 Tab 1: Săn Lớp
- **Ô nhập Mã LHP & Nút `+ Thêm`:** Thêm mã học phần (10 số) hoặc mã lớp học phần (12 số) vào danh sách canh slot.
- **Danh sách Mã LHP theo dõi:** Hiển thị trạng thái thời gian thực của từng mã (`Đang chờ`, `Đang tải danh sách lớp...`, `Chưa mở (Đã khóa / Đang lên kế hoạch)`, `Còn chỗ!`, `ĐÃ ĐK THÀNH CÔNG`).
- **Nút `🚀 BẮT ĐẦU SĂN` / `🛑 DỪNG LẠI`:** Bật hoặc tạm dừng vòng lặp quét slot tự động.
- **Nút `⚡ ĐK Ngay`:** Cưỡng chế gửi lệnh chọn và bấm nút Đăng ký ngay lập tức cho mã trong danh sách.
- **Tốc độ quét:** Tùy chỉnh tần suất quét bảng từ `250ms` (Tối đa), `300ms` (Cực nhanh), `500ms` (Mượt mà), `800ms` (Chuẩn) đến `1.5s` (An toàn).
- **Các tùy chọn bật/tắt:**
  - `☑ Tự động bấm Đăng Ký khi có slot`
  - `☐ Tự động bung to bảng khi vào trang`
  - `☑ Phát âm thanh báo hiệu` (kèm nút **Thử loa**)

---

### ⚡ Tab 2: Vượt Lag (Turbo Network Booster)
- **🚀 Turbo Network Mode:**
  - Chặn 100% hình ảnh, banner, font chữ nặng, video và trackers quảng cáo trên cổng IUH bằng `declarativeNetRequest`.
  - Giảm tới **90% dung lượng tải trang**, giúp nhận dữ liệu JSON/HTML lớp học phần siêu tốc ngay cả khi mạng nghẽn giờ cao điểm (vẫn giữ nguyên Captcha không bị ảnh hưởng).
- **⚡ Zero-Delay Fast-Track (20ms):**
  - Rút ngắn thời gian phản hồi từ lúc phát hiện lớp đến lúc bấm nút Đăng ký xuống chỉ còn **20ms – 25ms** và quét liên hoàn đón đầu AJAX của trường.
- **📊 Bảng thông số mạng thời gian thực:**
  - **Độ trễ Server (Ping ms):** Đo tốc độ phản hồi thực tế của máy chủ IUH (`< 180ms`: Mượt mà 🟢 | `180–400ms`: Chậm/Lag 🟡 | `> 400ms`: Nghẽn nặng 🔴).
  - **Đường truyền:** Đánh giá tình trạng kết nối hiện tại.
  - **Lần đã Retry:** Đếm số lần Tool tự động gửi lại lệnh khi server báo lỗi.
- **🔁 Tự động Retry khi dính lỗi 502 / 503 / 504:**
  - Khi server IUH quá tải trả về lỗi `502 Bad Gateway` hoặc `504 Gateway Timeout`, Tool tự động thử bấm gửi lại lệnh đăng ký theo nhịp `200ms – 600ms` mà không cần F5 lại trang.
- **Nút `📡 Đo Ping Ngay` & `🔄 Tải Lại Bảng Nhanh (Soft-Refresh)`:** Kiểm tra kết nối hoặc làm mới riêng bảng lớp học phần mà không cần tải lại toàn bộ trình duyệt.

---

### 🔍 Tab 3: Lọc Bảng
- **`☐ Ẩn tất cả các lớp đã đầy (Hết chỗ / Đã khóa)`:** Làm sạch bảng, ẩn toàn bộ các lớp `"Đã khóa"`, `"Đang lên kế hoạch"` hoặc đã hết slot để bạn dễ quan sát.
- **`☑ Tô màu xanh nổi bật lớp còn chỗ`:** Chỉ tô màu xanh lá cho những lớp có trạng thái **`"Chờ sinh viên đăng ký"`** và **còn chỗ trống**; làm mờ các lớp `"Đã khóa"` / `"Đang lên kế hoạch"`.
- **Nút `⚡ Gắn nút [+ Săn] vào các dòng trên bảng`:** Quét và gắn lại nút `⚡ Săn` thủ công nếu bảng vừa thay đổi.
- **Nút `🔄 Áp dụng lọc & Quét lại bảng`:** Cập nhật lại hiệu ứng tô màu và lọc trên toàn bộ bảng.

---

### 🛡️ Tab 4: Giữ Phiên (Anti-Logout / Keep-Alive)
- **`☑ Kích hoạt tự động giữ phiên`:** Định kỳ gửi tín hiệu ngầm nhẹ nhàng đến máy chủ IUH để duy trì Cookie đăng nhập, chống bị văng tài khoản ra ngoài khi bạn treo máy chờ đến giờ mở cổng.
- **Tần suất ping:** Tùy chọn mỗi `1 phút`, `2 phút` hoặc `5 phút`.
- **Nút `📡 Gửi ping giữ phiên ngay bây giờ`:** Chủ động làm mới phiên đăng nhập ngay lập tức.

---

### 📜 Tab 5: Nhật Ký (Live Event Logs)
- Ghi lại chi tiết từng hành động của Tool theo thời gian thực tới từng mili-giây (`[HH:MM:SS.mmm]`):
  - Thời điểm tự động tích ô *Không trùng lịch*.
  - Thời điểm phát hiện lớp *Chờ sinh viên đăng ký*.
  - Trạng thái chọn nhóm thực hành, bấm nút *Đăng ký*, xác nhận *Popup* hoặc cảnh báo lỗi từ hệ thống trường.
- Có nút **`Xóa log`** để dọn sạch màn hình theo dõi.
