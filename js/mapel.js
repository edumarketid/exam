const MapelModule = {
  async loadAndRender() {
    try {
      State.mapelList = await DB.fetchMapel();
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
      container.innerHTML = `<p class="text-xs text-amber-600 italic">Belum ada data mata pelajaran di Supabase.</p>`;
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
    
    if (!State.mapelList || State.mapelList.length === 0) return;

    let allowedMapels = State.mapelList;
    if (State.currentUser && State.currentUser.role === 'guru') {
      const rawMapel = String(State.currentUser.mapel_diampu || '').trim();
      const guruMapelList = (!rawMapel || rawMapel === '-' || rawMapel.toUpperCase() === 'ALL')
        ? []
        : rawMapel.split(',').map(m => m.trim().toUpperCase()).filter(Boolean);

      allowedMapels = State.mapelList.filter(m =>
        guruMapelList.includes(String(m).trim().toUpperCase())
      );
    }

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
      alert(`Mata pelajaran "${namaMapel}" berhasil ditambahkan!`);
      input.value = '';
      await this.loadAndRender();
    } catch (err) {
      alert(`Gagal menambah mapel: ${err.message}`);
    }
  },

  async handleDelete(namaMapel) {
    if (!confirm(`Hapus mata pelajaran "${namaMapel}" dari Supabase?`)) return;
    try {
      await DB.deleteMapel(namaMapel);
      alert(`Mata pelajaran "${namaMapel}" berhasil dihapus.`);
      await this.loadAndRender();
    } catch (err) {
      alert(`Gagal menghapus mapel: ${err.message}`);
    }
  }
};

window.MapelModule = MapelModule;
