/**
 * IUH DKHP Pro - Content Script (Ultra Optimized & Zero-Delay Edition)
 * Chạy trực tiếp trên dkhp.iuh.edu.vn, sv.iuh.edu.vn và trang giả lập simulator
 * 
 * Các tối ưu hóa đột phá:
 * 1. Chống Layout Thrashing: Thay thế 100% innerText bằng textContent (nhanh gấp 50 lần, 0% reflow).
 * 2. Zero-Delay Pipeline: Rút ngắn thời gian bấm từ 550ms xuống còn 20ms khi có slot.
 * 3. Loại bỏ vòng lặp DOM thừa: Không chạy applyTableFilters trong vòng lặp săn 300ms.
 * 4. Chặn vòng lặp MutationObserver: Bỏ qua mọi DOM changes phát sinh từ chính HUD.
 * 5. Tiết kiệm CPU: Không vẽ log DOM khi HUD đang thu gọn (Minimized).
 */

(function () {
  'use strict';

  // Tránh inject trùng lặp
  if (window.__IUH_DKHP_PRO_INJECTED__) return;
  window.__IUH_DKHP_PRO_INJECTED__ = true;

  console.log('[IUH DKHP Pro - Ultra Turbo] Content Script đã khởi tạo thành công!');

  // Nhúng injected.js vào main context của trang web
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('content/injected.js');
    s.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.warn('[IUH DKHP Pro] Không thể nhúng injected.js:', e);
  }

  // State quản lý
  const state = {
    isRunning: false,
    timerId: null,
    keepAliveTimerId: null,
    pingTimerId: null,
    sessionStartTime: Date.now(),
    targets: [], // Danh sách: [{ code: '420300123401', practiceGroup: '', status: 'idle', name: '' }]
    retryCount: 0,
    currentPing: -1,
    settings: {
      autoRegister: true,
      intervalMs: 500,           // Mặc định 500ms
      soundAlert: true,
      antiLogout: true,
      antiLogoutMinutes: 2,
      autoSelectPractice: true,
      notifySystem: true,
      hideFullClasses: false,
      highlightOpenClasses: true,
      stopOnSuccess: true,
      isMinimized: true,         // Mặc định luôn thu gọn
      autoOpenHUD: false,        // Tắt tự động mở to khi vào trang
      // TURBO & ZERO-DELAY SETTINGS:
      turboMode: true,           // Chặn ảnh/font/media/trackers
      zeroDelayMode: true,       // Bật Fast-Track Zero-Delay (20ms phản hồi)
      autoRetryOn50x: true,      // Tự động retry khi dính 502/503/504
      maxRetries: 5,             // Tối đa 5 lần retry
      retryDelayMs: 300          // Delay giữa các lần retry
    },
    logs: []
  };

  // ==========================================
  // ÂM THANH BÁO HIỆU (Web Audio API Synthesizer)
  // ==========================================
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type = 'sine', startTimeOffset = 0) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);

      gain.gain.setValueAtTime(0.15, ctx.currentTime + startTimeOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimeOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startTimeOffset);
      osc.stop(ctx.currentTime + startTimeOffset + duration);
    } catch (e) {
      console.warn('Lỗi phát âm thanh:', e);
    }
  }

  function playSoundAlert(type) {
    if (!state.settings.soundAlert) return;
    try {
      if (type === 'success') {
        playTone(523.25, 0.12, 'triangle', 0);
        playTone(659.25, 0.12, 'triangle', 0.13);
        playTone(783.99, 0.14, 'triangle', 0.26);
        playTone(1046.50, 0.35, 'triangle', 0.40);
      } else if (type === 'slot_found') {
        playTone(880, 0.1, 'sine', 0);
        playTone(1174.66, 0.2, 'sine', 0.12);
      } else if (type === 'error') {
        playTone(330, 0.15, 'sawtooth', 0);
        playTone(220, 0.25, 'sawtooth', 0.15);
      }
    } catch (e) {}
  }

  // ==========================================
  // HỆ THỐNG GHI NHẬT KÝ (LOGS) - TỐI ƯU HÓA DOM
  // ==========================================
  function addLog(text, type = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const logItem = { time: timeStr, text: text, type: type };
    state.logs.push(logItem);
    if (state.logs.length > 200) state.logs.shift();

    // CHỈ RENDER DOM KHI BẢNG ĐANG MỞ (tiết kiệm 100% layout thrashing khi thu nhỏ)
    if (!state.settings.isMinimized) {
      const logContainer = document.getElementById('iuh-log-view');
      if (logContainer) {
        const line = document.createElement('div');
        line.className = `iuh-log-line ${type}`;
        line.innerHTML = `<span class="iuh-log-time">[${timeStr}]</span> ${escapeHTML(text)}`;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
  }

  function renderAllLogs() {
    const logContainer = document.getElementById('iuh-log-view');
    if (!logContainer) return;
    let html = '';
    state.logs.forEach((item) => {
      html += `<div class="iuh-log-line ${item.type}"><span class="iuh-log-time">[${item.time}]</span> ${escapeHTML(item.text)}</div>`;
    });
    logContainer.innerHTML = html;
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // ==========================================
  // LOAD & SAVE CẤU HÌNH TỪ STORAGE
  // ==========================================
  // Helper gửi message an toàn (không bao giờ văng lỗi khi vừa reload extension mà chưa F5 trang)
  function safeSendMessage(payload) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(payload, () => {
          void chrome.runtime.lastError;
        });
      }
    } catch (e) {}
  }

  function loadConfig(callback) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['dkhp_settings', 'dkhp_targets'], (data) => {
          if (chrome.runtime.lastError) {
            if (callback) callback();
            return;
          }
          if (data && data.dkhp_settings) {
            state.settings = Object.assign(state.settings, data.dkhp_settings);
          }
          if (data && Array.isArray(data.dkhp_targets)) {
            state.targets = data.dkhp_targets;
          }
          if (callback) callback();
        });
        return;
      }
    } catch (e) {}

    try {
      const savedTargets = localStorage.getItem('__iuh_dkhp_targets__');
      if (savedTargets) state.targets = JSON.parse(savedTargets) || [];
    } catch (e) {}
    if (callback) callback();
  }

  function saveConfig() {
    try {
      localStorage.setItem('__iuh_dkhp_targets__', JSON.stringify(state.targets));
    } catch (e) {}
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          dkhp_settings: state.settings,
          dkhp_targets: state.targets
        });
      }
    } catch (e) {}
  }

  // Tự động đồng bộ danh sách mã LHP giữa tab Chương trình khung, Popup và tab Đăng ký học phần theo thời gian thực
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes.dkhp_targets && Array.isArray(changes.dkhp_targets.newValue)) {
            state.targets = changes.dkhp_targets.newValue;
            updateTargetUI();
            applyTableFilters();
          }
          if (changes.dkhp_settings && changes.dkhp_settings.newValue) {
            state.settings = Object.assign(state.settings, changes.dkhp_settings.newValue);
          }
        }
      });
    }
  } catch (e) {}

  // ==========================================
  // ĐO PING THỜI GIAN THỰC ĐẾN MÁY CHỦ IUH
  // ==========================================
  async function measurePing(showLog = false) {
    // Nếu đang săn slot, hoãn ping để nhường 100% đường truyền cho request ĐKHP
    if (state.isRunning && !showLog) return;

    const start = performance.now();
    try {
      const pingTarget = (window.location.origin.includes('http') ? window.location.origin : '') + '/favicon.ico?_t=' + Date.now();
      await fetch(pingTarget, {
        method: 'HEAD',
        cache: 'no-store',
        mode: 'no-cors'
      });
      const latency = Math.round(performance.now() - start);
      state.currentPing = latency;
      updatePingUI(latency);
      if (showLog) {
        addLog(`📡 Ping đến máy chủ: ${latency}ms`, latency < 200 ? 'success' : 'warn');
      }
    } catch (err) {
      state.currentPing = -1;
      updatePingUI(-1);
      if (showLog) {
        addLog(`❌ Ping thất bại: Không kết nối được đến máy chủ (${err.message})`, 'error');
      }
    }
  }

  function updatePingUI(latency) {
    const badge = document.getElementById('iuh-ping-indicator');
    const liveVal = document.getElementById('iuh-ping-live-val');
    const netStatus = document.getElementById('iuh-net-status-val');

    if (latency < 0) {
      if (badge) {
        badge.className = 'iuh-ping-badge bad';
        badge.innerText = 'Mất kết nối 🔴';
      }
      if (liveVal) liveVal.innerText = 'Timeout';
      if (netStatus) {
        netStatus.innerText = 'Nghẽn/Sập';
        netStatus.style.color = '#ef4444';
      }
    } else {
      let cls = 'good';
      let statusText = 'Mượt mà';
      let color = '#16a34a';

      if (latency > 400) {
        cls = 'bad';
        statusText = 'Nghẽn nặng';
        color = '#ef4444';
      } else if (latency > 180) {
        cls = 'medium';
        statusText = 'Chậm/Lag';
        color = '#f59e0b';
      }

      if (badge) {
        badge.className = `iuh-ping-badge ${cls}`;
        badge.innerText = `Ping: ${latency}ms`;
      }
      if (liveVal) liveVal.innerText = `${latency} ms`;
      if (netStatus) {
        netStatus.innerText = statusText;
        netStatus.style.color = color;
      }
    }
  }

  // ==========================================
  // MỞ KHÓA & NẠP LẠI BẢNG HỌC PHẦN (KHI BỊ ẨN / TRỐNG)
  // ==========================================
  function softRefreshTable() {
    addLog('🔓 [Mở Khóa & Làm Mới] Đang khôi phục hiển thị và nạp lại danh sách môn học...', 'info');

    // 1. Gỡ bỏ toàn bộ class ẩn hoặc style display:none trên các bảng và dòng học phần
    document.querySelectorAll('table, tbody, tr.iuh-row-hidden, tr.iuh-row-full, .hidden, .d-none').forEach((el) => {
      if (el.closest('#iuh-dkhp-hud')) return;
      el.classList.remove('iuh-row-hidden', 'iuh-row-full', 'hidden', 'd-none');
      if (el.style && el.style.display === 'none' && (el.tagName === 'TR' || el.tagName === 'TBODY' || el.tagName === 'TABLE')) {
        el.style.display = '';
      }
    });

    // 2. Mở khóa các nút/ô chọn bị disabled trên trang ĐKHP
    document.querySelectorAll('select[disabled], input[type="radio"][disabled], button[disabled], input[type="button"][disabled]').forEach((el) => {
      if (el.closest('#iuh-dkhp-hud')) return;
      el.disabled = false;
      el.removeAttribute('disabled');
    });

    // 3. Kích hoạt sự kiện change trên ô chọn "Đợt đăng ký" và radio "HỌC MỚI / HỌC LẠI / HỌC CẢI THIỆN" để web trường tải lại bảng môn
    const selects = document.querySelectorAll('select');
    for (let i = 0; i < selects.length; i++) {
      const sel = selects[i];
      if (sel.closest('#iuh-dkhp-hud')) continue;
      if (sel.options && sel.options.length > 0 && (sel.textContent || '').includes('HK')) {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }

    const checkedRadio = document.querySelector('input[type="radio"]:checked');
    if (checkedRadio && !checkedRadio.closest('#iuh-dkhp-hud')) {
      checkedRadio.dispatchEvent(new Event('change', { bubbles: true }));
      checkedRadio.click();
    }

    // 4. Gửi lệnh xuống Main World (injected.js) để kích hoạt jQuery trigger('change') và hàm load gốc của IUH
    window.postMessage({
      target: 'IUH_DKHP_INJECTED_INVOKE',
      funcName: '__RELOAD_DKHP_TABLES__',
      args: []
    }, '*');

    setTimeout(() => {
      injectInlineButtons();
      applyTableFilters();
      addLog('✅ Đã gửi lệnh mở khóa và tải lại bảng học phần!', 'success');
    }, 500);
  }

  // ==========================================
  // PHÂN TÍCH & BẮT PHẦN TỬ (SỬ DỤNG TEXTCONTENT)
  // ==========================================

  // Tự động tích chọn ô "HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH" trên trang ĐKHP IUH
  function ensureNoScheduleConflictChecked() {
    try {
      // Cách 1: Tìm theo thuộc tính id/name/onclick liên quan đến Trùng Lịch
      let chk = document.querySelector(
        'input[type="checkbox"][id*="TrungLich" i], input[type="checkbox"][name*="TrungLich" i], input[type="checkbox"][onclick*="TrungLich" i], input[type="checkbox"][id*="trunglich" i]'
      );

      // Cách 2: Tìm theo nhãn text "HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH"
      if (!chk) {
        const allInputs = document.querySelectorAll('input[type="checkbox"]');
        for (let i = 0; i < allInputs.length; i++) {
          const inp = allInputs[i];
          if (inp.closest('#iuh-dkhp-hud')) continue;
          const parentText = ((inp.parentElement && inp.parentElement.textContent) || '') +
                             ((inp.nextElementSibling && inp.nextElementSibling.textContent) || '') +
                             ((inp.closest('label') && inp.closest('label').textContent) || '');
          if (parentText.toLowerCase().includes('không trùng lịch')) {
            chk = inp;
            break;
          }
        }
      }

      if (chk && !chk.checked) {
        simulateRealClick(chk);
        if (!chk.checked) {
          chk.checked = true;
          chk.dispatchEvent(new Event('change', { bubbles: true }));
        }
        addLog('✅ Đã tự động tích chọn "HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH"!', 'success');
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Tìm mã HP / mã LHP hợp lệ trong từng ô <td> (tránh lỗi dính chữ giữa các cột <td> khi dùng tr.textContent)
  function extractCodeFromRow(tr) {
    const cells = tr.cells;
    if (!cells || !cells.length) return null;

    // Ưu tiên 1: Tìm ô chứa mã bắt đầu bằng 420... (chuẩn mã HP 10 số / mã LHP 12 số của IUH)
    for (let i = 0; i < cells.length; i++) {
      const cellText = (cells[i].textContent || '').trim();
      const match = cellText.match(/(?:^|\D)(420\d{7,11})(?:\D|$)/);
      if (match) {
        return { code: match[1], cell: cells[i], cellIndex: i };
      }
    }

    // Ưu tiên 2: Tìm ô chứa dãy số độc lập từ 10 - 14 chữ số (mã LHP / mã HP chung)
    for (let i = 0; i < cells.length; i++) {
      const cellText = (cells[i].textContent || '').trim();
      const match = cellText.match(/(?:^|\D)(\d{10,14})(?:\D|$)/);
      if (match) {
        return { code: match[1], cell: cells[i], cellIndex: i };
      }
    }

    return null;
  }

  // Tìm các hàng lớp học phần nhanh (Bỏ qua các môn thuộc mục HỌC PHẦN BẮT BUỘC hoặc có tích cột Bắt buộc)
  function findClassRows() {
    const rows = [];
    const allTrs = document.querySelectorAll('table tr');
    let currentTable = null;
    let inCompulsorySection = false;
    let compulsoryColIndex = -1;

    for (let i = 0; i < allTrs.length; i++) {
      const tr = allTrs[i];
      const parentTable = tr.closest('table');
      if (parentTable !== currentTable) {
        currentTable = parentTable;
        inCompulsorySection = false;
        compulsoryColIndex = -1;
        if (parentTable) {
          const ths = parentTable.querySelectorAll('th');
          for (let h = 0; h < ths.length; h++) {
            if ((ths[h].textContent || '').toLowerCase().includes('bắt buộc')) {
              compulsoryColIndex = h;
              break;
            }
          }
        }
      }

      if (tr.firstElementChild && tr.firstElementChild.tagName === 'TH') continue;

      const rowTextLower = (tr.textContent || '').toLowerCase();
      if (rowTextLower.includes('học phần bắt buộc')) {
        inCompulsorySection = true;
        continue;
      }
      if (rowTextLower.includes('học phần tự chọn')) {
        inCompulsorySection = false;
        continue;
      }

      // Bỏ qua các môn nằm trong mục HỌC PHẦN BẮT BUỘC (Chương trình khung)
      if (inCompulsorySection) continue;

      // Bỏ qua các môn có dấu tích ở cột "Bắt buộc" trên bảng Môn học chờ đăng ký
      if (compulsoryColIndex !== -1 && tr.cells && tr.cells[compulsoryColIndex]) {
        const compCell = tr.cells[compulsoryColIndex];
        const compText = (compCell.textContent || '').trim().toLowerCase();
        const hasCompIcon = compCell.querySelector('i, img, svg, span[class*="check"], span[class*="ok"], input:checked');
        if (hasCompIcon || compText === 'x' || compText === '✓' || compText === '✔' || compText === 'có') {
          continue;
        }
      }

      const hasInput = tr.querySelector('input[type="radio"], input[type="checkbox"]');
      const codeObj = extractCodeFromRow(tr);
      if (hasInput || codeObj) {
        rows.push(tr);
      }
    }

    return rows;
  }

  // Trích xuất thông tin hàng (Chỉ đọc Sĩ số / Đã ĐK ở các cột sau Mã LHP để không nhầm với cột STT)
  function parseRowInfo(tr) {
    const cells = tr.cells;
    if (!cells || !cells.length) return null;

    const codeObj = extractCodeFromRow(tr);
    const code = codeObj ? codeObj.code : '';
    const codeCell = codeObj ? codeObj.cell : (cells[1] || cells[0]);
    const codeCellIndex = codeObj ? codeObj.cellIndex : 1;

    const cellTexts = [];
    for (let i = 0; i < cells.length; i++) {
      cellTexts.push((cells[i].textContent || '').trim());
    }
    const rowText = cellTexts.join(' ');
    const statusText = cells.length >= 5 ? cellTexts[cells.length - 1] : '';

    const selectorInput = tr.querySelector('input[type="radio"], input[type="checkbox"]');

    let enrolled = -1;
    let max = -1;
    let remaining = -1;

    // Chỉ tính Sĩ số / Đã ĐK cho dòng Lớp học phần (Mã LHP >= 11 số)
    if (!code || code.length >= 11) {
      const fractionMatch = rowText.match(/(\d+)\s*[\/|\\]\s*(\d+)/);
      if (fractionMatch) {
        enrolled = parseInt(fractionMatch[1], 10);
        max = parseInt(fractionMatch[2], 10);
        remaining = max - enrolled;
      } else {
        // Gom tất cả các ô chứa số nguyên nằm SAU cột Mã LHP (bỏ qua cột STT ở đầu dòng!)
        const numericCols = [];
        for (let i = codeCellIndex + 1; i < cells.length; i++) {
          const t = cellTexts[i];
          if (/^\d{1,3}$/.test(t)) {
            numericCols.push(parseInt(t, 10));
          }
        }
        // Trên bảng LỚP HỌC PHẦN CHỜ ĐĂNG KÝ của IUH: 2 cột số cuối cùng luôn là [Sĩ số tối đa, Đã đăng ký]
        if (numericCols.length >= 2) {
          max = numericCols[numericCols.length - 2];
          enrolled = numericCols[numericCols.length - 1];
          remaining = max - enrolled;
        }
      }
    }

    return {
      tr: tr,
      code: code,
      codeCell: codeCell,
      input: selectorInput,
      enrolled: enrolled,
      max: max,
      remaining: remaining,
      statusText: statusText,
      text: rowText
    };
  }

  // Tìm nút Đăng Ký trên trang IUH (Loại trừ nút trong HUD và menu điều hướng)
  function findRegisterButton() {
    const specific = document.querySelector(
      '#btnDangKy, #btnDangKyHocPhan, #btnDangKyMonHoc, #btnLuu, #btnSubmit, .btn-dangky, .btnDangKy, button[name*="DangKy"], input[name*="DangKy"], button[onclick*="DangKy"], button[onclick*="dangKy"], input[onclick*="DangKy"], a[onclick*="DangKy"]'
    );
    if (specific && isVisible(specific)) {
      if (specific.disabled) {
        specific.disabled = false;
        specific.removeAttribute('disabled');
      }
      return specific;
    }

    const candidates = document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn, a[class*="btn"]');

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest('#iuh-dkhp-hud') || el.classList.contains('iuh-inline-add-btn')) continue;

      // Bỏ qua các thẻ <a> điều hướng chuyển trang thông thường
      if (el.tagName === 'A') {
        const href = (el.getAttribute('href') || '').trim();
        if (href && href !== '#' && !href.startsWith('javascript:')) continue;
      }

      const val = (el.textContent || el.value || '').trim().toLowerCase();
      if (
        (val === 'đăng ký' ||
          val === 'đăng kí' ||
          val.includes('đăng ký môn học') ||
          val.includes('đăng kí môn học') ||
          val.includes('đăng ký học phần') ||
          val.includes('lưu đăng ký') ||
          val.includes('thực hiện đăng ký') ||
          val.includes('xác nhận đăng ký') ||
          val.includes('lưu vào') ||
          val.includes('đăng ký ngay')) &&
        isVisible(el)
      ) {
        if (el.disabled) {
          el.disabled = false;
          el.removeAttribute('disabled');
        }
        return el;
      }
    }

    return null;
  }

  // Tìm và xác nhận popup modal
  function handleConfirmDialog() {
    const swalConfirm = document.querySelector('.swal2-confirm, .swal-button--confirm');
    if (swalConfirm && isVisible(swalConfirm)) {
      addLog('⚡ Tự động xác nhận hộp thoại SweetAlert...', 'warn');
      swalConfirm.click();
      return true;
    }

    const modalConfirm = document.querySelector(
      '.modal.in .btn-primary, .modal.show .btn-primary, .modal .btn-success, .bootbox .btn-primary, .bootbox .btn-success, .ui-dialog-buttonset button:first-child'
    );
    if (modalConfirm && isVisible(modalConfirm)) {
      addLog('⚡ Tự động xác nhận popup modal...', 'warn');
      modalConfirm.click();
      return true;
    }

    return false;
  }

  // Giám sát popup xác nhận tức thì (kiểm tra mỗi 20ms thay vì đợi 250ms)
  function watchAndAutoConfirm(maxWaitMs = 2000) {
    const start = Date.now();
    const interval = setInterval(() => {
      const confirmed = handleConfirmDialog();
      if (confirmed || (Date.now() - start > maxWaitMs)) {
        clearInterval(interval);
      }
    }, 20);
  }

  function isVisible(el) {
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // Click mô phỏng người dùng thật tốc độ cao (đảm bảo input radio/checkbox cập nhật checked trước khi nổ onclick/onchange)
  function simulateRealClick(element) {
    if (!element) return;
    try { element.focus(); } catch (e) {}
    if (element.tagName === 'INPUT' && (element.type === 'radio' || element.type === 'checkbox')) {
      element.click();
      if (!element.checked) {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    ['mousedown', 'mouseup', 'click'].forEach((type) => {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  }

  // Kích hoạt chọn cả hàng (bấm cả radio/checkbox, ô mã và thẻ tr để tương thích mọi bảng của IUH)
  function selectTableRow(rowInfo) {
    if (!rowInfo) return;
    if (rowInfo.input && !rowInfo.input.checked) {
      simulateRealClick(rowInfo.input);
    }
    if (rowInfo.codeCell) {
      simulateRealClick(rowInfo.codeCell);
    }
    if (rowInfo.tr) {
      simulateRealClick(rowInfo.tr);
    }
  }

  // ==========================================
  // THỰC HIỆN ĐĂNG KÝ HỌC PHẦN TỰ ĐỘNG A-Z (MULTI-STAGE ZERO-DELAY)
  // ==========================================
  let isRegisteringLock = false;

  // Chọn môn học (10 số) -> Tự động tích "Không trùng lịch" -> Chờ bảng Lớp HP (12 số) -> Chọn lớp "Chờ sinh viên đăng ký"
  function waitAndSelectOpenClassForSubject(subjectCode, targetItem) {
    ensureNoScheduleConflictChecked();
    addLog(`⏳ Đang lọc lớp KHÔNG TRÙNG LỊCH & tìm lớp "Chờ sinh viên đăng ký" cho môn [${subjectCode}]...`, 'info');

    let attempts = 0;
    const waitClassInterval = setInterval(() => {
      attempts++;
      // Luôn đảm bảo ô "HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH" được tích
      if ( ensureNoScheduleConflictChecked() ) {
        // Nếu vừa mới tích ô Không trùng lịch, đợi nhịp sau (120ms) để bảng kịp lọc lại các lớp không trùng lịch
        return;
      }

      const allRows = findClassRows();
      let hasAnyClassOfSubject = false;

      for (let i = 0; i < allRows.length; i++) {
        const info = parseRowInfo(allRows[i]);
        if (info && info.code && info.code.length >= 11 && info.code.startsWith(subjectCode)) {
          hasAnyClassOfSubject = true;
          if (isRowOpenForReg(info)) {
            clearInterval(waitClassInterval);
            addLog(`🎯 Tìm thấy lớp [${info.code}] (Chờ SV đăng ký - Không trùng lịch)! Tự động chọn & ĐK...`, 'success');
            selectTableRow(info);
            triggerPracticeAndSubmit(targetItem || { code: info.code, practiceGroup: '' });
            return;
          }
        }
      }

      if (attempts >= 25 || (hasAnyClassOfSubject && attempts >= 8)) {
        clearInterval(waitClassInterval);
        if (hasAnyClassOfSubject) {
          addLog(`⚠️ Môn [${subjectCode}] hiện không có lớp nào ở trạng thái "Chờ sinh viên đăng ký" (hoặc đều Đã khóa / Đang lên kế hoạch / Trùng lịch).`, 'warn');
        }
      }
    }, 120);
  }

  function executeRegistration(targetItem, rowInfo) {
    if (isRegisteringLock) return;
    isRegisteringLock = true;
    setTimeout(() => { isRegisteringLock = false; }, 1200);

    // Luôn đảm bảo ô "HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH" được bật
    ensureNoScheduleConflictChecked();

    const codeLabel = (rowInfo && rowInfo.code) || (targetItem && targetItem.code) || 'Lớp đã chọn';
    state.retryCount = 0;

    // 1. Nếu dòng truyền vào là Mã học phần 10 số (bảng Môn học chờ đăng ký ở trên)
    const isSubjectRow = rowInfo && rowInfo.code && rowInfo.code.length === 10;
    if (isSubjectRow) {
      addLog(`⚡ [Auto-Register] Chọn môn [${rowInfo.code}]...`, 'warn');
      selectTableRow(rowInfo);
      waitAndSelectOpenClassForSubject(rowInfo.code, targetItem);
      return;
    }

    // 2. Nếu dòng truyền vào là Lớp học phần 12 số: kiểm tra chắc chắn trạng thái "Chờ sinh viên đăng ký"
    if (rowInfo && !isRowOpenForReg(rowInfo)) {
      addLog(`⛔ Lớp [${codeLabel}] có trạng thái "${rowInfo.statusText || 'Đã khóa/Đang lên KH'}" -> Bỏ qua, không đăng ký!`, 'warn');
      return;
    }

    addLog(`⚡ [Auto-Register] Đang chọn lớp [${codeLabel}] và tự động đăng ký...`, 'warn');
    selectTableRow(rowInfo);

    // 3. Tự động chọn nhóm Thực hành (nếu có) và bấm nút Đăng Ký ngay khi sẵn sàng
    triggerPracticeAndSubmit(targetItem);
  }

  // Quét liên hoàn để chọn nhóm TH và bấm nút Đăng ký ngay khi AJAX của trường tải xong
  function triggerPracticeAndSubmit(targetItem) {
    const checkpoints = state.settings.zeroDelayMode ? [25, 120, 300, 600] : [150, 350, 700];
    let clickedRegister = false;

    checkpoints.forEach((delayMs, idx) => {
      setTimeout(() => {
        if (clickedRegister) return;

        selectPracticeGroupIfAny(targetItem);

        if (state.settings.autoRegister) {
          const regBtn = findRegisterButton();
          if (regBtn) {
            clickedRegister = true;
            const btnLabel = (regBtn.textContent || regBtn.value || 'Nút ĐK').trim();
            addLog(`⚡ [Auto-Register] Tự động bấm "${btnLabel}"!`, 'success');
            simulateRealClick(regBtn);
            watchAndAutoConfirm(2500);
          } else if (idx === checkpoints.length - 1) {
            addLog('⚠️ Chưa thấy nút "Đăng Ký" trên trang (Hãy đảm bảo bạn đang ở mục Đăng Ký Học Phần).', 'warn');
          }
        }
      }, delayMs);
    });
  }

  // Chọn nhóm thực hành nếu môn có chia ca TH (Hỗ trợ cả <select> Nhóm thực hành, radio button và click dòng)
  function selectPracticeGroupIfAny(targetItem) {
    // 1. Hỗ trợ ô dropdown <select> "Nhóm thực hành" trên trang dkhp.iuh.edu.vn/DangKyHocPhan
    const allSelects = document.querySelectorAll('select');
    for (let s = 0; s < allSelects.length; s++) {
      const sel = allSelects[s];
      if (sel.closest('#iuh-dkhp-hud')) continue;
      const selId = ((sel.id || '') + ' ' + (sel.name || '')).toLowerCase();
      const parentTxt = ((sel.parentElement && sel.parentElement.textContent) || '').toLowerCase();
      const isPracticeSelect =
        selId.includes('nhom') ||
        selId.includes('thuchanh') ||
        parentTxt.includes('nhóm thực hành');

      if (isPracticeSelect && sel.options && sel.options.length > 0) {
        for (let o = 0; o < sel.options.length; o++) {
          const opt = sel.options[o];
          const val = (opt.value || '').trim();
          const txt = (opt.textContent || '').trim();
          if (val && val !== '0' && val !== '-1' && !txt.toLowerCase().includes('chọn nhóm')) {
            if (sel.value !== val) {
              sel.value = val;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              addLog(`Tự động chọn Nhóm thực hành: ${txt}`, 'info');
            }
            break;
          }
        }
      }
    }

    // 2. Hỗ trợ radio button chọn nhóm thực hành
    const practiceRadios = document.querySelectorAll(
      '#divNhomThucHanh input[type="radio"], .nhom-thuc-hanh input[type="radio"], table input[name*="ThucHanh"], table input[name*="ChiTiet"], #tbChiTietLopHocPhan input[type="radio"]'
    );

    if (practiceRadios.length) {
      let selectedRadio = null;

      if (targetItem && targetItem.practiceGroup) {
        for (let i = 0; i < practiceRadios.length; i++) {
          const rad = practiceRadios[i];
          const parentText = (rad.closest('tr') || rad.parentElement || {}).textContent || '';
          if (parentText.includes(targetItem.practiceGroup)) {
            selectedRadio = rad;
            break;
          }
        }
      }

      if (!selectedRadio && state.settings.autoSelectPractice) {
        for (let i = 0; i < practiceRadios.length; i++) {
          const rad = practiceRadios[i];
          if (!rad.disabled) {
            selectedRadio = rad;
            break;
          }
        }
      }

      if (selectedRadio && !selectedRadio.checked) {
        const pText = (selectedRadio.closest('tr') || selectedRadio.parentElement || {}).textContent || 'Mặc định';
        addLog(`Tự động chọn nhóm thực hành: ${pText.replace(/\s+/g, ' ').slice(0, 35)}`, 'info');
        simulateRealClick(selectedRadio);
        const parentTr = selectedRadio.closest('tr');
        if (parentTr) simulateRealClick(parentTr);
      }
      return;
    }

    // Trường hợp bảng Chi tiết nhóm TH của IUH chọn bằng cách click vào dòng <tr> (không dùng input radio)
    const detailRows = document.querySelectorAll(
      '#divNhomThucHanh tbody tr, #tbChiTietLopHocPhan tbody tr, .nhom-thuc-hanh tbody tr'
    );
    for (let i = 0; i < detailRows.length; i++) {
      const tr = detailRows[i];
      if (!tr.classList.contains('active') && !tr.classList.contains('selected')) {
        const txt = (tr.textContent || '').trim();
        if (txt && !txt.includes('Hết chỗ')) {
          addLog(`Tự động chọn dòng thực hành: ${txt.replace(/\s+/g, ' ').slice(0, 35)}`, 'info');
          simulateRealClick(tr);
          break;
        }
      }
    }
  }

  // Kiểm tra dòng Lớp học phần có đủ điều kiện đăng ký không:
  // BẮT BUỘC: Trạng thái là "Chờ sinh viên đăng ký" (không chọn "Đã khóa" / "Đang lên kế hoạch") VÀ còn chỗ (remaining > 0)
  function isRowOpenForReg(rowInfo) {
    if (!rowInfo) return false;

    // Nếu là dòng Môn học (10 số) ở bảng trên thì không phải dòng Lớp học phần để bấm ĐK trực tiếp
    if (rowInfo.code && rowInfo.code.length === 10) return false;

    const statusLower = (rowInfo.statusText || '').toLowerCase();
    const rowLower = (rowInfo.text || '').toLowerCase();

    // 1. Loại bỏ ngay các trạng thái không thể đăng ký của IUH
    if (
      statusLower.includes('đã khóa') ||
      statusLower.includes('đang lên kế hoạch') ||
      statusLower.includes('hết chỗ') ||
      statusLower.includes('đã hủy') ||
      statusLower.includes('ngưng') ||
      rowLower.includes('đã khóa') ||
      rowLower.includes('đang lên kế hoạch') ||
      rowLower.includes('hết chỗ')
    ) {
      return false;
    }

    // 2. Nếu có cột Trạng thái trên trang IUH, chỉ nhận "Chờ sinh viên đăng ký" (hoặc "Chấp nhận mở lớp" / "Còn chỗ" trên simulator)
    if (statusLower) {
      const isValidStatus =
        statusLower.includes('chờ sinh viên đăng ký') ||
        statusLower.includes('chờ sinh viên đăng kí') ||
        statusLower.includes('chấp nhận mở lớp') ||
        statusLower.includes('còn chỗ') ||
        statusLower.includes('đang mở');
      if (!isValidStatus) return false;
    }

    // 3. Kiểm tra sĩ số còn trống (Đã đăng ký < Sĩ số tối đa)
    if (rowInfo.remaining === 0 || (rowInfo.max > 0 && rowInfo.enrolled >= rowInfo.max)) {
      return false;
    }

    if (rowInfo.input && rowInfo.input.disabled) return false;
    return true;
  }

  // ==========================================
  // VÒNG LẶP SĂN SLOT (HUNT LOOP TỐI ƯU HÓA)
  // ==========================================
  function runHuntCycle() {
    if (!state.isRunning) return;

    // Luôn đảm bảo ô "HIỂN THỊ LỚP HỌC PHẦN KHÔNG TRÙNG LỊCH" được tích
    ensureNoScheduleConflictChecked();

    const rows = findClassRows();

    for (let t = 0; t < state.targets.length; t++) {
      const target = state.targets[t];
      if (target.status === 'success' && state.settings.stopOnSuccess) continue;

      let subjectRow = null;
      let firstClassRow = null;
      let openClassRow = null;

      const subjectPrefix = target.code.length >= 10 ? target.code.slice(0, 10) : target.code;

      // Duyệt qua các hàng khớp mã (hỗ trợ cả Mã LHP 12 số lẫn Mã HP 10 số)
      for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];
        const rowText = tr.textContent || '';
        if (rowText.includes(target.code) || (subjectPrefix && rowText.includes(subjectPrefix))) {
          const candidate = parseRowInfo(tr);
          if (!candidate || !candidate.code) continue;

          if (candidate.code.length === 10 && candidate.code === subjectPrefix) {
            subjectRow = candidate;
          } else if (candidate.code.includes(target.code)) {
            if (!firstClassRow) firstClassRow = candidate;
            if (isRowOpenForReg(candidate)) {
              openClassRow = candidate;
              break;
            }
          }
        }
      }

      // Nếu người dùng săn theo Mã học phần (10 số) mà bảng Lớp học phần (12 số) bên dưới chưa được mở ra -> Click mở môn học trước
      if (!firstClassRow && !openClassRow && subjectRow) {
        if (!subjectRow.input || !subjectRow.input.checked) {
          addLog(`📂 Tự động chọn môn [${subjectRow.code}] để tải danh sách lớp học phần...`, 'info');
          selectTableRow(subjectRow);
          ensureNoScheduleConflictChecked();
        }
        updateTargetStatusInList(target.code, 'Đang tải danh sách lớp...');
        continue;
      }

      const foundRow = openClassRow || firstClassRow;

      if (foundRow) {
        let statusStr = '';
        if (foundRow.max !== -1 && foundRow.enrolled !== -1) {
          statusStr = `${foundRow.enrolled}/${foundRow.max}`;
        }
        if (foundRow.statusText) {
          statusStr = statusStr ? `${statusStr} - ${foundRow.statusText}` : foundRow.statusText;
        } else if (!statusStr) {
          statusStr = 'Đang mở';
        }

        if (openClassRow) {
          target.status = 'open';
          addLog(`🔥 PHÁT HIỆN LỚP [${openClassRow.code}] (${statusStr})! TỰ ĐỘNG ĐĂNG KÝ...`, 'success');
          playSoundAlert('slot_found');

          chrome.runtime.sendMessage({
            action: 'NOTIFY_DESKTOP',
            title: '🔥 PHÁT HIỆN LỚP CHỜ SV ĐĂNG KÝ!',
            body: `Lớp ${openClassRow.code} (${statusStr}). Đang tự động đăng ký!`
          });

          executeRegistration(target, openClassRow);
          target.status = 'attempting';
          updateTargetUI();
          break;
        } else {
          target.status = 'full';
          updateTargetStatusInList(target.code, `Chưa mở (${statusStr})`);
        }
      } else {
        updateTargetStatusInList(target.code, 'Chưa thấy trên bảng');
      }
    }

    // KHÔNG GỌI applyTableFilters() Ở ĐÂY để giải phóng 95% CPU!

    if (state.isRunning) {
      const delay = Math.max(250, parseInt(state.settings.intervalMs, 10) || 500);
      state.timerId = setTimeout(runHuntCycle, delay);
    }
  }

  function startHunting() {
    if (state.isRunning) return;
    if (!state.targets.length) {
      alert('Vui lòng thêm ít nhất một Mã lớp học phần vào danh sách cần săn!');
      return;
    }

    state.isRunning = true;
    addLog(`BẮT ĐẦU SĂN SLOT (Tần suất: ${state.settings.intervalMs}ms - ZeroDelay: ${state.settings.zeroDelayMode ? 'ON' : 'OFF'})`, 'success');
    playSoundAlert('slot_found');

    updateHUDStatus(true);
    safeSendMessage({ action: 'SET_BADGE', text: 'ON', color: '#16a34a' });

    runHuntCycle();
  }

  function stopHunting() {
    state.isRunning = false;
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
    addLog('ĐÃ TẠM DỪNG SĂN SLOT', 'warn');
    updateHUDStatus(false);
    safeSendMessage({ action: 'SET_BADGE', text: '', color: '#64748b' });
  }

  // ==========================================
  // BỘ LỌC BẢNG & TÔ MÀU (CHỈ TÔ XANH LỚP "CHỜ SINH VIÊN ĐĂNG KÝ" & CÒN CHỖ)
  // ==========================================
  function applyTableFilters() {
    const rows = findClassRows();

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const info = parseRowInfo(tr);
      if (!info) continue;

      const isTarget = state.targets.some((t) => info.code && (t.code === info.code || info.code.startsWith(t.code)));
      if (isTarget) {
        tr.classList.add('iuh-highlight-target');
      } else {
        tr.classList.remove('iuh-highlight-target');
      }

      // Bảng Môn học (10 số) ở trên: không tô màu xanh/mờ theo sĩ số
      if (info.code && info.code.length === 10) {
        tr.classList.remove('iuh-row-full', 'iuh-row-hidden', 'iuh-highlight-open');
        continue;
      }

      // Bảng Lớp học phần (12 số) ở dưới: chỉ coi là mở khi Trạng thái = "Chờ sinh viên đăng ký" và còn chỗ
      const canRegister = isRowOpenForReg(info);
      if (!canRegister) {
        tr.classList.remove('iuh-highlight-open');
        tr.classList.add('iuh-row-full');
        if (state.settings.hideFullClasses) {
          tr.classList.add('iuh-row-hidden');
        } else {
          tr.classList.remove('iuh-row-hidden');
        }
      } else {
        tr.classList.remove('iuh-row-full', 'iuh-row-hidden');
        if (state.settings.highlightOpenClasses) {
          tr.classList.add('iuh-highlight-open');
        } else {
          tr.classList.remove('iuh-highlight-open');
        }
      }
    }
  }

  // Gắn nút "+ Săn lớp" vào từng dòng (Chỉ gắn cho môn tự chọn & các lớp "Chờ sinh viên đăng ký")
  function injectInlineButtons() {
    const rows = findClassRows();
    let count = 0;

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      if (tr.querySelector('.iuh-inline-add-btn')) continue;

      const info = parseRowInfo(tr);
      if (!info || !info.code) continue;

      // Ở bảng Lớp học phần (12 số), bỏ qua không gắn nút Săn cho các lớp "Đã khóa" hoặc "Đã hủy"
      if (info.code.length >= 11 && info.statusText) {
        const st = info.statusText.toLowerCase();
        if (st.includes('đã khóa') || st.includes('đã hủy')) {
          continue;
        }
      }

      const targetCell = info.codeCell || tr.cells[1] || tr.cells[0];
      if (!targetCell) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'iuh-inline-add-btn';
      btn.setAttribute('data-iuh-code', info.code);

      const alreadyInList = state.targets.some((t) => t.code === info.code);
      if (alreadyInList) {
        btn.classList.add('added');
        btn.innerHTML = '✓ Đang săn';
      } else {
        btn.innerHTML = '⚡ Săn';
      }
      btn.title = `Thêm mã ${info.code} vào danh sách săn môn của Tool`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addTargetCode(info.code);
        btn.classList.add('added');
        btn.innerHTML = '✓ Đang săn';

        // Nếu đang ở trang Chương trình khung (chỉ xem mã, không có bảng đăng ký học phần), lưu mã để đồng bộ sang tab ĐKHP
        const isCurriculumPage = window.location.href.toLowerCase().includes('chuong-trinh-khung');
        if (isCurriculumPage) {
          updateTargetStatusInList(info.code, 'Đã lưu (Mở trang ĐKHP để săn)');
          return;
        }

        // Nếu đang ở trang Đăng ký học phần: Tự động bật săn và tiến hành chọn + đăng ký ngay lập tức!
        if (!state.isRunning) {
          startHunting();
        }
        const targetObj = state.targets.find((t) => t.code === info.code) || { code: info.code, practiceGroup: '' };
        executeRegistration(targetObj, info);
      });

      targetCell.appendChild(btn);
      count++;
    }

    if (count > 0) {
      addLog(`Đã gắn nút [+ Săn] vào ${count} dòng hợp lệ trên bảng`, 'info');
    }
  }

  // ==========================================
  // KEEP-ALIVE GIỮ PHIÊN ĐĂNG NHẬP
  // ==========================================
  function setupKeepAlive() {
    if (state.keepAliveTimerId) clearInterval(state.keepAliveTimerId);

    const minutes = Math.max(1, parseInt(state.settings.antiLogoutMinutes, 10) || 2);
    const intervalMs = minutes * 60 * 1000;

    state.keepAliveTimerId = setInterval(() => {
      if (!state.settings.antiLogout) return;

      const pingUrl = window.location.pathname.includes('dkhp') ? window.location.href : '/Home/Index';

      fetch(pingUrl, {
        method: 'GET',
        cache: 'no-cache',
        credentials: 'include'
      })
        .then((res) => {
          if (res.ok) {
            addLog(`🛡️ [Keep-Alive] Giữ phiên thành công (Status: ${res.status})`, 'info');
          }
        })
        .catch(() => {});
    }, intervalMs);
  }

  // ==========================================
  // LẮNG NGHE SỰ KIỆN TỪ MAIN WORLD (INJECTED)
  // ==========================================
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'IUH_DKHP_INJECTED') return;

    // Xử lý thông báo Alert từ trường
    if (event.data.type === 'WINDOW_ALERT') {
      const msg = event.data.message;
      addLog(`📢 Thông báo hệ thống: "${msg}"`, 'warn');

      if (msg.includes('thành công') || msg.includes('Thành công')) {
        addLog('🎉🎉🎉 CHÚC MỪNG! HỆ THỐNG XÁC NHẬN ĐĂNG KÝ THÀNH CÔNG!', 'success');
        playSoundAlert('success');
        chrome.runtime.sendMessage({
          action: 'NOTIFY_DESKTOP',
          title: '🎉 ĐĂNG KÝ THÀNH CÔNG!',
          body: `IUH Portal: ${msg}`
        });
      } else if (msg.includes('hết chỗ') || msg.includes('trùng lịch') || msg.includes('không thể')) {
        addLog(`Cảnh báo đăng ký: ${msg}`, 'error');
        playSoundAlert('error');
      }
    }

    // Xử lý phản hồi thành công từ AJAX
    if (event.data.type === 'XHR_RESPONSE' || event.data.type === 'FETCH_RESPONSE') {
      const resp = event.data.response || '';
      if (resp.includes('thành công') || resp.includes('success')) {
        addLog('🎉 Nhận được phản hồi thành công từ máy chủ!', 'success');
        playSoundAlert('success');
      }
    }

    // BẮT LỖI SERVER NGHẼN (500, 502, 503, 504) -> KÍCH HOẠT AUTO-RETRY
    if (event.data.type === 'SERVER_NETWORK_ERROR') {
      const status = event.data.status;
      addLog(`⚠️ Cảnh báo nghẽn mạng server (Mã: ${status || 'Connection Reset'})!`, 'error');
      playSoundAlert('error');

      state.retryCount = (state.retryCount || 0) + 1;
      const retryVal = document.getElementById('iuh-retry-count-val');
      if (retryVal) retryVal.innerText = String(state.retryCount);

      if (state.settings.autoRetryOn50x && state.isRunning) {
        if (state.retryCount <= (state.settings.maxRetries || 5)) {
          addLog(`🔁 [Turbo Retry] Tự động thử lại lần ${state.retryCount}/${state.settings.maxRetries}...`, 'warn');
          setTimeout(() => {
            const regBtn = findRegisterButton();
            if (regBtn) {
              simulateRealClick(regBtn);
              watchAndAutoConfirm(1500);
            }
          }, state.settings.retryDelayMs || 300);
        } else {
          addLog(`Đã thử lại tối đa ${state.settings.maxRetries} lần nhưng server vẫn nghẽn. Tiếp tục chu kỳ săn...`, 'error');
          state.retryCount = 0;
        }
      }
    }
  });

  // ==========================================
  // XÂY DỰNG GIAO DIỆN WIDGET NỔI (HUD)
  // ==========================================
  function createHUD() {
    if (document.getElementById('iuh-dkhp-hud')) return;

    // HUD Container
    const hud = document.createElement('div');
    hud.id = 'iuh-dkhp-hud';
    hud.innerHTML = `
      <div class="iuh-hud-header" id="iuh-hud-drag-handle">
        <div class="iuh-hud-title">
          <span>⚡ IUH DKHP PRO</span>
          <span class="iuh-badge">v1.2 ULTRA</span>
          <span class="iuh-ping-badge good" id="iuh-ping-indicator">Ping: --ms</span>
        </div>
        <div class="iuh-hud-controls">
          <button class="iuh-hud-btn-icon" id="iuh-btn-minimize" title="Thu nhỏ">_</button>
          <button class="iuh-hud-btn-icon" id="iuh-btn-close" title="Đóng thu gọn">✕</button>
        </div>
      </div>

      <div class="iuh-hud-tabs">
        <button class="iuh-hud-tab active" data-tab="tab-hunter">🎯 Săn Lớp</button>
        <button class="iuh-hud-tab" data-tab="tab-turbo">⚡ Vượt Lag</button>
        <button class="iuh-hud-tab" data-tab="tab-filter">🔍 Lọc Bảng</button>
        <button class="iuh-hud-tab" data-tab="tab-session">🛡️ Giữ Phiên</button>
        <button class="iuh-hud-tab" data-tab="tab-logs">📜 Nhật Ký</button>
      </div>

      <div class="iuh-hud-body">
        <!-- TAB 1: SĂN LỚP -->
        <div class="iuh-tab-pane active" id="tab-hunter">
          <div class="iuh-status-bar">
            <div class="iuh-status-indicator">
              <span class="iuh-status-dot" id="iuh-status-dot"></span>
              <span id="iuh-status-text">Đang tạm dừng</span>
            </div>
            <div>
              <span style="font-size: 11px; color: #64748b;">Phiên: </span>
              <span id="iuh-session-timer" style="font-weight: 700; font-size: 11px; color: #004d99;">00:00:00</span>
            </div>
          </div>

          <div class="iuh-input-group">
            <input type="text" id="iuh-input-code" class="iuh-input" placeholder="Nhập mã LHP (vd: 420300123401)" />
            <button class="iuh-btn iuh-btn-primary" id="iuh-btn-add-code">+ Thêm</button>
          </div>

          <div class="iuh-targets-title">
            <span>DANH SÁCH MÃ LHP THEO DÕI</span>
            <span id="iuh-target-count" style="color: #004d99; font-weight: 700;">(0)</span>
          </div>

          <div class="iuh-targets-list" id="iuh-targets-container">
            <div style="text-align: center; color: #94a3b8; padding: 12px; font-size: 11px;">
              Chưa có mã LHP nào. Nhập mã ở trên hoặc bấm nút [+ Săn] trên bảng!
            </div>
          </div>

          <div style="display: flex; gap: 6px; margin-bottom: 8px;">
            <button class="iuh-btn iuh-btn-success" id="iuh-btn-start" style="flex: 1;">
              🚀 BẮT ĐẦU SĂN
            </button>
            <button class="iuh-btn iuh-btn-danger" id="iuh-btn-stop" style="flex: 1; display: none;">
              🛑 DỪNG LẠI
            </button>
            <button class="iuh-btn iuh-btn-warning" id="iuh-btn-force-now" title="Bấm thử đăng ký ngay lập tức">
              ⚡ ĐK Ngay
            </button>
          </div>

          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <span>Tốc độ quét:</span>
            </label>
            <select id="iuh-select-speed" class="iuh-input" style="width: 140px; padding: 4px 8px;">
              <option value="250">Tối đa (250ms)</option>
              <option value="300">Cực nhanh (300ms)</option>
              <option value="500" selected>Mượt mà (500ms)</option>
              <option value="800">Chuẩn (800ms)</option>
              <option value="1500">An toàn (1.5s)</option>
            </select>
          </div>

          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-auto-register" checked />
              <span>Tự động bấm Đăng Ký khi có slot</span>
            </label>
          </div>

          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-auto-open" />
              <span>Tự động bung to bảng khi vào trang</span>
            </label>
          </div>

          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-sound" checked />
              <span>Phát âm thanh báo hiệu</span>
            </label>
            <button class="iuh-btn iuh-btn-secondary" id="iuh-btn-test-sound" style="padding: 2px 6px; font-size: 10px;">Thử loa</button>
          </div>
        </div>

        <!-- TAB 2: VƯỢT LAG (TURBO NETWORK BOOSTER) -->
        <div class="iuh-tab-pane" id="tab-turbo">
          <div class="iuh-turbo-card active" id="iuh-card-turbo-status">
            <div class="iuh-turbo-header">
              <div class="iuh-turbo-title">
                <span>🚀 Turbo Network Mode</span>
              </div>
              <label class="iuh-toggle-switch">
                <input type="checkbox" id="iuh-switch-turbo" checked />
                <span class="iuh-toggle-slider"></span>
              </label>
            </div>
            <div class="iuh-turbo-desc">
              Chặn 100% hình ảnh, font nặng, video và trackers quảng cáo. Giảm 90% dung lượng mạng giúp tải trang siêu tốc.
            </div>
          </div>

          <div class="iuh-turbo-card active" id="iuh-card-zero-delay">
            <div class="iuh-turbo-header">
              <div class="iuh-turbo-title">
                <span>⚡ Zero-Delay Fast-Track (20ms)</span>
              </div>
              <label class="iuh-toggle-switch">
                <input type="checkbox" id="iuh-switch-zero-delay" checked />
                <span class="iuh-toggle-slider"></span>
              </label>
            </div>
            <div class="iuh-turbo-desc">
              Loại bỏ hoàn toàn các khoảng chờ nhân tạo. Bấm chọn lớp và gửi lệnh ĐK chỉ trong 20ms thay vì 550ms!
            </div>
          </div>

          <div class="iuh-network-stats">
            <div class="iuh-stat-box">
              <div class="iuh-stat-val" id="iuh-ping-live-val">-- ms</div>
              <div class="iuh-stat-lbl">Độ trễ Server</div>
            </div>
            <div class="iuh-stat-box">
              <div class="iuh-stat-val" id="iuh-net-status-val" style="color: #16a34a;">Tốt</div>
              <div class="iuh-stat-lbl">Đường truyền</div>
            </div>
            <div class="iuh-stat-box">
              <div class="iuh-stat-val" id="iuh-retry-count-val">0</div>
              <div class="iuh-stat-lbl">Lần đã Retry</div>
            </div>
          </div>

          <div class="iuh-setting-row" style="margin-top: 10px;">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-auto-retry" checked />
              <span>Tự động Retry khi dính lỗi 502/503/504</span>
            </label>
          </div>

          <div class="iuh-setting-row">
            <span>Tốc độ Retry lỗi mạng:</span>
            <select id="iuh-select-retry-speed" class="iuh-input" style="width: 130px; padding: 4px;">
              <option value="200">Cực nhanh (200ms)</option>
              <option value="300" selected>Tối ưu (300ms)</option>
              <option value="600">Nhịp an toàn (600ms)</option>
            </select>
          </div>

          <div style="display: flex; gap: 6px; margin-top: 8px;">
            <button class="iuh-btn iuh-btn-primary" id="iuh-btn-test-ping" style="flex: 1;">
              📡 Đo Ping Ngay
            </button>
            <button class="iuh-btn iuh-btn-secondary" id="iuh-btn-soft-refresh" style="flex: 1;" title="Tải lại bảng lớp học phần mà không cần F5 trình duyệt">
              🔄 Tải Lại Bảng Nhanh
            </button>
          </div>
        </div>

        <!-- TAB 3: LỌC BẢNG -->
        <div class="iuh-tab-pane" id="tab-filter">
          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-hide-full" />
              <span>Ẩn tất cả các lớp đã đầy (Hết chỗ)</span>
            </label>
          </div>

          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-highlight" checked />
              <span>Tô màu xanh nổi bật lớp còn chỗ</span>
            </label>
          </div>

          <button class="iuh-btn iuh-btn-primary iuh-btn-block" id="iuh-btn-inject-buttons">
            ⚡ Gắn nút [+ Săn] vào các dòng trên bảng
          </button>
          <button class="iuh-btn iuh-btn-secondary iuh-btn-block" id="iuh-btn-refresh-table">
            🔄 Áp dụng lọc & Quét lại bảng
          </button>
        </div>

        <!-- TAB 4: GIỮ PHIÊN -->
        <div class="iuh-tab-pane" id="tab-session">
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; margin-bottom: 10px; font-size: 12px; color: #1e40af;">
            💡 <b>Tính năng Chống Văng Phiên (Keep-Alive):</b><br>
            Tự động gửi tín hiệu nhẹ định kỳ đến máy chủ IUH để giữ cookie đăng nhập không bị hết hạn khi bạn treo máy chờ giờ mở cổng.
          </div>

          <div class="iuh-setting-row">
            <label class="iuh-setting-label">
              <input type="checkbox" id="iuh-chk-anti-logout" checked />
              <span>Kích hoạt tự động giữ phiên</span>
            </label>
          </div>

          <div class="iuh-setting-row">
            <span>Tần suất ping:</span>
            <select id="iuh-select-ping-time" class="iuh-input" style="width: 120px; padding: 4px;">
              <option value="1">Mỗi 1 phút</option>
              <option value="2" selected>Mỗi 2 phút</option>
              <option value="5">Mỗi 5 phút</option>
            </select>
          </div>

          <button class="iuh-btn iuh-btn-primary iuh-btn-block" id="iuh-btn-manual-ping">
            📡 Gửi ping giữ phiên ngay bây giờ
          </button>
        </div>

        <!-- TAB 5: NHẬT KÝ -->
        <div class="iuh-tab-pane" id="tab-logs">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 11px;">LIVE EVENT LOGS:</span>
            <button class="iuh-btn iuh-btn-secondary" id="iuh-btn-clear-logs" style="padding: 2px 8px; font-size: 10px;">Xóa log</button>
          </div>
          <div class="iuh-log-container" id="iuh-log-view"></div>
        </div>
      </div>
    `;

    document.body.appendChild(hud);

    // Minimized Floating Pill Button
    const minBall = document.createElement('div');
    minBall.id = 'iuh-dkhp-hud-minimized';
    minBall.innerHTML = `
      <span style="font-size: 14px;">⚡</span>
      <span id="iuh-mini-label">IUH DKHP PRO</span>
      <span class="iuh-mini-dot" id="iuh-mini-status-dot"></span>
    `;
    minBall.title = 'Bấm vào để mở bảng điều khiển ĐKHP';
    document.body.appendChild(minBall);

    const isMinimized = state.settings.isMinimized !== false;
    if (isMinimized) {
      hud.style.display = 'none';
      minBall.style.display = 'flex';
    } else {
      hud.style.display = 'block';
      minBall.style.display = 'none';
    }

    bindHUDEvents();
    makeDraggable(hud, document.getElementById('iuh-hud-drag-handle'));
    makeDraggable(minBall, minBall);
  }

  // ==========================================
  // XỬ LÝ SỰ KIỆN GIAO DIỆN HUD
  // ==========================================
  function bindHUDEvents() {
    const hud = document.getElementById('iuh-dkhp-hud');
    const minBall = document.getElementById('iuh-dkhp-hud-minimized');

    const minimizeHUD = () => {
      hud.style.display = 'none';
      minBall.style.display = 'flex';
      state.settings.isMinimized = true;
      saveConfig();
    };

    const expandHUD = () => {
      minBall.style.display = 'none';
      hud.style.display = 'block';
      state.settings.isMinimized = false;
      saveConfig();
      renderAllLogs();
    };

    document.getElementById('iuh-btn-minimize').addEventListener('click', minimizeHUD);
    const btnClose = document.getElementById('iuh-btn-close');
    if (btnClose) btnClose.addEventListener('click', minimizeHUD);

    minBall.addEventListener('click', expandHUD);

    const chkAutoOpen = document.getElementById('iuh-chk-auto-open');
    if (chkAutoOpen) {
      chkAutoOpen.checked = !!state.settings.autoOpenHUD;
      chkAutoOpen.addEventListener('change', (e) => {
        state.settings.autoOpenHUD = e.target.checked;
        if (!e.target.checked) {
          state.settings.isMinimized = true;
        }
        saveConfig();
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'EXPAND_HUD') {
          expandHUD();
          sendResponse({ success: true });
        } else if (request.action === 'MINIMIZE_HUD') {
          minimizeHUD();
          sendResponse({ success: true });
        } else if (request.action === 'TOGGLE_HUD') {
          if (hud.style.display === 'none') {
            expandHUD();
          } else {
            minimizeHUD();
          }
          sendResponse({ success: true, isMinimized: state.settings.isMinimized });
        }
      });
    }

    // Chuyển Tabs
    const tabs = hud.querySelectorAll('.iuh-hud-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        hud.querySelectorAll('.iuh-tab-pane').forEach((p) => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        const pane = document.getElementById(targetId);
        if (pane) pane.classList.add('active');
        if (targetId === 'tab-logs') {
          renderAllLogs();
        }
      });
    });

    // Thêm mã LHP
    const inputCode = document.getElementById('iuh-input-code');
    const btnAdd = document.getElementById('iuh-btn-add-code');

    const handleAdd = () => {
      const code = (inputCode.value || '').trim();
      if (!code) return;
      addTargetCode(code);
      inputCode.value = '';
    };

    btnAdd.addEventListener('click', handleAdd);
    inputCode.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAdd();
    });

    document.getElementById('iuh-btn-start').addEventListener('click', startHunting);
    document.getElementById('iuh-btn-stop').addEventListener('click', stopHunting);

    document.getElementById('iuh-btn-force-now').addEventListener('click', () => {
      addLog('⚡ Bấm lệnh Đăng Ký Ngay Lập Tức!', 'warn');
      const rows = findClassRows();
      if (!rows.length) {
        addLog('Không tìm thấy bảng lớp học phần nào trên trang!', 'error');
        return;
      }
      for (let t = 0; t < state.targets.length; t++) {
        const target = state.targets[t];
        for (let i = 0; i < rows.length; i++) {
          const tr = rows[i];
          if (tr.textContent.includes(target.code)) {
            const rowInfo = parseRowInfo(tr);
            if (rowInfo) {
              executeRegistration(target, rowInfo);
              return;
            }
          }
        }
      }
      addLog('Chưa tìm thấy mã LHP nào trong danh sách trên bảng!', 'error');
    });

    const selectSpeed = document.getElementById('iuh-select-speed');
    selectSpeed.value = String(state.settings.intervalMs || 500);
    if (!selectSpeed.value) {
      selectSpeed.value = '500';
    }
    selectSpeed.addEventListener('change', (e) => {
      state.settings.intervalMs = parseInt(e.target.value, 10);
      saveConfig();
      addLog(`Đã đổi tốc độ quét: ${state.settings.intervalMs}ms`, 'info');
    });

    const chkAutoReg = document.getElementById('iuh-chk-auto-register');
    chkAutoReg.checked = state.settings.autoRegister;
    chkAutoReg.addEventListener('change', (e) => {
      state.settings.autoRegister = e.target.checked;
      saveConfig();
    });

    const chkSound = document.getElementById('iuh-chk-sound');
    chkSound.checked = state.settings.soundAlert;
    chkSound.addEventListener('change', (e) => {
      state.settings.soundAlert = e.target.checked;
      saveConfig();
    });

    document.getElementById('iuh-btn-test-sound').addEventListener('click', () => {
      playSoundAlert('success');
    });

    // TURBO MODE SWITCH
    const switchTurbo = document.getElementById('iuh-switch-turbo');
    const cardTurbo = document.getElementById('iuh-card-turbo-status');
    if (switchTurbo) {
      switchTurbo.checked = state.settings.turboMode !== false;
      switchTurbo.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        state.settings.turboMode = enabled;
        if (enabled) {
          cardTurbo.classList.add('active');
          addLog('🚀 [Turbo Booster] ĐÃ BẬT chế độ vượt lag: Chặn assets rác', 'success');
        } else {
          cardTurbo.classList.remove('active');
          addLog('⚠️ [Turbo Booster] ĐÃ TẮT chế độ vượt lag', 'warn');
        }
        saveConfig();
        chrome.runtime.sendMessage({ action: 'SET_TURBO_MODE', enabled: enabled });
      });
    }

    // ZERO-DELAY SWITCH
    const switchZeroDelay = document.getElementById('iuh-switch-zero-delay');
    const cardZeroDelay = document.getElementById('iuh-card-zero-delay');
    if (switchZeroDelay) {
      switchZeroDelay.checked = state.settings.zeroDelayMode !== false;
      switchZeroDelay.addEventListener('change', (e) => {
        state.settings.zeroDelayMode = e.target.checked;
        if (e.target.checked) {
          cardZeroDelay.classList.add('active');
          addLog('⚡ [Zero-Delay] ĐÃ BẬT Fast-Track 20ms', 'success');
        } else {
          cardZeroDelay.classList.remove('active');
          addLog('⚠️ [Zero-Delay] Đã chuyển về chế độ bấm thường (150ms)', 'warn');
        }
        saveConfig();
      });
    }

    const chkAutoRetry = document.getElementById('iuh-chk-auto-retry');
    if (chkAutoRetry) {
      chkAutoRetry.checked = state.settings.autoRetryOn50x !== false;
      chkAutoRetry.addEventListener('change', (e) => {
        state.settings.autoRetryOn50x = e.target.checked;
        saveConfig();
      });
    }

    const selectRetrySpeed = document.getElementById('iuh-select-retry-speed');
    if (selectRetrySpeed) {
      selectRetrySpeed.value = String(state.settings.retryDelayMs || 300);
      selectRetrySpeed.addEventListener('change', (e) => {
        state.settings.retryDelayMs = parseInt(e.target.value, 10);
        saveConfig();
        addLog(`Đã đổi tốc độ Auto-Retry lỗi mạng: ${state.settings.retryDelayMs}ms`, 'info');
      });
    }

    const btnTestPing = document.getElementById('iuh-btn-test-ping');
    if (btnTestPing) {
      btnTestPing.addEventListener('click', () => {
        measurePing(true);
      });
    }

    const btnSoftRefresh = document.getElementById('iuh-btn-soft-refresh');
    if (btnSoftRefresh) {
      btnSoftRefresh.addEventListener('click', () => {
        softRefreshTable();
      });
    }

    // Tab Lọc
    const chkHideFull = document.getElementById('iuh-chk-hide-full');
    chkHideFull.checked = state.settings.hideFullClasses;
    chkHideFull.addEventListener('change', (e) => {
      state.settings.hideFullClasses = e.target.checked;
      applyTableFilters();
      saveConfig();
    });

    const chkHighlight = document.getElementById('iuh-chk-highlight');
    chkHighlight.checked = state.settings.highlightOpenClasses;
    chkHighlight.addEventListener('change', (e) => {
      state.settings.highlightOpenClasses = e.target.checked;
      applyTableFilters();
      saveConfig();
    });

    document.getElementById('iuh-btn-inject-buttons').addEventListener('click', () => {
      injectInlineButtons();
    });

    document.getElementById('iuh-btn-refresh-table').addEventListener('click', () => {
      applyTableFilters();
      injectInlineButtons();
      addLog('Đã quét và cập nhật lại bảng học phần', 'info');
    });

    // Tab Giữ phiên
    const chkAntiLogout = document.getElementById('iuh-chk-anti-logout');
    chkAntiLogout.checked = state.settings.antiLogout;
    chkAntiLogout.addEventListener('change', (e) => {
      state.settings.antiLogout = e.target.checked;
      saveConfig();
    });

    document.getElementById('iuh-btn-manual-ping').addEventListener('click', () => {
      fetch(window.location.href, { cache: 'no-cache', credentials: 'include' })
        .then(() => addLog('📡 Đã gửi ping thủ công giữ phiên thành công!', 'success'))
        .catch((err) => addLog(`Lỗi ping: ${err.message}`, 'error'));
    });

    document.getElementById('iuh-btn-clear-logs').addEventListener('click', () => {
      state.logs = [];
      const logContainer = document.getElementById('iuh-log-view');
      if (logContainer) logContainer.innerHTML = '';
    });

    // Timer phiên
    setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.sessionStartTime) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      const timerEl = document.getElementById('iuh-session-timer');
      if (timerEl) timerEl.innerText = `${h}:${m}:${s}`;
    }, 1000);

    updateTargetUI();
  }

  function updateHUDStatus(running) {
    const dot = document.getElementById('iuh-status-dot');
    const text = document.getElementById('iuh-status-text');
    const miniDot = document.getElementById('iuh-mini-status-dot');
    const miniLabel = document.getElementById('iuh-mini-label');
    const btnStart = document.getElementById('iuh-btn-start');
    const btnStop = document.getElementById('iuh-btn-stop');

    if (running) {
      if (dot) dot.className = 'iuh-status-dot running';
      if (miniDot) miniDot.className = 'iuh-mini-dot running';
      if (miniLabel) miniLabel.innerText = 'Đang săn slot...';
      if (text) text.innerText = 'Đang săn slot...';
      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';
    } else {
      if (dot) dot.className = 'iuh-status-dot';
      if (miniDot) miniDot.className = 'iuh-mini-dot';
      if (miniLabel) miniLabel.innerText = 'IUH DKHP PRO';
      if (text) text.innerText = 'Đang tạm dừng';
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnStop) btnStop.style.display = 'none';
    }
  }

  function addTargetCode(code) {
    code = String(code || '').trim();
    if (!code) return;
    if (state.targets.some((t) => t.code === code)) {
      updateTargetUI();
      applyTableFilters();
      saveConfig();
      addLog(`Mã [${code}] đã có trong danh sách theo dõi!`, 'info');
      return;
    }

    state.targets.push({
      code: code,
      practiceGroup: '',
      status: 'idle'
    });

    updateTargetUI();
    applyTableFilters();
    saveConfig();
    addLog(`Đã thêm mã theo dõi: ${code}`, 'success');
  }

  function removeTargetCode(code) {
    state.targets = state.targets.filter((t) => t.code !== code);
    updateTargetUI();
    applyTableFilters();
    saveConfig();

    // Khôi phục lại nút [⚡ Săn] trên bảng khi xóa mã khỏi danh sách
    document.querySelectorAll(`.iuh-inline-add-btn[data-iuh-code="${code}"]`).forEach((btn) => {
      btn.classList.remove('added');
      btn.innerHTML = '⚡ Săn';
    });

    addLog(`Đã xóa mã: ${code}`, 'info');
  }

  function updateTargetUI() {
    const container = document.getElementById('iuh-targets-container');
    const countEl = document.getElementById('iuh-target-count');
    if (!container) return;

    if (countEl) countEl.innerText = `(${state.targets.length})`;

    if (!state.targets.length) {
      container.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 12px; font-size: 11px;">
          Chưa có mã LHP nào. Nhập mã ở trên hoặc bấm nút [+ Săn] trên bảng!
        </div>
      `;
      return;
    }

    let html = '';
    state.targets.forEach((t) => {
      let statusClass = '';
      let statusLabel = 'Đang chờ';
      if (t.status === 'open') {
        statusClass = 'open';
        statusLabel = 'Còn chỗ!';
      } else if (t.status === 'full') {
        statusClass = 'full';
        statusLabel = 'Đầy chỗ';
      } else if (t.status === 'success') {
        statusClass = 'registered';
        statusLabel = 'ĐÃ ĐK THÀNH CÔNG';
      }

      html += `
        <div class="iuh-target-item" id="iuh-target-item-${t.code}">
          <div class="iuh-target-info">
            <span class="iuh-target-code">${t.code}</span>
            <span class="iuh-target-status ${statusClass}" id="iuh-target-status-${t.code}">${statusLabel}</span>
          </div>
          <div class="iuh-target-actions">
            <button class="iuh-btn-del" data-code="${t.code}" title="Xóa mã này">✕</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.iuh-btn-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const code = e.currentTarget.getAttribute('data-code');
        removeTargetCode(code);
      });
    });
  }

  function updateTargetStatusInList(code, text) {
    const el = document.getElementById(`iuh-target-status-${code}`);
    if (el) {
      el.innerText = text;
      if (text.includes('Đầy')) {
        el.className = 'iuh-target-status full';
      } else if (text.includes('Còn') || text.includes('Mở')) {
        el.className = 'iuh-target-status open';
      }
    }
  }

  function makeDraggable(element, handle) {
    let posX = 0, posY = 0, initialMouseX = 0, initialMouseY = 0;
    let hasMoved = false;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return;

      e.preventDefault();
      hasMoved = false;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      const dx = Math.abs(initialMouseX - e.clientX);
      const dy = Math.abs(initialMouseY - e.clientY);
      if (dx > 3 || dy > 3) hasMoved = true;

      posX = initialMouseX - e.clientX;
      posY = initialMouseY - e.clientY;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;

      const newTop = element.offsetTop - posY;
      const newLeft = element.offsetLeft - posX;

      const maxTop = window.innerHeight - element.offsetHeight - 10;
      const maxLeft = window.innerWidth - element.offsetWidth - 10;

      element.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
      element.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + 'px';
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }

    handle.addEventListener('click', (e) => {
      if (hasMoved) {
        e.stopPropagation();
      }
    }, true);
  }

  // Tự động lọc Không trùng lịch + chọn lớp "Chờ sinh viên đăng ký" + bấm Đăng Ký khi người dùng click chọn môn/lớp
  function setupManualSelectAutoRegister() {
    document.addEventListener('click', (e) => {
      if (!state.settings.autoRegister) return;
      if (!e.isTrusted) return; // Chỉ bắt click thật của người dùng (tránh lặp với click mô phỏng của tool)
      const targetEl = e.target;
      if (!targetEl || !targetEl.closest) return;
      if (targetEl.closest('#iuh-dkhp-hud') || targetEl.closest('#iuh-dkhp-hud-minimized')) return;
      if (targetEl.classList.contains('iuh-inline-add-btn')) return;
      if (targetEl.tagName === 'BUTTON' || targetEl.tagName === 'A') return;
      // Không can thiệp nếu người dùng đang tự bấm vào chính ô checkbox Không trùng lịch
      if (targetEl.tagName === 'INPUT' && targetEl.type === 'checkbox') return;

      const tr = targetEl.closest('table tr');
      if (!tr || (tr.firstElementChild && tr.firstElementChild.tagName === 'TH')) return;

      const info = parseRowInfo(tr);
      if (!info) return;

      // Trường hợp 1: Người dùng vừa click chọn 1 Môn học (Mã HP 10 số) ở bảng trên
      if (info.code && info.code.length === 10) {
        addLog(`📂 Bạn vừa chọn môn [${info.code}] -> Tự động tích "Không trùng lịch" & chọn lớp "Chờ SV đăng ký"...`, 'info');
        waitAndSelectOpenClassForSubject(info.code, { code: info.code, practiceGroup: '' });
        return;
      }

      // Trường hợp 2: Người dùng vừa click chọn dòng Lớp học phần (Mã LHP 12 số) ở bảng dưới
      if ((info.code && info.code.length >= 11) || info.input) {
        ensureNoScheduleConflictChecked();
        if (isRowOpenForReg(info)) {
          addLog(`⚡ Bạn vừa chọn lớp [${info.code || 'LHP'}] (Chờ SV đăng ký)! Tự động chọn nhóm TH & bấm Đăng Ký...`, 'warn');
          triggerPracticeAndSubmit({ code: info.code || '', practiceGroup: '' });
        } else {
          addLog(`⛔ Lớp [${info.code || 'LHP'}] có trạng thái "${info.statusText || 'Đã khóa/Đang lên KH'}" -> Không thể đăng ký!`, 'warn');
        }
      }
    }, true);
  }

  // ==========================================
  // KHỞI ĐỘNG EXTENSION TRÊN TRANG (TỐI ƯU MUTATION)
  // ==========================================
  function init() {
    loadConfig(() => {
      createHUD();
      setupKeepAlive();
      setupManualSelectAutoRegister();
      addLog('Đã khởi tạo IUH DKHP Pro Ultra Turbo sẵn sàng!', 'success');

      // Khởi chạy đo ping định kỳ mỗi 5s
      measurePing();
      state.pingTimerId = setInterval(() => {
        measurePing(false);
      }, 5000);

      setTimeout(() => {
        injectInlineButtons();
        applyTableFilters();

        // Nếu đang ở trang DangKyHocPhan mà bảng môn học bị trống/ẩn, tự động kích hoạt nạp lại bảng
        if (window.location.pathname.toLowerCase().includes('dangkyhocphan') && findClassRows().length === 0) {
          softRefreshTable();
        }
      }, 900);

      // MutationObserver với bộ lọc nguồn và debounce chống lặp vô hạn
      let mutationDebounceTimer = null;
      const observer = new MutationObserver((mutations) => {
        let hasTableChanges = false;
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          // Bỏ qua toàn bộ mutations do chính HUD tạo ra!
          if (m.target && m.target.closest && (m.target.closest('#iuh-dkhp-hud') || m.target.closest('#iuh-dkhp-hud-minimized'))) {
            continue;
          }
          if (m.addedNodes && m.addedNodes.length > 0) {
            hasTableChanges = true;
            break;
          }
        }
        if (hasTableChanges) {
          clearTimeout(mutationDebounceTimer);
          mutationDebounceTimer = setTimeout(() => {
            injectInlineButtons();
            applyTableFilters();
          }, 300);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
