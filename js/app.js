const App = {
  async init() {
    console.log("[App] Memulai inisialisasi aplikasi CBT...");
    this.setupPWA();
    if (window.ExamModule) ExamModule.setupSecurityListeners();
    
    const badge = document.getElementById('db-status-badge');
    if (badge) {
      badge.textContent = "Menghubungkan...";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-yellow-500 text-white font-medium animate-pulse";
    }

    try {
      const client = await DB.getClient();
      this.updateDBStatus(client);

      // 1. Load Data Mapel
      if (window.MapelModule) await MapelModule.loadAndRender();

      // 2. Load Data Siswa & Kartu
      if (window.SiswaModule) await SiswaModule.loadAndRender();

      // 3. Load Bank Soal & Upload
      if (window.SoalModule) await SoalModule.loadAndRender();

      // 4. Load Jadwal Ujian
      if (window.JadwalModule) await JadwalModule.loadAndRender();

      // 5. Load Live Monitoring & Rekap Nilai
      if (window.RekapModule) await RekapModule.refreshMonitoringData();

      console.log("[App] Seluruh Modul Berhasil Dimuat & Siap Digunakan.");
    } catch (err) {
      console.error("[App] Terjadi kesalahan saat inisialisasi:", err.message);
      if (badge) {
        badge.textContent = "Error DB";
        badge.className = "px-2.5 py-1 text-xs rounded-full bg-red-600 text-white font-medium";
      }
    }
  },

  updateDBStatus(client) {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    
    if (client) {
      badge.textContent = "Database Connected";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-emerald-600 text-white font-medium";
    } else {
      badge.textContent = "Offline / Config Error";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-amber-600 text-white font-medium";
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
    
    if (tabName === 'rekap-nilai' && window.RekapModule) RekapModule.renderRekapNilai();
    if (tabName === 'monitoring' && window.RekapModule) RekapModule.refreshMonitoringData();
    if (tabName === 'bank-soal' && window.SoalModule) SoalModule.loadAndRender();
    if (tabName === 'siswa' && window.SiswaModule) SiswaModule.loadAndRender();
    if (tabName === 'jadwal' && window.JadwalModule) JadwalModule.loadAndRender();
    if (tabName === 'mapel' && window.MapelModule) MapelModule.loadAndRender();
  }
};

window.addEventListener('load', () => App.init());

