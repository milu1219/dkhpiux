# IUH DKHP PRO - Tool Đăng Ký Học Phần Đại học Công nghiệp TP.HCM (IUH)

Tiện ích mở rộng (Browser Extension - Manifest V3) tối ưu cho trình duyệt **Brave** (và các trình duyệt nền Chromium như Chrome, Edge, Cốc Cốc) phục vụ sinh viên IUH săn môn, canh slot lớp đầy và đăng ký học phần nhanh chóng.

## Cấu trúc thư mục
```
tool dkhp/
├── manifest.json              # File cấu hình Manifest V3
├── icons/                     # Bộ icon ứng dụng (16x16, 48x48, 128x128)
├── background/
│   └── service-worker.js      # Service Worker xử lý thông báo, badge và keep-alive
├── content/
│   ├── content.js             # Logic chính điều khiển DOM, vòng lặp săn slot & Web Audio
│   ├── content.css            # Giao diện Widget nổi (HUD) kéo thả trên web trường
│   └── injected.js            # Script nhúng ngữ cảnh trang IUH để bắt AJAX & modal
├── popup/
│   ├── popup.html             # Giao diện menu khi bấm icon extension
│   ├── popup.css              # Giao diện popup
│   └── popup.js               # Logic quản lý popup và lưu storage
├── test_dkhp_simulator.html   # Trang web giả lập cổng IUH để thử nghiệm extension
├── HUONG_DAN_CAI_DAT_BRAVE.md # Hướng dẫn chi tiết từng bước cho người dùng Brave
└── README.md
```

## Các tính năng chính
1. **Săn slot tự động (Auto Slot Hunter):** Tự động phát hiện khi lớp hết chỗ có người nhả slot hoặc trường tăng chỉ tiêu, lập tức tick chọn và gửi lệnh đăng ký.
2. **Auto Click Giờ G:** Hỗ trợ quét và đăng ký thần tốc ngay thời điểm mở cổng đăng ký.
3. **Chống văng phiên (Anti-Logout / Keep-Alive):** Tự động ping máy chủ IUH định kỳ để duy trì phiên làm việc không bị hết hạn.
4. **Giao diện HUD trực quan kéo thả:** Widget xuất hiện trực tiếp ngay trên trang web của trường, có thể di chuyển, thu nhỏ/phóng to tùy ý.
5. **Gắn nút 1-click [+ Săn] vào bảng:** Tự động đính nút tiện lợi vào từng lớp học phần trên trang của trường.
6. **Âm thanh & Thông báo Desktop:** Tích hợp bộ tổng hợp âm thanh Web Audio API và thông báo hệ điều hành khi đăng ký thành công.
