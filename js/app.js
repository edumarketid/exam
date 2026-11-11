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

      // 1. Load Mapel & Siswa Terlebih Dahulu Agar State Terisi
      if (window.MapelModule) try { await MapelModule.loadAndRender(); } catch (e) { console.error("Mapel Error:", e); }
      if (window.SiswaModule) try { await SiswaModule.loadAndRender(); } catch (e) { console.error("Siswa Error:", e); }

      // 2. Load Jadwal Ujian Setelah Mapel & Siswa Siap
      if (window.JadwalModule) try { await JadwalModule.loadAndRender(); } catch (e) { console.error("Jadwal Error:", e); }

      // 3. Modul Bank Soal & Monitoring
      if (window.SoalModule) try { await SoalModule.loadAndRender(); } catch (e) { console.error("Soal Error:", e); }
      if (window.RekapModule) try { await RekapModule.refreshMonitoringData(); } catch (e) { console.error("Rekap Error:", e); }

      console.log("[App] Seluruh Modul Berhasil Dimuat & Siap Digunakan.");
    } catch (err) {
      console.error("[App] Kesalahan kritis:", err.message);
      if (badge) {
        badge.textContent = "Offline / Config Error";
        badge.className = "px-2.5 py-1 text-xs rounded-full bg-amber-600 text-white font-medium";
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

window.App = App;
window.addEventListener('load', () => App.init());
