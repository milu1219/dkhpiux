/**
 * IUH DKHP Pro - Injected Script (Main World)
 * Chạy trực tiếp trong ngữ cảnh trang web IUH để bắt AJAX, ghi nhận thông báo server và hỗ trợ gọi hàm gốc
 */

(function () {
  console.log('[IUH DKHP Pro] Injected script đã nhúng vào main world!');

  // Hook XMLHttpRequest để bắt response và lỗi mạng từ dkhp.iuh.edu.vn
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
        const isDkhpReq =
          url.includes('DangKy') ||
          url.includes('LopHocPhan') ||
          url.includes('HocPhan') ||
          url.includes('api') ||
          url.includes('action');

        if (isDkhpReq) {
          // Bắt lỗi server nghẽn (500, 502 Bad Gateway, 503, 504 Gateway Timeout)
          if (xhr.status >= 500 || xhr.status === 0) {
            window.postMessage(
              {
                source: 'IUH_DKHP_INJECTED',
                type: 'SERVER_NETWORK_ERROR',
                url: url,
                status: xhr.status,
                statusText: xhr.statusText
              },
              '*'
            );
          } else {
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
        }
      } catch (err) {
        // ignore
      }
    });

    xhr.addEventListener('error', function () {
      try {
        window.postMessage(
          {
            source: 'IUH_DKHP_INJECTED',
            type: 'SERVER_NETWORK_ERROR',
            url: url,
            status: 0,
            statusText: 'Network Connection Failed'
          },
          '*'
        );
      } catch (e) {}
    });

    xhr.addEventListener('timeout', function () {
      try {
        window.postMessage(
          {
            source: 'IUH_DKHP_INJECTED',
            type: 'SERVER_NETWORK_ERROR',
            url: url,
            status: 504,
            statusText: 'Gateway / Connection Timed Out'
          },
          '*'
        );
      } catch (e) {}
    });

    return xhr;
  }
  window.XMLHttpRequest = CustomXHR;

  // Hook window.fetch
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      try {
        const response = await originalFetch.apply(this, args);
        if (
          url.includes('DangKy') ||
          url.includes('LopHocPhan') ||
          url.includes('HocPhan') ||
          url.includes('api') ||
          url.includes('action')
        ) {
          if (response.status >= 500) {
            window.postMessage(
              {
                source: 'IUH_DKHP_INJECTED',
                type: 'SERVER_NETWORK_ERROR',
                url: url,
                status: response.status,
                statusText: response.statusText
              },
              '*'
            );
          } else {
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
        }
        return response;
      } catch (e) {
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
              type: 'SERVER_NETWORK_ERROR',
              url: url,
              status: 0,
              statusText: e.message || 'Fetch Failed'
            },
            '*'
          );
        }
        throw e;
      }
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
