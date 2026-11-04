# HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG TOOL ĐKHP IUH (TURBO EDITION) TRÊN BRAVE

Chào bạn! Đây là bản nâng cấp **IUH DKHP PRO - TURBO EDITION** (Manifest V3) đã được tích hợp bộ công cụ **Tăng cường mạng & Vượt lag giờ G** dành riêng cho sinh viên Đại học Công nghiệp TP.HCM (IUH).

---

## 🚀 1. CÁCH CÀI ĐẶT EXTENSION VÀO TRÌNH DUYỆT BRAVE (3 BƯỚC)

1. **Bước 1**: Mở trình duyệt **Brave**, dán đường dẫn sau vào thanh địa chỉ rồi nhấn **Enter**:
   ```text
   brave://extensions/
   ```
   *(Hoặc bấm vào menu 3 dấu gạch ngang ở góc trên bên phải $\rightarrow$ Chọn **Tiện ích mở rộng** / **Extensions**)*.

2. **Bước 2**: Ở góc trên bên phải màn hình trang Extensions, gạt bật công tắc **"Chế độ cho nhà phát triển" (Developer mode)**.

3. **Bước 3**: Nhấn vào nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái màn hình:
   * Tìm và chọn đúng thư mục chứa tool:
   ```text
   c:\Users\hi\Desktop\tool mang
   ```
   * Nhấn **Select Folder** (Chọn thư mục).

👉 **Xong!** Bạn sẽ thấy extension **IUH DKHP Pro - Tool Đăng Ký Học Phần & Turbo Vượt Lag (v1.2.0)** xuất hiện. Hãy bấm vào biểu tượng "Mảnh ghép" ở thanh công cụ Brave và bấm "Ghim" (Pin) extension để tiện theo dõi.

---

## ⚡ 2. CÁC TÍNH NĂNG TĂNG CƯỜNG MẠNG VƯỢT LAG (TURBO MODE)

Khi bạn vào trang `https://dkhp.iuh.edu.vn` (hoặc mở trang giả lập test):

### 🚀 Tính năng A: Chế độ Turbo Network Mode (Chặn tài nguyên nặng)
* **Vì sao cần?** Khi mạng lag hoặc server trường quá tải, việc tải hình ảnh, banner, font chữ trang trí sẽ khiến trình duyệt bị "treo", trắng trang và không gửi được lệnh ĐKHP.
* **Cơ chế:** Khi bật công tắc **Turbo Mode** trong tab `⚡ Vượt Lag` (hoặc trong popup icon), extension tự động chặn toàn bộ ảnh, media, font nặng của IUH. Trang web sẽ tải siêu nhẹ (tiết kiệm 90% băng thông) giúp gửi request đăng ký thành công ngay cả với mạng 3G/Wi-Fi yếu. *(Extension tự động miễn trừ Captcha nếu có nên không lo mất mã xác nhận)*.

### 📡 Tính năng B: Đo Ping & Theo dõi trạng thái máy chủ (Live Latency)
* Trên thanh tiêu đề HUD luôn hiển thị chỉ số **Ping (ms)**:
  * **Xanh lá (dưới 150ms):** Đường truyền mạng cực thông thoáng, sẵn sàng săn slot.
  * **Vàng (150ms - 400ms):** Mạng hơi chậm hoặc server đang bắt đầu đông sinh viên.
  * **Đỏ (trên 400ms hoặc Timeout):** Máy chủ đang bị nghẽn nặng.

### 🔁 Tính năng C: Tự Động Retry khi dính lỗi mạng (502 / 503 / 504 / Timeout)
* Khi dính mã lỗi máy chủ quá tải (`502 Bad Gateway`, `504 Gateway Timeout`), tool không bỏ cuộc mà sẽ tự động gửi lại lệnh ĐK ngay lập tức theo nhịp delay đã chọn (mặc định 400ms).
* Bạn không cần phải bấm F5 thủ công (F5 thủ công dễ làm mất phiên đăng nhập).

### 🔄 Tính năng D: Soft-Refresh (Làm mới bảng không cần F5)
* Nút **🔄 Tải Lại Bảng Nhanh** trong tab `⚡ Vượt Lag` giúp bạn yêu cầu máy chủ nạp lại dữ liệu lớp học phần tức thì mà không cần nạp lại toàn bộ trang web.

---

## 🎯 3. QUY TRÌNH SĂN MÔN GIỜ G (CHUẨN 100%)

1. **Trước giờ mở cổng 10-15 phút:**
   * Đăng nhập vào `https://dkhp.iuh.edu.vn`.
   * Mở widget tool lên, kiểm tra thấy **Ping xanh lá**.
   * Nhập sẵn các Mã lớp học phần cần đăng ký vào danh sách theo dõi.
   * Để nguyên trình duyệt, tính năng **Keep-Alive** sẽ tự động giữ bạn không bị văng phiên.
2. **Trước giờ mở cổng 30 giây:**
   * Bấm nút **🚀 BẮT ĐẦU SĂN**.
   * Kiểm tra công tắc **Turbo Network Mode** đang BẬT.
3. **Đúng giờ G:**
   * Ngay khi trường mở hệ thống, tool sẽ nhận diện slot và bắn lệnh đăng ký với độ trễ tối thiểu.
   * Nếu server bị nghẽn 502/504, cơ chế Auto-Retry sẽ liên tục nhồi lệnh cho đến khi lọt vào thành công!

---

## 🧪 4. THỬ NGHIỆM TRÊN TRANG MÔ PHỎNG (TEST SIMULATOR)

Để kiểm tra trước các tính năng mà không cần đợi đợt đăng ký thật:
1. Mở PowerShell trong thư mục này và chạy:
   ```powershell
   node test-server.js
   ```
2. Mở trình duyệt Brave truy cập:
   ```text
   http://localhost:3000/test_dkhp_simulator.html
   ```
3. Bạn sẽ thấy widget HUD xuất hiện và có thể thử nghiệm đầy đủ các tính năng Săn slot, Bật/Tắt Turbo, Đo Ping, Thử loa âm thanh...
