/**
 * IUH DKHP Pro - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dot = document.getElementById('page-status-dot');
  const statusText = document.getElementById('page-status-text');
  const btnOpenDkhp = document.getElementById('btn-open-dkhp');

  const inputCode = document.getElementById('popup-input-code');
  const btnAdd = document.getElementById('popup-btn-add');
  const targetList = document.getElementById('popup-target-list');
  const targetCount = document.getElementById('target-count');

  const chkAutoReg = document.getElementById('setting-auto-reg');
  const chkSound = document.getElementById('setting-sound');
  const chkKeepAlive = document.getElementById('setting-keepalive');
  const selectSpeed = document.getElementById('setting-speed');

  // Kiểm tra tab hiện tại xem có phải dkhp.iuh.edu.vn không
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = (currentTab && currentTab.url) || '';

    if (url.includes('dkhp.iuh.edu.vn') || url.includes('sv.iuh.edu.vn')) {
      dot.className = 'dot connected';
      statusText.innerText = 'Đã kết nối với cổng ĐKHP IUH';
      btnOpenDkhp.style.display = 'none';
    } else {
      dot.className = 'dot disconnected';
      statusText.innerText = 'Chưa mở trang ĐKHP IUH';
      btnOpenDkhp.style.display = 'inline-block';
    }
  });

  // Nút mở trang dkhp.iuh.edu.vn
  btnOpenDkhp.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://dkhp.iuh.edu.vn/' });
    window.close();
  });

  // Tải cấu hình và danh sách target từ chrome.storage.local
  function loadData() {
    chrome.storage.local.get(['dkhp_settings', 'dkhp_targets'], (data) => {
      const settings = data.dkhp_settings || {};
      const targets = data.dkhp_targets || [];

      // Render settings
      if (typeof settings.autoRegister !== 'undefined') {
        chkAutoReg.checked = settings.autoRegister;
      }
      if (typeof settings.soundAlert !== 'undefined') {
        chkSound.checked = settings.soundAlert;
      }
      if (typeof settings.antiLogout !== 'undefined') {
        chkKeepAlive.checked = settings.antiLogout;
      }
      if (settings.intervalMs) {
        selectSpeed.value = String(settings.intervalMs);
      }

      // Render targets
      renderTargets(targets);
    });
  }

  function renderTargets(targets) {
    targetCount.innerText = targets.length;

    if (!targets.length) {
      targetList.innerHTML = '<div class="empty-state">Chưa có mã LHP nào được lưu.</div>';
      return;
    }

    let html = '';
    targets.forEach((t) => {
      html += `
        <div class="target-item">
          <span class="target-code">${t.code}</span>
          <button class="btn-delete" data-code="${t.code}" title="Xóa mã này">✕</button>
        </div>
      `;
    });

    targetList.innerHTML = html;

    targetList.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const code = e.currentTarget.getAttribute('data-code');
        deleteTarget(code);
      });
    });
  }

  // Thêm mã LHP
  function addTarget() {
    const code = (inputCode.value || '').trim();
    if (!code) return;

    chrome.storage.local.get(['dkhp_targets'], (data) => {
      const targets = data.dkhp_targets || [];
      if (targets.some((t) => t.code === code)) {
        alert('Mã lớp học phần này đã có trong danh sách!');
        return;
      }

      targets.push({
        code: code,
        practiceGroup: '',
        status: 'idle'
      });

      chrome.storage.local.set({ dkhp_targets: targets }, () => {
        inputCode.value = '';
        renderTargets(targets);
      });
    });
  }

  // Xóa mã LHP
  function deleteTarget(code) {
    chrome.storage.local.get(['dkhp_targets'], (data) => {
      let targets = data.dkhp_targets || [];
      targets = targets.filter((t) => t.code !== code);
      chrome.storage.local.set({ dkhp_targets: targets }, () => {
        renderTargets(targets);
      });
    });
  }

  // Cập nhật cài đặt
  function updateSetting(key, val) {
    chrome.storage.local.get(['dkhp_settings'], (data) => {
      const settings = data.dkhp_settings || {};
      settings[key] = val;
      chrome.storage.local.set({ dkhp_settings: settings });
    });
  }

  // Gắn sự kiện
  btnAdd.addEventListener('click', addTarget);
  inputCode.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTarget();
  });

  chkAutoReg.addEventListener('change', (e) => updateSetting('autoRegister', e.target.checked));
  chkSound.addEventListener('change', (e) => updateSetting('soundAlert', e.target.checked));
  chkKeepAlive.addEventListener('change', (e) => updateSetting('antiLogout', e.target.checked));
  selectSpeed.addEventListener('change', (e) => updateSetting('intervalMs', parseInt(e.target.value, 10)));

  // Khởi động
  loadData();
});

