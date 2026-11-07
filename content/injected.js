/**
 * IUH DKHP Pro - Injected Script (Main World)
 * Chạy trực tiếp trong ngữ cảnh trang web IUH để bắt AJAX, ghi nhận thông báo server và hỗ trợ gọi hàm gốc
 * (Sử dụng prototype hook an toàn tuyệt đối, không ghi đè constructor XMLHttpRequest của trình duyệt)
 */

(function () {
  if (window.__IUH_DKHP_MAIN_INJECTED__) return;
  window.__IUH_DKHP_MAIN_INJECTED__ = true;

  console.log('[IUH DKHP Pro] Injected script đã nhúng vào main world (Safe Prototype Mode)!');

  // Hook XMLHttpRequest.prototype an toàn (Giữ nguyên 100% XMLHttpRequest.DONE, instanceof và prototype gốc)
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__iuhMethod = method;
      this.__iuhUrl = String(url || '');
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      const xhr = this;
      const url = xhr.__iuhUrl || '';

      const isDkhpReq =
        url.includes('DangKy') ||
        url.includes('LopHocPhan') ||
        url.includes('HocPhan') ||
        url.includes('api') ||
        url.includes('action');

      if (isDkhpReq) {
        xhr.addEventListener('load', function () {
          try {
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
                  response: typeof xhr.responseText === 'string' ? xhr.responseText : ''
                },
                '*'
              );
            }
          } catch (err) {}
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
      }

      return origSend.apply(this, arguments);
    };
  } catch (e) {
    console.warn('[IUH DKHP Pro] Không thể hook XMLHttpRequest.prototype:', e);
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
    return originalAlert.apply(this, arguments);
  };

  // Lắng nghe lệnh từ Content Script chuyển xuống Main World
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.target !== 'IUH_DKHP_INJECTED_INVOKE') return;

    const { funcName, args } = event.data;

    // Hỗ trợ lệnh đặc biệt: Tự động kích hoạt nạp lại bảng Môn học chờ đăng ký trên dkhp.iuh.edu.vn
    if (funcName === '__RELOAD_DKHP_TABLES__') {
      try {
        // 1. Nếu trang có jQuery, kích hoạt sự kiện change trên select Đợt đăng ký và radio Học mới/Học lại/Học cải thiện
        if (window.jQuery) {
          const $ = window.jQuery;
          $('select').not('#iuh-dkhp-hud select').each(function () {
            if ($(this).val()) {
              $(this).trigger('change');
            }
          });
          $('input[type="radio"]:checked').not('#iuh-dkhp-hud input').each(function () {
            $(this).trigger('click').trigger('change');
          });
        }

        // 2. Thử gọi các hàm tải danh sách học phần phổ biến của cổng PMT-EMS / IUH nếu có
        const candidateFuncs = [
          'LoadDanhSachHocPhan',
          'LayDanhSachHocPhanChoDangKy',
          'GetDanhSachHocPhanChoDangKy',
          'LoadHocPhanChoDangKy',
          'loadDanhSachLopHocPhan',
          'TimKiemHocPhan'
        ];
        for (let i = 0; i < candidateFuncs.length; i++) {
          const fn = candidateFuncs[i];
          if (typeof window[fn] === 'function') {
            window[fn]();
            break;
          }
        }
      } catch (err) {
        console.warn('[IUH DKHP Pro] Lỗi khi reload bảng:', err);
      }
      return;
    }

    if (typeof window[funcName] === 'function') {
      try {
        const res = window[funcName].apply(window, args || []);
        console.log(`[IUH DKHP Pro] Gọi hàm gốc ${funcName} thành công:`, res);
      } catch (e) {
        console.error(`[IUH DKHP Pro] Lỗi khi gọi hàm gốc ${funcName}:`, e);
      }
    }
  });
})();
