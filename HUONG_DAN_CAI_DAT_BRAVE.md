# HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG TOOL ĐKHP IUH TRÊN TRÌNH DUYỆT BRAVE

Chào bạn! Đây là bộ công cụ **IUH DKHP PRO** (Extension chuẩn Manifest V3) được thiết kế chuyên biệt cho sinh viên **Trường Đại học Công nghiệp TP.HCM (IUH)** để đăng ký học phần tại trang `https://dkhp.iuh.edu.vn`.

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
   C:\Users\hi\Desktop\tool dkhp
   ```
   * Nhấn **Select Folder** (Chọn thư mục).

👉 **Xong!** Bạn sẽ thấy extension **IUH DKHP PRO - Tool Đăng Ký Học Phần IUH** xuất hiện với icon màu xanh có tia sét vàng. Bạn nên bấm vào biểu tượng "Mảnh ghép" ở góc trên thanh công cụ của Brave và bấm "Ghim" (Pin) extension để tiện theo dõi.

---

## 🛡️ 2. LƯU Ý QUAN TRỌNG ĐỐI VỚI TRÌNH DUYỆT BRAVE (BRAVE SHIELDS)

Trình duyệt Brave có cơ chế bảo mật tích hợp rất nghiêm ngặt (**Brave Shields**). Đôi khi Shields sẽ chặn cookie phiên hoặc các request ngầm của trang web trường:

* Khi truy cập trang **https://dkhp.iuh.edu.vn**:
* Hãy bấm vào biểu tượng **Đầu sư tử màu cam (Brave Shields)** ở góc phải thanh địa chỉ.
* Gạt công tắc sang trạng thái **TẮT** cho trang này (*Shields are DOWN for this site*).
* Việc này giúp kết nối đăng nhập của trường ổn định 100%, không bị văng phiên.

---

## ⚡ 3. CÁC TÍNH NĂNG VÀ CÁCH SỬ DỤNG THỰC CHIẾN

Khi bạn vào trang `https://dkhp.iuh.edu.vn` (hoặc `https://sv.iuh.edu.vn`), **Bảng điều khiển HUD** sẽ tự động hiện nổi ở góc màn hình.

### Tính năng 1: 🎯 Săn Slot Lớp Đầy (Auto Slot Hunter)
* **Tình huống:** Lớp bạn muốn học đã hết chỗ (`60/60`), bạn muốn canh khi có ai hủy môn hoặc trường mở thêm slot là hốt ngay.
* **Cách dùng:**
  1. Nhập Mã lớp học phần (vd: `420300123401`) vào ô `Nhập mã LHP` rồi bấm **+ Thêm** (hoặc bấm trực tiếp nút `⚡ Săn` gắn sẵn trên bảng môn học của IUH).
  2. Bấm nút **🚀 BẮT ĐẦU SĂN**.
  3. Tool sẽ liên tục quét sĩ số. Ngay khi sĩ số `< Sĩ số tối đa` (có chỗ trống), tool sẽ:
     * Tự động tick chọn lớp.
     * Tự động chọn nhóm thực hành (nếu môn có thực hành).
     * Tự động bấm nút "Đăng ký học phần".
     * Tự động bấm xác nhận popup.
     * Phát chuông chiến thắng 🎵 và gửi thông báo Desktop!

### Tính năng 2: ⚡ Auto Click Giờ G (00:00:00)
* **Tình huống:** Đợt đăng ký sắp mở lúc 00h00 hoặc 07h00 sáng, sinh viên chen chúc đăng ký.
* **Cách dùng:**
  1. Thêm trước các mã lớp bạn muốn đăng ký vào danh sách của tool.
  2. Đúng giây mở cổng, bấm nút **⚡ ĐK Ngay** hoặc bật **BẮT ĐẦU SĂN**.
  3. Tool sẽ thực hiện thao tác nhanh hơn bấm tay hàng chục lần.

### Tính năng 3: 🛡️ Giữ Phiên Đăng Nhập (Anti-Logout)
* Cổng trường IUH thường tự động logout sau khoảng 10-15 phút không thao tác. Nếu bạn treo máy chờ giờ mở cổng, bạn rất dễ bị văng ra ngoài mà không biết.
* Tool được tích hợp sẵn tính năng **Heartbeat Ping** ngầm mỗi 2 phút, giúp duy trì cookie đăng nhập liên tục suốt nhiều giờ.

### Tính năng 4: 🔍 Bộ Lọc & Highlight Thông Minh
* **Ẩn lớp đã đầy:** Giúp bảng môn học gọn gàng, chỉ hiển thị những lớp còn cơ hội đăng ký.
* **Tô màu lớp còn chỗ:** Làm nổi bật màu xanh lá cây cho các lớp còn slot để bạn dễ quan sát.
* **Nút gắn trực tiếp 1-click:** Bấm `⚡ Gắn nút [+ Săn] vào các dòng trên bảng`, mỗi lớp sẽ có 1 nút nhỏ để bạn thêm nhanh vào tool chỉ bằng 1 cú click chuột!

---

## 🎵 4. ÂM THANH BÁO HIỆU
Tool sử dụng bộ tổng hợp âm thanh **Web Audio API** tích hợp sẵn bên trong trình duyệt:
* Không tải file âm thanh từ bên ngoài, hoạt động offline 100%.
* Âm thanh reo chuông khi đăng ký thành công hoặc có slot trống. Bạn có thể bấm nút **"Thử loa"** trên widget để kiểm tra âm lượng.

