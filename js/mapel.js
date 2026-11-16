const MapelModule = {
  normalizeText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  // Helper terpusat: ambil mapel murni dari State.mapelList di memori aplikasi
  getMapelListForCurrentUser() {
    const masterList = Array.isArray(State.mapelList)
      ? [...new Set(State.mapelList.map(m => String(m || '').trim()).filter(Boolean))]
      : [];

    if (!State.currentUser || State.currentUser.role !== 'guru') {
      return masterList.sort((a, b) => a.localeCompare(b, 'id'));
    }

    // Ekstrak nama mapel guru tanpa embel-embel "(Kelas)"
    const rawMapel = String(State.currentUser.mapel_diampu || '').trim();
    if (!rawMapel || rawMapel === '-') return [];
    if (rawMapel.toUpperCase() === 'ALL') {
      return masterList.sort((a, b) => a.localeCompare(b, 'id'));
    }

    const guruMapels = rawMapel
      .split(',')
      .map(token => {
        const match = token.trim().match(/^(.+?)\s*\(([^()]+)\)$/);
        return match ? match[1].trim() : token.trim();
      })
      .filter(Boolean);

    const uniqueGuruMapels = [...new Set(guruMapels)];

    // Jika master State.mapelList sudah tersedia di memori, cocokan dengan daftar master
    if (masterList.length > 0) {
      const matched = masterList.filter(m =>
        uniqueGuruMapels.some(gm => this.normalizeText(gm) === this.normalizeText(m))
      );
      return (matched.length > 0 ? matched : uniqueGuruMapels).sort((a, b) => a.localeCompare(b, 'id'));
    }

    return uniqueGuruMapels.sort((a, b) => a.localeCompare(b, 'id'));
  },

  async ensureMapelLoaded() {
    if (!Array.isArray(State.mapelList) || State.mapelList.length === 0) {
      State.mapelList = await DB.fetchMapel();
    }
    return State.mapelList;
  },

  async loadAndRender(forceRefresh = false) {
    try {
      if (forceRefresh || !Array.isArray(State.mapelList) || State.mapelList.length === 0) {
        State.mapelList = await DB.fetchMapel();
      }
      this.renderTabList();
      this.populateDropdowns();
    } catch (err) {
      console.error("[MapelModule] Error:", err.message);
    }
  },

  renderTabList() {
    const container = document.getElementById('mapel-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (!State.mapelList || State.mapelList.length === 0) {
      container.innerHTML = `<p class="text-xs text-amber-600 italic">Belum ada data mata pelajaran di aplikasi.</p>`;
      return;
    }

    State.mapelList.forEach((m, idx) => {
      const div = document.createElement('div');
      div.className = "flex justify-between items-center p-3 border rounded bg-gray-50 text-xs shadow-sm mb-2";
      div.innerHTML = `
        <span class="font-bold text-gray-800">${idx + 1}. ${m}</span>
        <button onclick="MapelModule.handleDelete('${m.replace(/'/g, "\\'")}')" class="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2.5 py-1 rounded font-bold">
          Hapus Mapel
        </button>
      `;
      container.appendChild(div);
    });
  },

  populateDropdowns() {
    const selectUpload = document.getElementById('select-upload-mapel');
    const selectJadwal = document.getElementById('jadwal-mapel');
    const selectRekap = document.getElementById('rekap-filter-mapel');
    const selectBank = document.getElementById('bank-filter-mapel');

    const allowedMapels = this.getMapelListForCurrentUser();
    const opts = allowedMapels.map(m => `<option value="${m}">${m}</option>`).join('');

    if (selectUpload) selectUpload.innerHTML = `<option value="">-- Pilih Mata Pelajaran --</option>` + opts;
    if (selectJadwal) selectJadwal.innerHTML = `<option value="">-- Pilih Mata Pelajaran --</option>` + opts;
    if (selectRekap) selectRekap.innerHTML = `<option value="ALL">-- Semua Mapel --</option>` + opts;
    if (selectBank) selectBank.innerHTML = `<option value="ALL">-- Semua Mapel --</option>` + opts;
  },

  async handleAdd(e) {
    e.preventDefault();
    const input = document.getElementById('input-nama-mapel-baru');
    const namaMapel = input.value.trim();
    if (!namaMapel) return;

    try {
      await DB.insertMapel(namaMapel);
      // Perbarui State.mapelList langsung di memori lokal tanpa fetch ulang
      if (!Array.isArray(State.mapelList)) State.mapelList = [];
      if (!State.mapelList.some(m => this.normalizeText(m) === this.normalizeText(namaMapel))) {
        State.mapelList.push(namaMapel);
      }
      alert(`Mata pelajaran "${namaMapel}" berhasil ditambahkan!`);
      input.value = '';
      this.renderTabList();
      this.populateDropdowns();
    } catch (err) {
      alert(`Gagal menambah mapel: ${err.message}`);
    }
  },

  async handleDelete(namaMapel) {
    if (!confirm(`Hapus mata pelajaran "${namaMapel}" dari Supabase?`)) return;
    try {
      await DB.deleteMapel(namaMapel);
      // Hapus langsung dari State.mapelList di memori lokal tanpa fetch ulang
      State.mapelList = (State.mapelList || []).filter(
        m => this.normalizeText(m) !== this.normalizeText(namaMapel)
      );
      alert(`Mata pelajaran "${namaMapel}" berhasil dihapus.`);
      this.renderTabList();
      this.populateDropdowns();
    } catch (err) {
      alert(`Gagal menghapus mapel: ${err.message}`);
    }
  }
};

window.MapelModule = MapelModule;
