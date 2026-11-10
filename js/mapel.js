const MapelModule = {
  async loadAndRender() {
    try {
      console.log("[MapelModule] Menarik data mapel dari Supabase...");
      State.mapelList = await DB.fetchMapel();
      console.log("[MapelModule] Data mapel diterima:", State.mapelList);
      
      this.renderTabList();
      this.populateDropdowns();
    } catch (err) {
      console.error("[MapelModule] Error saat render mapel:", err.message);
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
      div.className = "flex justify-between items-center p-3 border rounded bg-gray-50 text-xs shadow-sm";
      div.innerHTML = `
        <span class="font-bold text-gray-800">${idx + 1}. ${m}</span>
        <button onclick="MapelModule.handleDelete('${m.replace(/'/g, "\\'")}')" class="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2.5 py-1 rounded font-bold transition">
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

    const opts = State.mapelList.map(m => `<option value="${m}">${m}</option>`).join('');
    
    if (selectUpload) selectUpload.innerHTML = opts;
    if (selectJadwal) selectJadwal.innerHTML = opts;
    if (selectRekap) selectRekap.innerHTML = `<option value="ALL">Semua Mapel</option>` + opts;
    if (selectBank) selectBank.innerHTML = `<option value="ALL">Semua Mapel</option>` + opts;
  },

  async handleAdd(e) {
    e.preventDefault();
    const input = document.getElementById('input-nama-mapel-baru');
    const namaMapel = input.value.trim();
    if (!namaMapel) return;

    try {
      await DB.insertMapel(namaMapel);
      alert(`Mata pelajaran "${namaMapel}" berhasil ditambahkan ke Supabase!`);
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

// Pastikan terdaftar global di browser
window.MapelModule = MapelModule;
