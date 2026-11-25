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
  APP_VERSION: 'v14',

  async init() {
    console.log(`[App] Menginisialisasi sistem CBT Semi-Online SMKN 1 Wakatobi (${this.APP_VERSION})...`);

    const verLabel = document.getElementById('app-version-label');
    if (verLabel) {
      verLabel.textContent = `Versi Aplikasi: ${this.APP_VERSION}`;
    }

    if (typeof ExamModule !== 'undefined' && ExamModule.setupSecurityListeners) {
      ExamModule.setupSecurityListeners();
    }

    this.setupNetworkListeners();
    await this.updateConnectionBadge();

    this.showScreen('login');
  },

  // Menghapus cache Service Worker lama & memuat ulang kode terbaru TANPA menghapus paket soal/nilai di localStorage
  async forceUpdateApp() {
    if (!navigator.onLine) {
      alert(
        "Perangkat sedang OFFLINE.\n\n" +
        "Nyalakan data seluler atau sambungkan ke WiFi/hotspot pengawas sebentar (3 detik), lalu tekan tombol 'Perbarui Aplikasi' lagi."
      );
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          // Pertahankan cache gambar soal agar tidak perlu unduh gambar ulang
          if (!name.includes('images')) {
            await caches.delete(name);
          }
        }
      }

      alert(`Cache aplikasi berhasil dibersihkan!\n\nHalaman akan dimuat ulang ke versi terbaru (${this.APP_VERSION}). Paket soal offline Anda tetap aman.`);
      const cleanUrl = window.location.origin + window.location.pathname + '?v=' + Date.now();
      window.location.replace(cleanUrl);
    } catch (err) {
      alert("Gagal memperbarui otomatis: " + err.message + "\n\nSilakan muat ulang (refresh) browser secara manual.");
      window.location.reload();
    }
  },

  setupNetworkListeners() {
    window.addEventListener('online', async () => {
      await this.updateConnectionBadge();

      if (typeof ExamModule !== 'undefined' && ExamModule.syncOfflineResults) {
        await ExamModule.syncOfflineResults(false);
      }
    });

    window.addEventListener('offline', async () => {
      await this.updateConnectionBadge();

      if (
        State.currentUser &&
        State.currentUser.role === 'siswa' &&
        !State.examActive &&
        typeof ExamModule !== 'undefined' &&
        ExamModule.renderStudentLobby
      ) {
        await ExamModule.renderStudentLobby();
      }
    });
  },

  async updateConnectionBadge() {
    const badge = document.getElementById('db-status-badge');
    if (!navigator.onLine) {
      if (badge) {
        badge.textContent = "Mode Offline (Siap untuk Siswa)";
        badge.className = "px-3 py-1 text-[10px] rounded-full bg-amber-500 text-slate-900 font-bold shadow";
      }
      return;
    }

    try {
      const client = typeof DB !== 'undefined' ? await DB.getClient() : null;
      if (client) {
        if (badge) {
          badge.textContent = "Terhubung ke Database (Online)";
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
  },

  renderAdminRoomTokenBanner() {
    const host = document.getElementById('tab-monitoring');
    if (!host || typeof ExamModule === 'undefined' || !ExamModule.computeSessionRoomToken) return;

    const rooms = ExamModule.getRoomList ? ExamModule.getRoomList() : ['Ruang 01'];
    const verLabel = this.APP_VERSION || 'v14';

    const waLines = [
      `*PIN PENGAWAS RUANG UJIAN CBT (15 RUANGAN)*`,
      `-------------------------`
    ];

    const gridHtml = rooms.map(roomName => {
      const pin = ExamModule.computeSessionRoomToken(null, roomName);
      waLines.push(`${roomName}: *${pin}*`);
      return `
        <div class="bg-slate-950/75 border border-ocean-600/60 px-3 py-2 rounded-xl flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-300">${roomName}</span>
          <span class="font-mono font-black text-base tracking-widest text-amber-300">${pin}</span>
        </div>
      `;
    }).join('');

    let box = document.getElementById('admin-room-token-banner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'admin-room-token-banner';
      host.prepend(box);
    }

    box.className = 'bg-gradient-to-r from-ocean-900 to-ocean-800 text-white p-4 rounded-2xl border border-ocean-700 shadow-sm space-y-3';
    box.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-[10px] uppercase tracking-wider font-bold text-teal-300">🔐 PIN / Token Pengawas per Ruangan (Ruang 01 – 15 • ${verLabel})</div>
          <p class="text-[11px] text-ocean-100">
            Bagikan ke grup WA Pengawas agar ditulis di papan tulis masing-masing ruangan. Pastikan halaman login siswa bertuliskan versi <strong>${verLabel}</strong>.
          </p>
        </div>
        <button type="button" id="btn-copy-all-room-pins"
                class="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow transition flex items-center gap-1.5">
          <i class="fa-regular fa-copy"></i>
          <span>Salin Semua PIN (WA)</span>
        </button>
      </div>
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
        ${gridHtml}
      </div>
    `;

    const copyBtn = document.getElementById('btn-copy-all-room-pins');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(waLines.join('\n'));
          copyBtn.innerHTML = `<i class="fa-solid fa-check"></i><span>Tersalin ke Clipboard!</span>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i><span>Salin Semua PIN (WA)</span>`;
          }, 2000);
        } catch (e) {
          alert(waLines.join('\n'));
        }
      };
    }
  },

  showScreen(screenName) {
    const screens = ['login', 'student-lobby', 'admin', 'exam'];
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
      const statusKepeg = String(user.status_kepegawaian || user.STATUS_KEPEGAWAIAN || '').trim();
      let labelStatusGuru = 'Guru';
      if (statusKepeg) {
        labelStatusGuru = /^guru\s/i.test(statusKepeg) ? statusKepeg : `Guru ${statusKepeg}`;
      }
      if (roleEl) roleEl.textContent = labelStatusGuru;
      if (navGuru) navGuru.classList.add('hidden');
      if (navMapel) navMapel.classList.add('hidden');
    }
  },

  async switchAdminTab(tabName) {
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

    try {
      if (tabName === 'monitoring') {
        if (typeof DB !== 'undefined') {
          if (!State.schedules || State.schedules.length === 0) {
            State.schedules = await DB.fetchSchedules();
          }
          if (DB.closeExpiredMengerjakanSessions) {
            await DB.closeExpiredMengerjakanSessions();
          }
        }
        this.renderAdminRoomTokenBanner();
        if (typeof RekapModule !== 'undefined') {
          await RekapModule.refreshMonitoringData();
        }
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
      } else if (tabName === 'rekap-nilai') {
        if (typeof DB !== 'undefined' && DB.closeExpiredMengerjakanSessions) {
          await DB.closeExpiredMengerjakanSessions();
        }
        if (typeof RekapModule !== 'undefined') {
          await RekapModule.renderRekapNilai();
        }
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
