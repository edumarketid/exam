const JadwalModule = {
  async loadAndRender() {
    try {
      State.schedules = await DB.fetchSchedules();
      this.renderJadwalList();
    } catch (err) {
      console.error("[JadwalModule] Error:", err.message);
    }
  },

  async saveJadwalUjian(e) {
    e.preventDefault();
    const mapel = document.getElementById('jadwal-mapel').value;
    const kelas = document.getElementById('jadwal-kelas').value;
    const tanggal = document.getElementById('jadwal-tanggal').value;
    const durasi = parseInt(document.getElementById('jadwal-durasi').value);
    const jamMulai = document.getElementById('jadwal-jam-mulai').value;
    const jamSelesai = document.getElementById('jadwal-jam-selesai').value;

    const client = await DB.getClient();
    if (client) {
      try {
        const { error } = await client.from('jadwal_ujian').insert([{
          mapel, kelas, tanggal, durasi, jam_mulai: jamMulai, jam_selesai: jamSelesai
        }]);
        if (error) throw error;
        alert("Jadwal Ujian berhasil disimpan ke Supabase!");
        await this.loadAndRender();
      } catch (err) {
        alert("Gagal menyimpan jadwal: " + err.message);
      }
    }
  },

  renderJadwalList() {
    const container = document.getElementById('jadwal-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (!State.schedules || State.schedules.length === 0) {
      container.innerHTML = `<p class="text-xs text-amber-600 italic p-3 text-center border rounded bg-amber-50">Belum ada jadwal ujian yang dikonfigurasi di Supabase.</p>`;
      return;
    }

    State.schedules.forEach((j, idx) => {
      const card = document.createElement('div');
      card.className = "flex justify-between items-center p-3 border rounded bg-gray-50 text-xs shadow-sm mb-2";
      card.innerHTML = `
        <div>
          <strong class="text-purple-900 block">[${j.kelas}] ${j.mapel || j.NAMA_MAPEL}</strong>
          <span class="text-[11px] text-gray-600">Tanggal: ${j.tanggal} | Waktu: ${j.jam_mulai || j.jamMulai} - ${j.jam_selesai || j.jamSelesai} (${j.durasi} Menit)</span>
        </div>
        <button onclick="JadwalModule.deleteJadwal(${j.id || idx})" class="bg-red-600 text-white px-2.5 py-1 rounded font-bold text-[10px]">Hapus</button>
      `;
      container.appendChild(card);
    });
  },

  async deleteJadwal(id) {
    if (!confirm("Hapus jadwal ujian ini?")) return;
    const client = await DB.getClient();
    if (client) {
      await client.from('jadwal_ujian').delete().eq('id', id);
      await this.loadAndRender();
    }
  }
};

window.JadwalModule = JadwalModule;
