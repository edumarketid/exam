const JadwalModule = {
  async loadAndRender() {
    try {
      console.log("[JadwalModule] Menarik data jadwal dari Supabase...");
      State.schedules = await DB.fetchSchedules();
      console.log("[JadwalModule] Data jadwal diterima:", State.schedules.length, "entri");
      
      this.populateJadwalDropdowns();
      this.renderJadwalList();
    } catch (err) {
      console.error("[JadwalModule] Error:", err.message);
    }
  },

  populateJadwalDropdowns() {
    const selectMapel = document.getElementById('jadwal-mapel');
    const selectKelas = document.getElementById('jadwal-kelas');

    if (selectMapel && State.mapelList && State.mapelList.length > 0) {
      selectMapel.innerHTML = State.mapelList.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    if (selectKelas && State.kelasOptions && State.kelasOptions.length > 0) {
      selectKelas.innerHTML = State.kelasOptions.map(k => `<option value="${k}">${k}</option>`).join('');
    }
  },

  async saveJadwalUjian(e) {
    e.preventDefault();
    const mapel = document.getElementById('jadwal-mapel')?.value;
    const kelas = document.getElementById('jadwal-kelas')?.value;
    const tanggal = document.getElementById('jadwal-tanggal')?.value;
    const durasi = parseInt(document.getElementById('jadwal-durasi')?.value || 45);
    const jamMulai = document.getElementById('jadwal-jam-mulai')?.value;
    const jamSelesai = document.getElementById('jadwal-jam-selesai')?.value;

    if (!mapel || !kelas || !tanggal || !jamMulai || !jamSelesai) {
      alert("Mohon lengkapi seluruh form jadwal ujian!");
      return;
    }

    const client = await DB.getClient();
    if (client) {
      try {
        const { error } = await client.from('jadwal_ujian').insert([{
          mapel: mapel,
          kelas: kelas,
          tanggal: tanggal,
          durasi: durasi,
          jam_mulai: jamMulai,
          jam_selesai: jamSelesai
        }]);

        if (error) throw error;

        alert(`Jadwal Ujian ${mapel} [${kelas}] berhasil disimpan ke Supabase!`);
        await this.loadAndRender();
      } catch (err) {
        alert("Gagal menyimpan jadwal ke Supabase: " + err.message);
      }
    }
  },

  renderJadwalList() {
    const container = document.getElementById('jadwal-list-container');
    if (!container) return;
    container.innerHTML = '';

    const list = State.schedules || [];

    if (list.length === 0) {
      container.innerHTML = `
        <div class="p-4 border rounded-lg bg-purple-50 text-purple-800 text-xs text-center italic">
          Belum ada jadwal ujian yang aktif di Supabase. Silakan tambah jadwal pada form di atas.
        </div>`;
      return;
    }

    list.forEach((j, idx) => {
      const card = document.createElement('div');
      card.className = "flex justify-between items-center p-3 border rounded-lg bg-purple-50 text-xs shadow-sm mb-2 transition hover:bg-purple-100";
      card.innerHTML = `
        <div>
          <span class="font-bold text-purple-900 block text-sm">[${j.kelas}] ${j.mapel}</span>
          <div class="text-gray-600 mt-1">
            🗓️ Tanggal: <strong>${j.tanggal}</strong> | ⏰ Jam: <strong>${j.jamMulai} - ${j.jamSelesai}</strong> (${j.durasi} Menit)
          </div>
        </div>
        <button onclick="JadwalModule.deleteJadwal(${j.id || idx})" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded font-bold text-[11px] shadow">
          Hapus Jadwal
        </button>
      `;
      container.appendChild(card);
    });
  },

  async deleteJadwal(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus jadwal ujian ini dari Supabase?")) return;
    const client = await DB.getClient();
    if (client) {
      try {
        const { error } = await client.from('jadwal_ujian').delete().eq('id', id);
        if (error) throw error;
        alert("Jadwal ujian berhasil dihapus.");
        await this.loadAndRender();
      } catch (err) {
        alert("Gagal menghapus jadwal: " + err.message);
      }
    }
  }
};

window.JadwalModule = JadwalModule;
