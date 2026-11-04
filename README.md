# IUH DKHP PRO (TURBO EDITION) - Tool Đăng Ký Học Phần & Tăng Cường Mạng Vượt Lag

Tiện ích mở rộng (Browser Extension - Manifest V3) tối ưu cho trình duyệt **Brave** (và các trình duyệt nền Chromium như Chrome, Edge, Cốc Cốc) phục vụ sinh viên IUH săn môn, canh slot lớp đầy và **vượt nghẽn mạng/sập server giờ G**.

---

## ⚡ Các tính năng nổi bật (v1.2 Turbo Edition)

1. **🚀 Turbo Network Booster (Chế độ Vượt Lag Mạng):**
   - Tự động dùng `declarativeNetRequest` chặn toàn bộ hình ảnh, banner, video, font chữ nặng và tracking trên cổng trường IUH.
   - Giảm **90% dung lượng truyền tải**, giúp trang web tải và gửi lệnh đăng ký cực nhanh ngay cả khi dùng 3G yếu hoặc mạng Wi-Fi nghẽn giờ G.
   - Tự động miễn trừ Captcha để không bao giờ bị lỗi xác thực.
2. **📡 Đo Ping & Tình trạng kết nối thời gian thực (Live Ping Monitor):**
   - Hiển thị độ trễ mạng (Ping ms) trực tiếp trên thanh công cụ HUD:
     - `Ping < 150ms 🟢`: Mạng mượt mà, đường truyền thông suốt.
     - `Ping 180ms - 400ms 🟡`: Mạng có dấu hiệu chậm/lag.
     - `Ping > 400ms hoặc Timeout 🔴`: Server đang quá tải/sập cổng, cần cẩn trọng.
3. **🔁 Tự động Retry khi dính lỗi mạng/sập server (502 / 503 / 504):**
   - Khi hàng chục ngàn sinh viên cùng đăng ký, máy chủ IUH thường trả về mã lỗi `502 Bad Gateway`, `504 Gateway Timeout` hoặc `Connection Reset`.
   - Tool tự động bắt các mã lỗi này và gửi lại lệnh ĐK ngay lập tức theo chu kỳ nhịp ngắn (250ms - 400ms) mà không làm mất phiên hoặc yêu cầu người dùng phải F5 lại toàn bộ trang.
4. **🔄 Soft-Refresh (Làm mới bảng học phần không cần F5):**
   - Chỉ yêu cầu máy chủ nạp lại dữ liệu lớp học phần, loại bỏ việc phải load lại toàn bộ website khi muốn cập nhật sĩ số.
5. **🎯 Săn slot tự động (Auto Slot Hunter):**
   - Tự động phát hiện khi lớp hết chỗ có người nhả slot hoặc trường tăng chỉ tiêu, lập tức tick chọn và gửi lệnh đăng ký.
6. **⚡ Auto Click Giờ G:**
   - Hỗ trợ quét và đăng ký thần tốc ngay thời điểm mở cổng đăng ký.
7. **🛡️ Chống văng phiên (Anti-Logout / Keep-Alive):**
   - Tự động gửi ping nhẹ định kỳ để duy trì phiên làm việc không bị hết hạn khi bạn treo máy chờ giờ mở cổng.
8. **📱 Giao diện HUD trực quan & Nút thu gọn tiện lợi:**
   - Kéo thả tự do trên màn hình, dễ dàng thu nhỏ thành nút tròn nhỏ gọn không vướng mắt.
9. **🎵 Web Audio Synthesizer:**
   - Âm thanh báo hiệu tích hợp nội bộ, không cần tải file ngoài.

---

## 📂 Cấu trúc thư mục

```text
tool mang/
├── manifest.json              # File cấu hình Manifest V3 (Bổ sung declarativeNetRequest)
├── icons/                     # Bộ icon ứng dụng (16x16, 48x48, 128x128)
├── background/
│   └── service-worker.js      # Service Worker xử lý declarativeNetRequest, Turbo Mode & keep-alive
├── content/
│   ├── content.js             # Logic chính săn slot, đo ping, auto-retry 50x & HUD
│   ├── content.css            # Giao diện HUD, Ping badge, Turbo Switch & Highlighting
│   └── injected.js            # Script nhúng bắt lỗi server 502/504 và sự kiện AJAX
├── popup/
│   ├── popup.html             # Menu popup với công tắc Turbo Vượt Lag
│   ├── popup.css              # Giao diện popup
│   └── popup.js               # Logic quản lý popup
├── test_dkhp_simulator.html   # Trang web giả lập cổng IUH để thử nghiệm extension
├── test-server.js             # Máy chủ Node.js test local
├── HUONG_DAN_CAI_DAT_BRAVE.md # Hướng dẫn chi tiết từng bước cho người dùng Brave
└── README.md
```
