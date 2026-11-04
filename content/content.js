/**
 * IUH DKHP Pro - Content Script
 * Chạy trực tiếp trên dkhp.iuh.edu.vn, sv.iuh.edu.vn và trang giả lập simulator
 */

(function () {
  'use strict';

  // Tránh inject trùng lặp
  if (window.__IUH_DKHP_PRO_INJECTED__) return;
  window.__IUH_DKHP_PRO_INJECTED__ = true;

  console.log('[IUH DKHP Pro] Content Script đã khởi tạo thành công!');

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
    sessionStartTime: Date.now(),
    targets: [], // Danh sách: [{ code: '420300123401', practiceGroup: '', status: 'idle', name: '' }]
    settings: {
      autoRegister: true,
      intervalMs: 800,
      soundAlert: true,
      antiLogout: true,
      antiLogoutMinutes: 2,
      autoSelectPractice: true,
      notifySystem: true,
      hideFullClasses: false,
      highlightOpenClasses: true,
      stopOnSuccess: true,
      isMinimized: true,         // Mặc định luôn thu gọn
      autoOpenHUD: false         // Tắt tự động mở to khi vào trang
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
        // Giai điệu chiến thắng: Đô - Mi - Sol - Đô cao
        playTone(523.25, 0.12, 'triangle', 0);
        playTone(659.25, 0.12, 'triangle', 0.13);
        playTone(783.99, 0.14, 'triangle', 0.26);
        playTone(1046.50, 0.35, 'triangle', 0.40);
      } else if (type === 'slot_found') {
        // Bíp báo slot xuất hiện
        playTone(880, 0.1, 'sine', 0);
        playTone(1174.66, 0.2, 'sine', 0.12);
      } else if (type === 'error') {
        // Âm báo lỗi
        playTone(330, 0.15, 'sawtooth', 0);
        playTone(220, 0.25, 'sawtooth', 0.15);
      }
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }

  // ==========================================
  // HỆ THỐNG GHI NHẬT KÝ (LOGS)
  // ==========================================
  function addLog(text, type = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const logItem = { time: timeStr, text: text, type: type };
    state.logs.push(logItem);
    if (state.logs.length > 200) state.logs.shift();

    const logContainer = document.getElementById('iuh-log-view');
    if (logContainer) {
      const line = document.createElement('div');
      line.className = `iuh-log-line ${type}`;
      line.innerHTML = `<span class="iuh-log-time">[${timeStr}]</span> ${escapeHTML(text)}`;
      logContainer.appendChild(line);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
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
  // PHÂN TÍCH & BẮT PHẦN TỬ TRÊN TRANG IUH
  // ==========================================

  // Tìm các hàng lớp học phần
  function findClassRows() {
    const rows = [];
    const allTrs = document.querySelectorAll('table tr');

    allTrs.forEach((tr) => {
      // Bỏ qua hàng tiêu đề
      if (tr.querySelector('th')) return;
      const text = tr.innerText || '';
      const hasInput = tr.querySelector('input[type="radio"], input[type="checkbox"]');
      const hasCodeMatch = text.match(/\b\d{8,14}\b/);

      if (hasInput || hasCodeMatch) {
        rows.push(tr);
      }
    });

    return rows;
  }

  // Trích xuất thông tin một hàng lớp học phần
  function parseRowInfo(tr) {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (!cells.length) return null;

    const rowText = tr.innerText || '';
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
      cells.forEach((td) => {
        const t = td.innerText.trim();
        if (/^\d{1,3}$/.test(t)) {
          const num = parseInt(t, 10);
          if (num >= 20 && num <= 150 && max === -1) {
            max = num;
          } else if (num >= 0 && num <= 150 && enrolled === -1) {
            enrolled = num;
          }
        }
      });
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

    const candidates = Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn')
    );

    for (const el of candidates) {
      const val = (el.innerText || el.value || '').trim().toLowerCase();
      if (
        (val.includes('đăng ký') || val.includes('dang ky') || val.includes('lưu đăng ký') || val.includes('lưu vào')) &&
        isVisible(el)
      ) {
        return el;
      }
    }

    return null;
  }

  // Tìm modal xác nhận nếu có
  function handleConfirmDialog() {
    const swalConfirm = document.querySelector('.swal2-confirm, .swal-button--confirm');
    if (swalConfirm && isVisible(swalConfirm)) {
      addLog('Phát hiện hộp thoại xác nhận SweetAlert, tự động bấm Đồng ý...', 'warn');
      swalConfirm.click();
      return true;
    }

    const modalConfirm = document.querySelector('.modal.in .btn-primary, .modal.show .btn-primary');
    if (modalConfirm && isVisible(modalConfirm)) {
      addLog('Phát hiện popup xác nhận, tự động bấm Xác nhận...', 'warn');
      modalConfirm.click();
      return true;
    }

    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // Click mô phỏng người dùng thật
  function simulateRealClick(element) {
    if (!element) return;
    element.focus();
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
      const evt = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(evt);
    });
    if (element.tagName === 'INPUT' && (element.type === 'radio' || element.type === 'checkbox')) {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ==========================================
  // THỰC HIỆN ĐĂNG KÝ HỌC PHẦN
  // ==========================================
  function executeRegistration(targetItem, rowInfo) {
    addLog(`Đang chọn lớp [${targetItem.code}]...`, 'warn');

    if (rowInfo.input) {
      simulateRealClick(rowInfo.input);
    } else {
      simulateRealClick(rowInfo.tr);
    }

    setTimeout(() => {
      selectPracticeGroupIfAny(targetItem);

      if (state.settings.autoRegister) {
        setTimeout(() => {
          const regBtn = findRegisterButton();
          if (regBtn) {
            addLog(`Đang bấm nút Đăng Ký (${regBtn.innerText || regBtn.value || 'Nút ĐK'})...`, 'warn');
            simulateRealClick(regBtn);

            setTimeout(() => {
              handleConfirmDialog();
            }, 250);
          } else {
            addLog('Không tìm thấy nút "Đăng Ký", bạn hãy bấm đăng ký thủ công trên màn hình!', 'error');
          }
        }, 150);
      }
    }, 150);
  }

  // Chọn nhóm thực hành nếu môn có chia ca TH
  function selectPracticeGroupIfAny(targetItem) {
    const practiceRadios = Array.from(
      document.querySelectorAll(
        '#divNhomThucHanh input[type="radio"], .nhom-thuc-hanh input[type="radio"], table input[name*="ThucHanh"]'
      )
    );

    if (!practiceRadios.length) return;

    let selectedRadio = null;

    if (targetItem.practiceGroup) {
      for (const rad of practiceRadios) {
        const parentText = (rad.closest('tr') || rad.parentElement || {}).innerText || '';
        if (parentText.includes(targetItem.practiceGroup)) {
          selectedRadio = rad;
          break;
        }
      }
    }

    if (!selectedRadio && state.settings.autoSelectPractice) {
      for (const rad of practiceRadios) {
        if (!rad.disabled) {
          selectedRadio = rad;
          break;
        }
      }
    }

    if (selectedRadio) {
      const pText = (selectedRadio.closest('tr') || selectedRadio.parentElement || {}).innerText || 'Mặc định';
      addLog(`Tự động chọn nhóm thực hành: ${pText.replace(/\s+/g, ' ').slice(0, 30)}`, 'info');
      simulateRealClick(selectedRadio);
    }
  }

  // ==========================================
  // VÒNG LẶP SĂN SLOT (HUNT LOOP)
  // ==========================================
  function runHuntCycle() {
    if (!state.isRunning) return;

    const rows = findClassRows();

    for (const target of state.targets) {
      if (target.status === 'success' && state.settings.stopOnSuccess) continue;

      let foundRow = null;
      for (const tr of rows) {
        const text = tr.innerText || '';
        if (text.includes(target.code)) {
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

    applyTableFilters();

    if (state.isRunning) {
      const delay = Math.max(300, parseInt(state.settings.intervalMs, 10) || 800);
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
    addLog(`BẮT ĐẦU SĂN SLOT (Tần suất: ${state.settings.intervalMs}ms)`, 'success');
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
  // BỘ LỌC BẢNG & TÔ MÀU
  // ==========================================
  function applyTableFilters() {
    const rows = findClassRows();

    rows.forEach((tr) => {
      const info = parseRowInfo(tr);
      if (!info) return;

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
    });
  }

  // Gắn nút "+ Săn lớp" vào từng dòng trong bảng môn học của trường
  function injectInlineButtons() {
    const rows = findClassRows();
    let count = 0;

    rows.forEach((tr) => {
      if (tr.querySelector('.iuh-inline-add-btn')) return;

      const info = parseRowInfo(tr);
      if (!info || !info.code) return;

      const targetCell = tr.cells[1] || tr.cells[0];
      if (!targetCell) return;

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
    });

    if (count > 0) {
      addLog(`Đã gắn nút [+ Săn] vào ${count} lớp học phần trên trang`, 'info');
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
            addLog(`🛡️ [Keep-Alive] Đã gửi ping giữ phiên thành công (Status: ${res.status})`, 'info');
          } else {
            addLog(`⚠️ [Keep-Alive] Cảnh báo ping trả về mã ${res.status}!`, 'warn');
          }
        })
        .catch((err) => {
          addLog(`❌ [Keep-Alive] Lỗi mạng khi ping: ${err.message}`, 'error');
        });
    }, intervalMs);
  }

  // ==========================================
  // LẮNG NGHE SỰ KIỆN TỪ MAIN WORLD (INJECTED)
  // ==========================================
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'IUH_DKHP_INJECTED') return;

    if (event.data.type === 'WINDOW_ALERT') {
      const msg = event.data.message;
      addLog(`📢 Thông báo từ hệ thống: "${msg}"`, 'warn');

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

    if (event.data.type === 'XHR_RESPONSE' || event.data.type === 'FETCH_RESPONSE') {
      const resp = event.data.response || '';
      if (resp.includes('thành công') || resp.includes('success')) {
        addLog('🎉 Nhận được phản hồi thành công từ máy chủ!', 'success');
        playSoundAlert('success');
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
          <span class="iuh-badge">v1.0</span>
        </div>
        <div class="iuh-hud-controls">
          <button class="iuh-hud-btn-icon" id="iuh-btn-minimize" title="Thu nhỏ">_</button>
          <button class="iuh-hud-btn-icon" id="iuh-btn-close" title="Đóng thu gọn">✕</button>
        </div>
      </div>

      <div class="iuh-hud-tabs">
        <button class="iuh-hud-tab active" data-tab="tab-hunter">🎯 Săn Lớp</button>
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
              <option value="300">Cực nhanh (300ms)</option>
              <option value="500">Nhanh (500ms)</option>
              <option value="800" selected>Chuẩn (800ms)</option>
              <option value="1500">An toàn (1.5s)</option>
              <option value="3000">Chậm (3s)</option>
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

        <!-- TAB 2: LỌC BẢNG -->
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

        <!-- TAB 3: GIỮ PHIÊN -->
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

        <!-- TAB 4: NHẬT KÝ -->
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

    // Kiểm tra trạng thái: Nếu đã thu gọn hoặc chưa bật autoOpenHUD thì MẶC ĐỊNH GỌN LUÔN
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

    // Thu nhỏ / Đóng
    const minimizeHUD = () => {
      hud.style.display = 'none';
      minBall.style.display = 'flex';
      state.settings.isMinimized = true;
      saveConfig();
      addLog('Đã thu gọn bảng điều khiển.', 'info');
    };

    // Phóng to / Mở bảng
    const expandHUD = () => {
      minBall.style.display = 'none';
      hud.style.display = 'block';
      state.settings.isMinimized = false;
      saveConfig();
    };

    document.getElementById('iuh-btn-minimize').addEventListener('click', minimizeHUD);
    const btnClose = document.getElementById('iuh-btn-close');
    if (btnClose) btnClose.addEventListener('click', minimizeHUD);

    minBall.addEventListener('click', expandHUD);

    // Tự động mở bảng checkbox
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

    // Lắng nghe lệnh từ popup hoặc background
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

    // Nút Bắt đầu / Dừng lại
    document.getElementById('iuh-btn-start').addEventListener('click', startHunting);
    document.getElementById('iuh-btn-stop').addEventListener('click', stopHunting);

    // Nút Đăng ký ngay lập tức
    document.getElementById('iuh-btn-force-now').addEventListener('click', () => {
      addLog('⚡ Bấm lệnh Đăng Ký Ngay Lập Tức!', 'warn');
      const rows = findClassRows();
      if (!rows.length) {
        addLog('Không tìm thấy bảng lớp học phần nào trên trang!', 'error');
        return;
      }
      for (const target of state.targets) {
        for (const tr of rows) {
          if (tr.innerText.includes(target.code)) {
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

    // Cài đặt tốc độ
    const selectSpeed = document.getElementById('iuh-select-speed');
    selectSpeed.value = String(state.settings.intervalMs);
    selectSpeed.addEventListener('change', (e) => {
      state.settings.intervalMs = parseInt(e.target.value, 10);
      saveConfig();
      addLog(`Đã đổi tốc độ quét: ${state.settings.intervalMs}ms`, 'info');
    });

    // Checkbox auto register
    const chkAutoReg = document.getElementById('iuh-chk-auto-register');
    chkAutoReg.checked = state.settings.autoRegister;
    chkAutoReg.addEventListener('change', (e) => {
      state.settings.autoRegister = e.target.checked;
      saveConfig();
    });

    // Checkbox âm thanh
    const chkSound = document.getElementById('iuh-chk-sound');
    chkSound.checked = state.settings.soundAlert;
    chkSound.addEventListener('change', (e) => {
      state.settings.soundAlert = e.target.checked;
      saveConfig();
    });

    // Thử âm thanh
    document.getElementById('iuh-btn-test-sound').addEventListener('click', () => {
      playSoundAlert('success');
    });

    // Tab Lọc: Ẩn lớp đầy
    const chkHideFull = document.getElementById('iuh-chk-hide-full');
    chkHideFull.checked = state.settings.hideFullClasses;
    chkHideFull.addEventListener('change', (e) => {
      state.settings.hideFullClasses = e.target.checked;
      applyTableFilters();
      saveConfig();
    });

    // Tab Lọc: Tô màu lớp còn chỗ
    const chkHighlight = document.getElementById('iuh-chk-highlight');
    chkHighlight.checked = state.settings.highlightOpenClasses;
    chkHighlight.addEventListener('change', (e) => {
      state.settings.highlightOpenClasses = e.target.checked;
      applyTableFilters();
      saveConfig();
    });

    // Gắn nút inline
    document.getElementById('iuh-btn-inject-buttons').addEventListener('click', () => {
      injectInlineButtons();
    });

    // Quét lại bảng
    document.getElementById('iuh-btn-refresh-table').addEventListener('click', () => {
      applyTableFilters();
      injectInlineButtons();
      addLog('Đã quét và cập nhật lại bảng học phần', 'info');
    });

    // Tab Giữ phiên: Checkbox
    const chkAntiLogout = document.getElementById('iuh-chk-anti-logout');
    chkAntiLogout.checked = state.settings.antiLogout;
    chkAntiLogout.addEventListener('change', (e) => {
      state.settings.antiLogout = e.target.checked;
      saveConfig();
    });

    // Ping thủ công
    document.getElementById('iuh-btn-manual-ping').addEventListener('click', () => {
      fetch(window.location.href, { cache: 'no-cache', credentials: 'include' })
        .then(() => addLog('📡 Đã gửi ping thủ công giữ phiên thành công!', 'success'))
        .catch((err) => addLog(`Lỗi ping: ${err.message}`, 'error'));
    });

    // Xóa log
    document.getElementById('iuh-btn-clear-logs').addEventListener('click', () => {
      state.logs = [];
      const logContainer = document.getElementById('iuh-log-view');
      if (logContainer) logContainer.innerHTML = '';
    });

    // Đồng hồ đếm thời gian phiên
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

  // Cập nhật trạng thái hiển thị của HUD (Running/Stopped)
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

  // Thêm mã LHP vào danh sách
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
    addLog(`Đã thêm mã LHP: ${code}`, 'success');
  }

  // Xóa mã LHP khỏi danh sách
  function removeTargetCode(code) {
    state.targets = state.targets.filter((t) => t.code !== code);
    saveConfig();
    updateTargetUI();
    applyTableFilters();
    addLog(`Đã xóa mã LHP: ${code}`, 'info');
  }

  // Cập nhật giao diện danh sách target trên HUD
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

  // ==========================================
  // KÉO THẢ GIAO DIỆN (DRAGGABLE)
  // ==========================================
  function makeDraggable(element, handle) {
    let posX = 0, posY = 0, initialMouseX = 0, initialMouseY = 0;
    let hasMoved = false;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

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
  // KHỞI ĐỘNG EXTENSION TRÊN TRANG
  // ==========================================
  function init() {
    loadConfig(() => {
      createHUD();
      setupKeepAlive();
      addLog('Đã khởi tạo IUH DKHP Pro sẵn sàng!', 'success');

      setTimeout(() => {
        injectInlineButtons();
        applyTableFilters();
      }, 1200);

      const observer = new MutationObserver((mutations) => {
        let hasTableChanges = false;
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length > 0) {
            hasTableChanges = true;
            break;
          }
        }
        if (hasTableChanges) {
          setTimeout(() => {
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
