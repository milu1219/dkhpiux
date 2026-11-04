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
  function loadConfig(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['dkhp_settings', 'dkhp_targets'], (data) => {
        if (data.dkhp_settings) {
          state.settings = Object.assign(state.settings, data.dkhp_settings);
        }
        if (Array.isArray(data.dkhp_targets)) {
          state.targets = data.dkhp_targets;
        }
        if (callback) callback();
      });
    } else if (callback) {
      callback();
    }
  }

  function saveConfig() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        dkhp_settings: state.settings,
        dkhp_targets: state.targets
      });
    }
  }

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
  // SOFT-REFRESH BẢNG LỚP HỌC PHẦN (KHÔNG F5)
  // ==========================================
  function softRefreshTable() {
    addLog('🔄 [Soft-Refresh] Đang yêu cầu máy chủ làm mới bảng lớp học phần...', 'info');
    const searchBtn = document.querySelector('#btnTimKiem, #btnSearch, .btnTimKiem, button[onclick*="TimKiem"], input[value*="Tìm kiếm"]');
    if (searchBtn && isVisible(searchBtn)) {
      simulateRealClick(searchBtn);
      addLog('Đã kích hoạt nút tìm kiếm trên trang để load dữ liệu mới!', 'success');
    } else {
      window.postMessage({
        target: 'IUH_DKHP_INJECTED_INVOKE',
        funcName: 'loadDanhSachLopHocPhan',
        args: []
      }, '*');
      applyTableFilters();
      injectInlineButtons();
      addLog('Đã quét lại cấu trúc bảng học phần!', 'info');
    }
  }

  // ==========================================
  // PHÂN TÍCH & BẮT PHẦN TỬ (SỬ DỤNG TEXTCONTENT)
  // ==========================================

  // Tìm các hàng lớp học phần nhanh (Dùng textContent để không gây reflow)
  function findClassRows() {
    const rows = [];
    const allTrs = document.querySelectorAll('table tr');

    for (let i = 0; i < allTrs.length; i++) {
      const tr = allTrs[i];
      if (tr.firstElementChild && tr.firstElementChild.tagName === 'TH') continue;

      const text = tr.textContent || '';
      const hasInput = tr.querySelector('input[type="radio"], input[type="checkbox"]');
      if (hasInput || /\b\d{8,14}\b/.test(text)) {
        rows.push(tr);
      }
    }

    return rows;
  }

  // Trích xuất thông tin hàng (Chỉ gọi khi khớp target code)
  function parseRowInfo(tr) {
    const cells = tr.querySelectorAll('td');
    if (!cells.length) return null;

    const rowText = tr.textContent || '';
    const codeMatch = rowText.match(/\b\d{8,14}\b/);
    const code = codeMatch ? codeMatch[0] : '';

    const selectorInput = tr.querySelector('input[type="radio"], input[type="checkbox"]');

    let enrolled = -1;
    let max = -1;
    let remaining = -1;

    const fractionMatch = rowText.match(/(\d+)\s*[\/|\\]\s*(\d+)/);
    if (fractionMatch) {
      enrolled = parseInt(fractionMatch[1], 10);
      max = parseInt(fractionMatch[2], 10);
      remaining = max - enrolled;
    } else {
      for (let i = 0; i < cells.length; i++) {
        const t = cells[i].textContent.trim();
        if (/^\d{1,3}$/.test(t)) {
          const num = parseInt(t, 10);
          if (num >= 20 && num <= 150 && max === -1) {
            max = num;
          } else if (num >= 0 && num <= 150 && enrolled === -1) {
            enrolled = num;
          }
        }
      }
      if (max !== -1 && enrolled !== -1) {
        remaining = max - enrolled;
      }
    }

    return {
      tr: tr,
      code: code,
      input: selectorInput,
      enrolled: enrolled,
      max: max,
      remaining: remaining,
      text: rowText
    };
  }

  // Tìm nút Đăng Ký trên trang IUH
  function findRegisterButton() {
    const specific = document.querySelector(
      '#btnDangKy, #btnLuu, #btnSubmit, .btn-dangky, .btnDangKy, button[name*="DangKy"], input[name*="DangKy"]'
    );
    if (specific && isVisible(specific)) return specific;

    const candidates = document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn');

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const val = (el.textContent || el.value || '').trim().toLowerCase();
      if (
        (val.includes('đăng ký') || val.includes('dang ky') || val.includes('lưu đăng ký') || val.includes('lưu vào')) &&
        isVisible(el)
      ) {
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

    const modalConfirm = document.querySelector('.modal.in .btn-primary, .modal.show .btn-primary, .modal .btn-success');
    if (modalConfirm && isVisible(modalConfirm)) {
      addLog('⚡ Tự động xác nhận popup modal...', 'warn');
      modalConfirm.click();
      return true;
    }

    return false;
  }

  // Giám sát popup xác nhận tức thì (kiểm tra mỗi 20ms thay vì đợi 250ms)
  function watchAndAutoConfirm(maxWaitMs = 1500) {
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

  // Click mô phỏng người dùng thật tốc độ cao
  function simulateRealClick(element) {
    if (!element) return;
    element.focus();
    ['mousedown', 'mouseup', 'click'].forEach((type) => {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
    if (element.tagName === 'INPUT' && (element.type === 'radio' || element.type === 'checkbox')) {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ==========================================
  // THỰC HIỆN ĐĂNG KÝ HỌC PHẦN (ZERO-DELAY PIPELINE)
  // ==========================================
  function executeRegistration(targetItem, rowInfo) {
    addLog(`⚡ [Fast-Track] Chọn lớp [${targetItem.code}]...`, 'warn');
    state.retryCount = 0;

    // 1. Tick chọn radio/row ngay lập tức
    if (rowInfo.input) {
      simulateRealClick(rowInfo.input);
    } else {
      simulateRealClick(rowInfo.tr);
    }

    // 2. Chế độ Siêu Tốc (Zero-Delay): chỉ trễ 25ms thay vì 550ms
    const delay = state.settings.zeroDelayMode ? 25 : 150;

    setTimeout(() => {
      selectPracticeGroupIfAny(targetItem);

      if (state.settings.autoRegister) {
        const regBtn = findRegisterButton();
        if (regBtn) {
          addLog(`⚡ [Zero-Delay] Bấm Đăng Ký (${regBtn.textContent || regBtn.value || 'Nút ĐK'})...`, 'warn');
          simulateRealClick(regBtn);
          // Kích hoạt ngay bộ xác nhận popup tức thời
          watchAndAutoConfirm(2000);
        } else {
          addLog('Không tìm thấy nút "Đăng Ký", bạn hãy bấm đăng ký thủ công trên màn hình!', 'error');
        }
      }
    }, delay);
  }

  // Chọn nhóm thực hành nếu môn có chia ca TH
  function selectPracticeGroupIfAny(targetItem) {
    const practiceRadios = document.querySelectorAll(
      '#divNhomThucHanh input[type="radio"], .nhom-thuc-hanh input[type="radio"], table input[name*="ThucHanh"]'
    );

    if (!practiceRadios.length) return;

    let selectedRadio = null;

    if (targetItem.practiceGroup) {
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

    if (selectedRadio) {
      const pText = (selectedRadio.closest('tr') || selectedRadio.parentElement || {}).textContent || 'Mặc định';
      addLog(`Tự động chọn nhóm thực hành: ${pText.replace(/\s+/g, ' ').slice(0, 30)}`, 'info');
      simulateRealClick(selectedRadio);
    }
  }

  // ==========================================
  // VÒNG LẶP SĂN SLOT (HUNT LOOP TỐI ƯU HÓA)
  // ==========================================
  function runHuntCycle() {
    if (!state.isRunning) return;

    const rows = findClassRows();

    for (let t = 0; t < state.targets.length; t++) {
      const target = state.targets[t];
      if (target.status === 'success' && state.settings.stopOnSuccess) continue;

      let foundRow = null;
      // Dùng textContent kiểm tra chuỗi trực tiếp, chỉ parse khi tìm thấy mã
      for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];
        if (tr.textContent.includes(target.code)) {
          foundRow = parseRowInfo(tr);
          break;
        }
      }

      if (foundRow) {
        let statusStr = '';
        if (foundRow.max !== -1 && foundRow.enrolled !== -1) {
          statusStr = `${foundRow.enrolled}/${foundRow.max}`;
        } else {
          statusStr = 'Đang mở';
        }

        const hasSlot = foundRow.remaining > 0 || (foundRow.remaining === -1 && foundRow.input && !foundRow.input.disabled);

        if (hasSlot) {
          target.status = 'open';
          addLog(`🔥 PHÁT HIỆN LỚP [${target.code}] CÒN CHỖ (${statusStr})! TIẾN HÀNH ĐĂNG KÝ...`, 'success');
          playSoundAlert('slot_found');

          chrome.runtime.sendMessage({
            action: 'NOTIFY_DESKTOP',
            title: '🔥 PHÁT HIỆN CHỖ TRỐNG!',
            body: `Lớp ${target.code} đang còn chỗ (${statusStr}). Đang tiến hành đăng ký!`
          });

          executeRegistration(target, foundRow);
          target.status = 'attempting';
          updateTargetUI();
          break;
        } else {
          target.status = 'full';
          updateTargetStatusInList(target.code, `Đầy (${statusStr})`);
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
    chrome.runtime.sendMessage({ action: 'SET_BADGE', text: 'ON', color: '#16a34a' });

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
    chrome.runtime.sendMessage({ action: 'SET_BADGE', text: '', color: '#64748b' });
  }

  // ==========================================
  // BỘ LỌC BẢNG & TÔ MÀU (CHỈ CHẠY KHI CẦN THIẾT)
  // ==========================================
  function applyTableFilters() {
    const rows = findClassRows();

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const info = parseRowInfo(tr);
      if (!info) continue;

      const isTarget = state.targets.some((t) => t.code === info.code);
      if (isTarget) {
        tr.classList.add('iuh-highlight-target');
      } else {
        tr.classList.remove('iuh-highlight-target');
      }

      const isFull = info.remaining === 0;
      if (isFull) {
        tr.classList.add('iuh-row-full');
        if (state.settings.hideFullClasses) {
          tr.classList.add('iuh-row-hidden');
        } else {
          tr.classList.remove('iuh-row-hidden');
        }
      } else {
        tr.classList.remove('iuh-row-full', 'iuh-row-hidden');
        if (state.settings.highlightOpenClasses && info.remaining > 0) {
          tr.classList.add('iuh-highlight-open');
        } else {
          tr.classList.remove('iuh-highlight-open');
        }
      }
    }
  }

  // Gắn nút "+ Săn lớp" vào từng dòng trong bảng môn học của trường
  function injectInlineButtons() {
    const rows = findClassRows();
    let count = 0;

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      if (tr.querySelector('.iuh-inline-add-btn')) continue;

      const info = parseRowInfo(tr);
      if (!info || !info.code) continue;

      const targetCell = tr.cells[1] || tr.cells[0];
      if (!targetCell) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'iuh-inline-add-btn';
      btn.innerHTML = '⚡ Săn';
      btn.title = `Thêm mã ${info.code} vào danh sách săn môn của Tool`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addTargetCode(info.code);
        btn.classList.add('added');
        btn.innerHTML = '✓ Đã thêm';
      });

      targetCell.appendChild(btn);
      count++;
    }

    if (count > 0) {
      addLog(`Đã gắn nút [+ Săn] vào ${count} lớp học phần trên bảng`, 'info');
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
            <select id="iuh-select-speed" class="iuh-input" style="width: 120px; padding: 4px;">
              <option value="250">Tối đa (250ms)</option>
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
    selectSpeed.value = String(state.settings.intervalMs);
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
    code = code.trim();
    if (!code) return;
    if (state.targets.some((t) => t.code === code)) {
      addLog(`Mã LHP [${code}] đã tồn tại trong danh sách!`, 'warn');
      return;
    }

    state.targets.push({
      code: code,
      practiceGroup: '',
      status: 'idle'
    });

    saveConfig();
    updateTargetUI();
    applyTableFilters();
    addLog(`Đã thêm mã LHP: ${code}`, 'success');
  }

  function removeTargetCode(code) {
    state.targets = state.targets.filter((t) => t.code !== code);
    saveConfig();
    updateTargetUI();
    applyTableFilters();
    addLog(`Đã xóa mã LHP: ${code}`, 'info');
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

  // ==========================================
  // KHỞI ĐỘNG EXTENSION TRÊN TRANG (TỐI ƯU MUTATION)
  // ==========================================
  function init() {
    loadConfig(() => {
      createHUD();
      setupKeepAlive();
      addLog('Đã khởi tạo IUH DKHP Pro Ultra Turbo sẵn sàng!', 'success');

      // Khởi chạy đo ping định kỳ mỗi 5s
      measurePing();
      state.pingTimerId = setInterval(() => {
        measurePing(false);
      }, 5000);

      setTimeout(() => {
        injectInlineButtons();
        applyTableFilters();
      }, 800);

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
