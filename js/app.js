// Pastikan State tersedia (baik dari js/state.js maupun inisialisasi baru)
window.State = window.State || {
  currentUser: null,
  examActive: false,
  timerInterval: null,
  violations: 0,
  currentQuestionIdx: 0,
  answers: {},
  questions: [],
  schedules: [],
  siswaList: [],
  mapelList: []
};

const App = {
  async init() {
    console.log("[App] Menginisialisasi sistem CBT SMKN 1 Wakatobi...");

    if (typeof ExamModule !== 'undefined' && ExamModule.setupSecurityListeners) {
      ExamModule.setupSecurityListeners();
    }

    // Uji koneksi Supabase & update badge status pada layar login
    const badge = document.getElementById('db-status-badge');
    try {
      const client = typeof DB !== 'undefined' ? await DB.getClient() : null;
      if (client) {
        if (badge) {
          badge.textContent = "Terhubung ke Database";
          badge.className = "px-3 py-1 text-[10px] rounded-full bg-emerald-600 text-white font-bold shadow";
        }
      } else {
        if (badge) {
          badge.textContent = "Gagal Terhubung (Periksa config.js)";
          badge.className = "px-3 py-1 text-[10px] rounded-full bg-rose-600 text-white font-bold shadow";
        }
      }
    } catch (e) {
      if (badge) {
        badge.textContent = "Koneksi Terputus";
        badge.className = "px-3 py-1 text-[10px] rounded-full bg-rose-600 text-white font-bold shadow";
      }
    }

    this.showScreen('login');
  },

  showScreen(screenName) {
    const screens = ['login', 'admin', 'exam'];
    screens.forEach(s => {
      const el = document.getElementById(`screen-${s}`);
      if (el) {
        if (s === screenName) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    if (screenName === 'admin' && State.currentUser) {
      this.applyRoleUI();
    }
  },

  applyRoleUI() {
    const user = State.currentUser;
    if (!user) return;

    const nameEl = document.getElementById('admin-profile-name');
    const roleEl = document.getElementById('admin-profile-role');

    const navGuru = document.getElementById('nav-guru');
    const navMapel = document.getElementById('nav-mapel');

    if (user.role === 'admin') {
      if (nameEl) nameEl.textContent = user.nama_admin || user.nama || 'Proktor Utama';
      if (roleEl) roleEl.textContent = 'Online • Admin';
      if (navGuru) navGuru.classList.remove('hidden');
      if (navMapel) navMapel.classList.remove('hidden');
    } else if (user.role === 'guru') {
      if (nameEl) nameEl.textContent = user.nama_guru || 'Guru Pengampu';
      if (roleEl) roleEl.textContent = `Guru • ${user.mapel_diampu || 'Mapel'}`;
      if (navGuru) navGuru.classList.add('hidden');
      if (navMapel) navMapel.classList.add('hidden');
    }
  },

  async switchAdminTab(tabName) {
    // Daftar seluruh ID tab sesuai index.html asli
    const tabIds = [
      'tab-monitoring',
      'tab-jadwal',
      'tab-upload-soal',
      'tab-bank-soal',
      'tab-siswa',
      'tab-guru',
      'tab-mapel',
      'tab-rekap-nilai'
    ];

    tabIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
      targetTab.classList.remove('hidden');
    }

    // Highlight tombol navigasi aktif di sidebar
    const navBtns = document.querySelectorAll('.admin-nav-btn');
    navBtns.forEach(btn => {
      btn.classList.remove('bg-white/10', 'text-white', 'font-bold');
      btn.classList.add('text-slate-300', 'font-medium');
    });

    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) {
      activeNav.classList.remove('text-slate-300', 'font-medium');
      activeNav.classList.add('bg-white/10', 'text-white', 'font-bold');
    }

    // Panggil modul pemuat data sesuai tab
    try {
      if (tabName === 'monitoring' && typeof RekapModule !== 'undefined') {
        await RekapModule.refreshMonitoringData();
      } else if (tabName === 'jadwal' && typeof JadwalModule !== 'undefined') {
        await JadwalModule.loadAndRender();
      } else if ((tabName === 'upload-soal' || tabName === 'bank-soal') && typeof SoalModule !== 'undefined') {
        await SoalModule.loadAndRender();
      } else if (tabName === 'siswa' && typeof SiswaModule !== 'undefined') {
        await SiswaModule.loadAndRender();
      } else if (tabName === 'guru' && typeof GuruModule !== 'undefined') {
        await GuruModule.loadAndRender();
      } else if (tabName === 'mapel' && typeof MapelModule !== 'undefined' && MapelModule.loadAndRender) {
        await MapelModule.loadAndRender();
      } else if (tabName === 'rekap-nilai' && typeof RekapModule !== 'undefined') {
        await RekapModule.renderRekapNilai();
      }
    } catch (err) {
      console.error(`[App] Error memuat tab ${tabName}:`, err.message);
    }
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
