const JadwalModule = {
  async loadAndRender() {
    try {
      console.log("[JadwalModule] Menarik data jadwal dari Supabase...");
      State.schedules = await DB.fetchSchedules();
      this.renderJadwalList();
    } catch (err) {
      console.error("[JadwalModule] Error:", err.message);
    }
  },

  renderJadwalList() {
    const container = document.getElementById('jadwal-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (!State.schedules || State.schedules.length === 0) {
      container.innerHTML = `<p class="text-xs text-amber-600 italic p-3 text-center border rounded">Belum ada jadwal ujian yang dibuat.</p>`;
      return;
    }

    State.schedules.forEach((j, idx) => {
      const card = document.createElement('div');
      card.className = "flex justify-between items-center p-3 border rounded bg-gray-50 text-xs shadow-sm mb-2";
      card.innerHTML = `
        <div>
          <strong class="text-blue-900 block">${j.mapel || j.NAMA_MAPEL}</strong>
          <span class="text-[11px] text-gray-600">Kelas: ${j.kelas} | Durasi: ${j.durasi || 45} Menit</span>
        </div>
        <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold text-[10px]">Aktif</span>
      `;
      container.appendChild(card);
    });
  }
};

window.JadwalModule = JadwalModule;

    });
  },

  deleteJadwal(idx) {
    if (confirm("Hapus jadwal ujian ini?")) {
      State.jadwalList.splice(idx, 1);
      localStorage.setItem('EXAM_JADWAL_LIST', JSON.stringify(State.jadwalList));
      this.renderJadwalList();
    }
  },

  validateJadwalSiswa(siswaKelas) {
    if (State.jadwalList.length === 0) return true;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${yyyy}-${mm}-${dd}`;
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return State.jadwalList.find(j => {
      return j.kelas === siswaKelas &&
             j.tanggal === currentDateStr &&
             currentTimeStr >= j.jamMulai &&
             currentTimeStr <= j.jamSelesai;
    });
  }
};
