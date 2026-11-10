const JadwalModule = {
  saveJadwalUjian(e) {
    e.preventDefault();
    const mapel = document.getElementById('jadwal-mapel').value;
    const kelas = document.getElementById('jadwal-kelas').value;
    const tanggal = document.getElementById('jadwal-tanggal').value;
    const durasi = parseInt(document.getElementById('jadwal-durasi').value);
    const jamMulai = document.getElementById('jadwal-jam-mulai').value;
    const jamSelesai = document.getElementById('jadwal-jam-selesai').value;

    const newJadwal = { id: Date.now(), mapel, kelas, tanggal, durasi, jamMulai, jamSelesai };
    State.jadwalList.push(newJadwal);
    localStorage.setItem('EXAM_JADWAL_LIST', JSON.stringify(State.jadwalList));

    alert("Jadwal Ujian berhasil disimpan & diaktifkan!");
    this.renderJadwalList();
  },

  renderJadwalList() {
    const container = document.getElementById('jadwal-list');
    if (!container) return;
    container.innerHTML = '';

    if (State.jadwalList.length === 0) {
      container.innerHTML = `<p class="text-xs text-gray-500 italic">Belum ada jadwal ujian yang dikonfigurasi.</p>`;
      return;
    }

    State.jadwalList.forEach((j, idx) => {
      const item = document.createElement('div');
      item.className = "flex justify-between items-center p-3 border rounded-lg bg-purple-50 text-xs";
      item.innerHTML = `
        <div>
          <span class="font-bold text-purple-900">[${j.kelas}] ${j.mapel}</span>
          <div class="text-gray-600 mt-0.5">Tanggal: <strong>${j.tanggal}</strong> | Jam: <strong>${j.jamMulai} - ${j.jamSelesai}</strong> (${j.durasi} Menit)</div>
        </div>
        <button onclick="JadwalModule.deleteJadwal(${idx})" class="bg-red-600 text-white px-2.5 py-1 rounded font-semibold text-[10px]">Hapus</button>
      `;
      container.appendChild(item);
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
