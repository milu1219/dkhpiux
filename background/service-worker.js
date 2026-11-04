/**
 * IUH DKHP Pro - Background Service Worker (Manifest V3 - Ultra Optimized)
 * Hỗ trợ thông báo hệ thống, giữ phiên, Turbo Extreme Network Booster
 */

// Định nghĩa rule IDs cho Turbo Booster
const TURBO_RULE_BLOCK_ASSETS_ID = 1001;
const TURBO_RULE_ALLOW_CAPTCHA_ID = 1002;
const TURBO_RULE_BLOCK_TRACKERS_ID = 1003;
const TURBO_RULE_BLOCK_BEACONS_ID = 1004;

// Kích hoạt hoặc tắt chế độ Turbo Network Booster (Chặn triệt để tài nguyên rác & trackers)
async function setTurboNetworkMode(enabled) {
  try {
    const allRuleIds = [
      TURBO_RULE_BLOCK_ASSETS_ID,
      TURBO_RULE_ALLOW_CAPTCHA_ID,
      TURBO_RULE_BLOCK_TRACKERS_ID,
      TURBO_RULE_BLOCK_BEACONS_ID
    ];

    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: allRuleIds,
        addRules: [
          // Rule 1: Chặn ảnh, media, font nặng trên toàn bộ hệ thống IUH
          {
            id: TURBO_RULE_BLOCK_ASSETS_ID,
            priority: 1,
            action: { type: 'block' },
            condition: {
              urlFilter: '||iuh.edu.vn',
              resourceTypes: ['image', 'media', 'font']
            }
          },
          // Rule 2: Ưu tiên ngoại lệ cho Captcha (để không bị mất hình xác thực nếu có)
          {
            id: TURBO_RULE_ALLOW_CAPTCHA_ID,
            priority: 3,
            action: { type: 'allow' },
            condition: {
              urlFilter: '*captcha*',
              resourceTypes: ['image']
            }
          },
          // Rule 3: Chặn toàn bộ Google Analytics, Facebook Pixel, Hotjar, Clarity, Ads
          {
            id: TURBO_RULE_BLOCK_TRACKERS_ID,
            priority: 2,
            action: { type: 'block' },
            condition: {
              urlFilter: '*analytics*|*gtag*|*googletagmanager*|*clarity.ms*|*hotjar*|*connect.facebook.net*|*doubleclick*',
              resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'ping']
            }
          },
          // Rule 4: Chặn các beacon ping ngầm gây nghẽn socket
          {
            id: TURBO_RULE_BLOCK_BEACONS_ID,
            priority: 2,
            action: { type: 'block' },
            condition: {
              resourceTypes: ['ping', 'csp_report']
            }
          }
        ]
      });
      console.log('[Turbo Booster] ĐÃ BẬT chế độ tăng cường mạng tối đa (Chặn assets & trackers rác)');
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: allRuleIds
      });
      console.log('[Turbo Booster] ĐÃ TẮT chế độ tăng cường mạng');
    }
  } catch (err) {
    console.error('[Turbo Booster] Lỗi cập nhật dynamic rules:', err);
  }
}

// Lắng nghe khi extension được cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[IUH DKHP Pro] Extension đã được cài đặt:', details.reason);
  
  // Khởi tạo cấu hình mặc định trong chrome.storage.local
  chrome.storage.local.get(['dkhp_settings', 'dkhp_targets'], (res) => {
    const defaultSettings = {
      autoRegister: true,        // Tự động bấm nút Đăng ký khi chọn được lớp
      intervalMs: 500,           // Tần suất quét/thử lại tối ưu (500ms)
      soundAlert: true,          // Phát âm thanh khi có slot/thành công
      antiLogout: true,          // Tự động giữ phiên đăng nhập
      antiLogoutMinutes: 2,      // Ping mỗi 2 phút
      autoSelectPractice: true,  // Tự động chọn nhóm thực hành đầu tiên còn chỗ nếu có
      notifySystem: true,        // Bắn thông báo desktop khi thành công
      hideFullClasses: false,    // Ẩn lớp đã đầy
      highlightOpenClasses: true,// Tô xanh lớp còn chỗ
      isMinimized: true,         // Mặc định luôn thu gọn
      autoOpenHUD: false,        // Tắt tự động mở to khi vào trang
      // TURBO & ZERO-DELAY SETTINGS:
      turboMode: true,           // Mặc định BẬT Turbo Vượt Lag
      zeroDelayMode: true,       // Bật Fast-Track Zero-Delay (20ms phản hồi)
      autoRetryOn50x: true,      // Tự động thử lại khi dính 502/503/504
      maxRetries: 5,             // Tối đa 5 lần retry nhanh
      retryDelayMs: 300          // Delay giữa các lần retry nhanh
    };

    if (!res.dkhp_settings) {
      chrome.storage.local.set({ dkhp_settings: defaultSettings });
      setTurboNetworkMode(true);
    } else {
      const merged = Object.assign({}, defaultSettings, res.dkhp_settings);
      chrome.storage.local.set({ dkhp_settings: merged });
      if (merged.turboMode) {
        setTurboNetworkMode(true);
      }
    }

    if (!res.dkhp_targets) {
      chrome.storage.local.set({ dkhp_targets: [] });
    }
  });

  // Đặt icon badge mặc định
  chrome.action.setBadgeText({ text: '' });
});

// Khi browser khởi động lại, khôi phục rule nếu turboMode đang bật
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['dkhp_settings'], (res) => {
    if (res.dkhp_settings && res.dkhp_settings.turboMode) {
      setTurboNetworkMode(true);
    }
  });
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
    return true;
  }

  // Bật/tắt Turbo Mode
  if (message.action === 'SET_TURBO_MODE') {
    setTurboNetworkMode(!!message.enabled).then(() => {
      chrome.storage.local.get(['dkhp_settings'], (res) => {
        const s = res.dkhp_settings || {};
        s.turboMode = !!message.enabled;
        chrome.storage.local.set({ dkhp_settings: s });
      });
      sendResponse({ success: true, turboMode: !!message.enabled });
    });
    return true;
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
    return true;
  }

  // Yêu cầu chuyển tab hoặc mở trang DKHP IUH
  if (message.action === 'OPEN_DKHP_TAB') {
    chrome.tabs.create({ url: 'https://dkhp.iuh.edu.vn/' });
    sendResponse({ success: true });
    return true;
  }

  return true;
});
