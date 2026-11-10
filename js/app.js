const App = {
  async init() {
    this.setupPWA();
    ExamModule.setupSecurityListeners();
    
    const client = await DB.getClient();
    this.updateDBStatus(client);

    // Inisialisasi Seluruh Data Secara Async
    await MapelModule.loadAndRender();
    await SiswaModule.loadAndRender();
    await SoalModule.loadAndRender();
    await RekapModule.refreshMonitoringData();
    
    JadwalModule.renderJadwalList();
  },

  updateDBStatus(client) {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    if (client) {
      badge.textContent = "Database Connected";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-emerald-600 text-white font-medium";
    } else {
      badge.textContent = "Offline Mode";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-gray-500 text-white font-medium";
    }
  },

  setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) installBtn.classList.remove('hidden');
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    }
  },

  showScreen(screenId) {
    ['login', 'admin', 'exam'].forEach(id => {
      document.getElementById(`screen-${id}`)?.classList.add('hidden');
    });
    document.getElementById(`screen-${screenId}`)?.classList.remove('hidden');
  },

  switchAdminTab(tabName) {
    ['monitoring', 'jadwal', 'rekap-nilai', 'upload-soal', 'siswa', 'bank-soal', 'mapel'].forEach(t => {
      document.getElementById(`tab-${t}`)?.classList.add('hidden');
    });
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
    
    if (tabName === 'rekap-nilai') RekapModule.renderRekapNilai();
    if (tabName === 'monitoring') RekapModule.refreshMonitoringData();
    if (tabName === 'bank-soal') SoalModule.renderBankSoalList();
    if (tabName === 'mapel') MapelModule.loadAndRender();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
