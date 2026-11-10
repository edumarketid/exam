const App = {
  async init() {
    console.log("[App] Memulai inisialisasi aplikasi CBT...");
    this.setupPWA();
    if (window.ExamModule) ExamModule.setupSecurityListeners();
    
    // Set indikator awal
    const badge = document.getElementById('db-status-badge');
    if (badge) {
      badge.textContent = "Menghubungkan...";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-yellow-500 text-white font-medium animate-pulse";
    }

    try {
      const client = await DB.getClient();
      this.updateDBStatus(client);

      // Jalankan fungsi modul satu per satu dengan pelindung try-catch per modul
      if (window.MapelModule) await MapelModule.loadAndRender();
      if (window.SiswaModule) await SiswaModule.loadAndRender();
      if (window.SoalModule) await SoalModule.loadAndRender();
      if (window.RekapModule) await RekapModule.refreshMonitoringData();
      if (window.JadwalModule) JadwalModule.renderJadwalList();

      console.log("[App] Aplikasi Siap Digunakan.");
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
      badge.textContent = "Offline / Config Belum Diisi";
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
    if (tabName === 'bank-soal' && window.SoalModule) SoalModule.renderBankSoalList();
    if (tabName === 'mapel' && window.MapelModule) MapelModule.loadAndRender();
  }
};

// Pastikan DOM siap penuh sebelum App.init dipanggil
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
