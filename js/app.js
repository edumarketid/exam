// ==========================================================
// GLOBAL STATE APLIKASI CBT EXAM SMKN 1 WAKATOBI
// ==========================================================
const State = {
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

window.State = State;

// ==========================================================
// CONTROLLER UTAMA APLIKASI (APP)
// ==========================================================
const App = {
  async init() {
    console.log("[App] Menginisialisasi sistem ExamSMKN1Wakatobi...");

    // Inisialisasi pendengar keamanan anti-kecurangan (Fullscreen & Tab Switch)
    if (typeof ExamModule !== 'undefined' && ExamModule.setupSecurityListeners) {
      ExamModule.setupSecurityListeners();
    }

    // Pastikan koneksi database Supabase siap
    if (typeof DB !== 'undefined' && DB.getClient) {
      await DB.getClient();
    }

    // Tampilkan layar login sebagai layar awal
    this.showScreen('login');
  },

  // --- NAVIGASI LAYAR UTAMA (LOGIN / ADMIN-GURU / EXAM) ---
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

    // Jika masuk ke dashboard Admin/Guru, sesuaikan profil & pembatasan hak akses menu
    if (screenName === 'admin' && State.currentUser) {
      this.applyRoleUI();
    }
  },

  // --- PENYESUAIAN TAMPILAN & HAK AKSES BERDASARKAN ROLE (ADMIN VS GURU) ---
  applyRoleUI() {
    const user = State.currentUser;
    if (!user) return;

    const profileNameEl = document.getElementById('admin-profile-name');
    const profileRoleEl = document.getElementById('admin-profile-role');

    const navGuruBtn = document.getElementById('nav-guru');
    const navMapelBtn = document.getElementById('nav-mapel');
    const navSiswaBtn = document.getElementById('nav-siswa');

    if (user.role === 'admin') {
      if (profileNameEl) profileNameEl.textContent = user.nama_admin || user.nama || 'Administrator Proktor';
      if (profileRoleEl) profileRoleEl.textContent = 'Proktor Utama • Akses Penuh';

      // Tampilkan seluruh menu untuk Admin
      if (navGuruBtn) navGuruBtn.classList.remove('hidden');
      if (navMapelBtn) navMapelBtn.classList.remove('hidden');
      if (navSiswaBtn) navSiswaBtn.classList.remove('hidden');
    } else if (user.role === 'guru') {
      if (profileNameEl) profileNameEl.textContent = user.nama_guru || 'Guru Pengampu';
      if (profileRoleEl) profileRoleEl.textContent = `Guru • ${user.mapel_diampu || 'Mata Pelajaran'}`;

      // Sembunyikan menu manajemen master sistem (Guru & Mapel) dari akun Guru Biasa
      if (navGuruBtn) navGuruBtn.classList.add('hidden');
      if (navMapelBtn) navMapelBtn.classList.add('hidden');
      if (navSiswaBtn) navSiswaBtn.classList.remove('hidden');
    }
  },

  // --- PERPINDAHAN TAB DI PANEL ADMIN / GURU ---
  async switchAdminTab(tabName) {
    // 1. Sembunyikan seluruh kontainer tab
    const allContents = document.querySelectorAll('.admin-tab-content');
    allContents.forEach(el => el.classList.add('hidden'));

    // 2. Tampilkan kontainer tab yang dipilih
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) {
      activeTab.classList.remove('hidden');
    }

    // 3. Perbarui gaya tombol navigasi aktif di sidebar
    const allNavBtns = document.querySelectorAll('.admin-nav-btn');
    allNavBtns.forEach(btn => {
      btn.classList.remove('bg-ocean-700', 'text-white', 'shadow-md');
      btn.classList.add('text-ocean-100', 'hover:bg-ocean-800/60');
    });

    const activeBtn = document.getElementById(`nav-${tabName}`);
    if (activeBtn) {
      activeBtn.classList.remove('text-ocean-100', 'hover:bg-ocean-800/60');
      activeBtn.classList.add('bg-ocean-700', 'text-white', 'shadow-md');
    }

    // 4. Muat data secara otomatis sesuai tab yang dibuka
    try {
      switch (tabName) {
        case 'monitoring':
          if (typeof RekapModule !== 'undefined') {
            await RekapModule.refreshMonitoringData();
          }
          break;

        case 'jadwal':
          if (typeof JadwalModule !== 'undefined') {
            await JadwalModule.loadAndRender();
          }
          break;

        case 'upload-soal':
        case 'bank-soal':
          if (typeof SoalModule !== 'undefined') {
            await SoalModule.loadAndRender();
          }
          break;

        case 'siswa':
          if (typeof SiswaModule !== 'undefined') {
            await SiswaModule.loadAndRender();
          }
          break;

        case 'guru':
          if (typeof GuruModule !== 'undefined') {
            await GuruModule.loadAndRender();
          }
          break;

        case 'mapel':
          await this.loadAndRenderMapel();
          break;

        case 'rekap':
          if (typeof RekapModule !== 'undefined') {
            await RekapModule.renderRekapNilai();
          }
          break;

        default:
          console.warn(`[App] Tab "${tabName}" tidak dikenali.`);
      }
    } catch (err) {
      console.error(`[App] Gagal memuat data untuk tab "${tabName}":`, err.message);
    }
  },

  // ==========================================================
  // MODUL MANAJEMEN DATA MATA PELAJARAN (MAPEL)
  // ==========================================================
  async loadAndRenderMapel() {
    const container = document.getElementById('mapel-list-container');
    if (!container) return;

    try {
      State.mapelList = await DB.fetchMapel();
      
      if (!State.mapelList || State.mapelList.length === 0) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
            <p class="font-bold">Belum ada data mata pelajaran tersimpan di Supabase.</p>
          </div>`;
        return;
      }

      let html = `
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
              <th class="p-3 text-center w-14">No</th>
              <th class="p-3">Nama Mata Pelajaran</th>
              <th class="p-3 text-center w-28">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
      `;

      State.mapelList.forEach((namaMapel, idx) => {
        const safeName = String(namaMapel).replace(/'/g, "\\'");
        html += `
          <tr class="hover:bg-slate-50 transition">
            <td class="p-3 text-center font-bold text-slate-500">${idx + 1}</td>
            <td class="p-3 font-bold text-slate-800">${namaMapel}</td>
            <td class="p-3 text-center">
              <button onclick="App.deleteMapelItem('${safeName}')" 
                      class="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] px-3 py-1 rounded-lg border border-rose-200 transition">
                🗑️ Hapus
              </button>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      container.innerHTML = html;
    } catch (err) {
      console.error("[App] Error memuat daftar mapel:", err.message);
    }
  },

  async saveNewMapel(e) {
    if (e) e.preventDefault();
    const inputEl = document.getElementById('input-nama-mapel');
    if (!inputEl) return;

    const namaMapel = inputEl.value.trim();
    if (!namaMapel) {
      alert("Silakan ketik nama mata pelajaran terlebih dahulu!");
      return;
    }

    // Cek duplikasi nama mapel di daftar saat ini
    const isDuplicate = (State.mapelList || []).some(
      m => String(m).trim().toUpperCase() === namaMapel.toUpperCase()
    );
    if (isDuplicate) {
      alert(`Mata pelajaran "${namaMapel}" sudah ada dalam daftar!`);
      return;
    }

    try {
      await DB.insertMapel(namaMapel);
      alert(`Berhasil menambahkan mata pelajaran: "${namaMapel}"`);
      inputEl.value = '';
      await this.loadAndRenderMapel();
    } catch (err) {
      alert("Gagal menambah mapel: " + err.message);
    }
  },

  async deleteMapelItem(namaMapel) {
    if (!confirm(`Apakah Anda yakin ingin menghapus mata pelajaran "${namaMapel}"?`)) return;

    try {
      await DB.deleteMapel(namaMapel);
      alert(`Mata pelajaran "${namaMapel}" berhasil dihapus.`);
      await this.loadAndRenderMapel();
    } catch (err) {
      alert("Gagal menghapus mata pelajaran: " + err.message);
    }
  }
};

window.App = App;

// Jalankan inisialisasi saat seluruh DOM selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
