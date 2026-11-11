const JadwalModule = {
  async loadAndRender() {
    try {
      console.log("[JadwalModule] Menarik data jadwal dari Supabase...");
      State.schedules = await DB.fetchSchedules();
      console.log("[JadwalModule] Data jadwal diterima:", State.schedules.length, "entri");
      
      this.populateJadwalForm();
      this.renderJadwalList();
    } catch (err) {
      console.error("[JadwalModule] Error:", err.message);
    }
  },

  populateJadwalForm() {
    const selectMapel = document.getElementById('jadwal-mapel');
    const containerKelas = document.getElementById('container-jadwal-kelas-checkboxes');

    // Populasikan Dropdown Mapel dari State
    if (selectMapel && State.mapelList && State.mapelList.length > 0) {
      selectMapel.innerHTML = State.mapelList.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    // Populasikan Checkbox Multi-Kelas Target dari State
    if (containerKelas) {
      if (State.kelasOptions && State.kelasOptions.length > 0) {
        containerKelas.innerHTML = State.kelasOptions.map(k => `
          <label class="flex items-center gap-2 text-xs font-medium cursor-pointer bg-white p-2 border rounded hover:bg-purple-100 transition shadow-sm">
            <input type="checkbox" name="jadwal-kelas-target" value="${k}" class="rounded text-purple-700 focus:ring-purple-500">
            <span class="font-bold text-gray-800">${k}</span>
          </label>
        `).join('');
      } else {
        containerKelas.innerHTML = `<p class="text-xs text-purple-600 italic col-span-full">Belum ada data kelas (Data siswa belum dimuat).</p>`;
      }
    }
  },

  toggleSelectAllKelasJadwal(checked) {
    const checkboxes = document.querySelectorAll('input[name="jadwal-kelas-target"]');
    checkboxes.forEach(cb => cb.checked = checked);
  },

  async saveJadwalUjian(e) {
    e.preventDefault();
    const mapel = document.getElementById('jadwal-mapel')?.value;
    const selectedKelasNodes = document.querySelectorAll('input[name="jadwal-kelas-target"]:checked');
    const selectedKelasList = Array.from(selectedKelasNodes).map(cb => cb.value);

    const tanggal = document.getElementById('jadwal-tanggal')?.value;
    const durasi = parseInt(document.getElementById('jadwal-durasi')?.value || 45);
    const jamMulai = document.getElementById('jadwal-jam-mulai')?.value;
    const jamSelesai = document.getElementById('jadwal-jam-selesai')?.value;

    if (!mapel) {
      alert("Silakan pilih Mata Pelajaran!");
      return;
    }

    if (selectedKelasList.length === 0) {
      alert("Silakan centang/pilih minimal 1 Kelas Target!");
      return;
    }

    if (!tanggal || !jamMulai || !jamSelesai) {
      alert("Mohon lengkapi Tanggal, Jam Mulai, dan Jam Selesai!");
      return;
    }

    // Buat objek payload array untuk setiap kelas yang dicentang
    const payloadJadwal = selectedKelasList.map(kelasTarget => ({
      mapel: mapel,
      kelas: kelasTarget,
      tanggal: tanggal,
      durasi: durasi,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai
    }));

    const client = await DB.getClient();
    if (client) {
      try {
        const { error } = await client.from('jadwal_ujian').insert(payloadJadwal);
        if (error) throw error;

        alert(`Berhasil mengaktifkan Jadwal Ujian ${mapel} untuk ${selectedKelasList.length} kelas target!\n\nKelas Target: ${selectedKelasList.join(', ')}`);
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
          Belum ada jadwal ujian yang aktif di Supabase. Silakan pilih mapel dan centang kelas target di atas.
        </div>`;
      return;
    }

    list.forEach((j, idx) => {
      const card = document.createElement('div');
      card.className = "flex justify-between items-center p-3 border rounded-lg bg-purple-50 text-xs shadow-sm mb-2 transition hover:bg-purple-100";
      card.innerHTML = `
        <div>
          <span class="font-bold text-purple-900 block text-sm">[Kelas: ${j.kelas}] ${j.mapel}</span>
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
