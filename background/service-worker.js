/**
 * IUH DKHP Pro - Background Service Worker (Manifest V3)
 * Hỗ trợ thông báo hệ thống, giữ phiên và giao tiếp giữa popup - content script
 */

// Lắng nghe khi extension được cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[IUH DKHP Pro] Extension đã được cài đặt:', details.reason);
  
  // Khởi tạo cấu hình mặc định trong chrome.storage.local
  chrome.storage.local.get(['dkhp_settings', 'dkhp_targets'], (res) => {
    if (!res.dkhp_settings) {
      chrome.storage.local.set({
        dkhp_settings: {
          autoRegister: true,        // Tự động bấm nút Đăng ký khi chọn được lớp
          intervalMs: 800,           // Tần suất quét/thử lại (ms)
          soundAlert: true,          // Phát âm thanh khi có slot/thành công
          antiLogout: true,          // Tự động giữ phiên đăng nhập
          antiLogoutMinutes: 2,      // Ping mỗi 2 phút
          autoSelectPractice: true,  // Tự động chọn nhóm thực hành đầu tiên còn chỗ nếu có
          notifySystem: true,        // Bắn thông báo desktop khi thành công
          hideFullClasses: false,    // Ẩn lớp đã đầy
          highlightOpenClasses: true,// Tô xanh lớp còn chỗ
          isMinimized: true,         // Mặc định luôn thu gọn
          autoOpenHUD: false         // Tắt tự động mở to khi vào trang
        }
      });
    }

    if (!res.dkhp_targets) {
      chrome.storage.local.set({ dkhp_targets: [] });
    }
  });

  // Đặt icon badge mặc định
  chrome.action.setBadgeText({ text: '' });
});

// Lắng nghe thông điệp từ content script hoặc popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SET_BADGE') {
    chrome.action.setBadgeText({
      text: message.text || '',
      tabId: sender.tab ? sender.tab.id : undefined
    });
    if (message.color) {
      chrome.action.setBadgeBackgroundColor({
        color: message.color,
        tabId: sender.tab ? sender.tab.id : undefined
      });
    }
    sendResponse({ success: true });
  }

  // Thông báo desktop
  if (message.action === 'NOTIFY_DESKTOP') {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: message.title || 'IUH DKHP PRO - THÔNG BÁO',
        message: message.body || 'Đã có sự kiện đăng ký học phần!',
        priority: 2
      });
    } catch (e) {
      console.warn('Lỗi hiển thị notification:', e);
    }
    sendResponse({ success: true });
  }

  // Yêu cầu chuyển tab hoặc mở trang DKHP IUH
  if (message.action === 'OPEN_DKHP_TAB') {
    chrome.tabs.create({ url: 'https://dkhp.iuh.edu.vn/' });
    sendResponse({ success: true });
  }

  return true;
});
