/**
 * IUH DKHP Pro - Injected Script (Main World)
 * Chạy trực tiếp trong ngữ cảnh trang web IUH để bắt AJAX, ghi nhận thông báo server và hỗ trợ gọi hàm gốc
 */

(function () {
  console.log('[IUH DKHP Pro] Injected script đã nhúng vào main world!');

  // Hook XMLHttpRequest để bắt response từ dkhp.iuh.edu.vn
  const originalXHR = window.XMLHttpRequest;
  function CustomXHR() {
    const xhr = new originalXHR();
    let url = '';
    let method = '';

    const origOpen = xhr.open;
    xhr.open = function (m, u) {
      method = m;
      url = u;
      return origOpen.apply(xhr, arguments);
    };

    xhr.addEventListener('load', function () {
      try {
        if (
          url.includes('DangKy') ||
          url.includes('LopHocPhan') ||
          url.includes('HocPhan') ||
          url.includes('api') ||
          url.includes('action')
        ) {
          window.postMessage(
            {
              source: 'IUH_DKHP_INJECTED',
              type: 'XHR_RESPONSE',
              url: url,
              status: xhr.status,
              response: xhr.responseText
            },
            '*'
          );
        }
      } catch (err) {
        // ignore
      }
    });

    return xhr;
  }
  window.XMLHttpRequest = CustomXHR;

  // Hook window.fetch
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        if (
          url.includes('DangKy') ||
          url.includes('LopHocPhan') ||
          url.includes('HocPhan') ||
          url.includes('api') ||
          url.includes('action')
        ) {
          const clone = response.clone();
          clone.text().then((text) => {
            window.postMessage(
              {
                source: 'IUH_DKHP_INJECTED',
                type: 'FETCH_RESPONSE',
                url: url,
                status: response.status,
                response: text
              },
              '*'
            );
          });
        }
      } catch (e) {
        // ignore
      }
      return response;
    };
  }

  // Hook window.alert để không làm treo luồng tự động săn môn
  const originalAlert = window.alert;
  window.alert = function (msg) {
    console.log('[IUH DKHP Pro] Bắt được alert:', msg);
    window.postMessage(
      {
        source: 'IUH_DKHP_INJECTED',
        type: 'WINDOW_ALERT',
        message: String(msg)
      },
      '*'
    );
    // Vẫn gọi alert gốc nếu muốn, hoặc cho qua
    return originalAlert.apply(this, arguments);
  };

  // Lắng nghe lệnh từ Content Script chuyển xuống Main World
  window.addEventListener('message', function (event) {
    if (event.data && event.data.target === 'IUH_DKHP_INJECTED_INVOKE') {
      const { funcName, args } = event.data;
      if (typeof window[funcName] === 'function') {
        try {
          const res = window[funcName].apply(window, args || []);
          console.log(`[IUH DKHP Pro] Gọi hàm gốc ${funcName} thành công:`, res);
        } catch (e) {
          console.error(`[IUH DKHP Pro] Lỗi khi gọi hàm gốc ${funcName}:`, e);
        }
      }
    }
  });
})();

