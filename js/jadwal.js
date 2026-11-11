const JadwalModule = {
  async loadAndRender() {
    try {
      console.log("[JadwalModule] Memuat data jadwal ujian & kelas target...");
      
      // 1. Pastikan data mapel & siswa sudah dimuat ke State
      if (!State.mapelList || State.mapelList.length === 0) {
        State.mapelList = await DB.fetchMapel();
      }
      if (!State.siswaList || State.siswaList.length === 0) {
        State.siswaList = await DB.fetchSiswa();
      }

      // 2. Fetch jadwal dari Supabase
      State.schedules = await DB.fetchSchedules();

      // 3. Populate dropdown mapel & checkbox kelas target
      this.renderMapelDropdown();
      this.renderKelasCheckboxes();
      this.renderJadwalList();

    } catch (err) {
      console.error("[JadwalModule] Error load jadwal:", err.message);
    }
  },

  renderMapelDropdown() {
    const selectMapel = document.getElementById('jadwal-mapel');
    if (!selectMapel) return;

    let html = `<option value="">-- Pilih Mata Pelajaran --</option>`;
    
    // Ambil gabungan mapel dari tabel mapel & bank soal
    const mapelSet = new Set(State.mapelList || []);
    if (State.questions) {
      State.questions.forEach(q => { if (q.mapel) mapelSet.add(q.mapel); });
    }

    // PRIVILEGE FILTER: Jika login sebagai GURU, tampilkan hanya mapel diampunya
    if (State.currentUser && State.currentUser.role === 'guru') {
      const mapelGuru = String(State.currentUser.mapel_diampu || '').trim().toUpperCase();
      Array.from(mapelSet).forEach(m => {
        if (String(m).trim().toUpperCase().includes(mapelGuru) || mapelGuru.includes(String(m).trim().toUpperCase())) {
          html += `<option value="${m}">${m}</option>`;
        }
      });
    } else {
      // Admin dapat melihat seluruh mapel
      Array.from(mapelSet).forEach(m => {
        html += `<option value="${m}">${m}</option>`;
      });
    }

    selectMapel.innerHTML = html;
  },

  renderKelasCheckboxes() {
    const container = document.getElementById('container-jadwal-kelas-checkboxes');
    if (!container) return;

    // Ekstrak daftar kelas unik dari data siswa & bank soal
    const kelasSet = new Set();

    if (State.siswaList && State.siswaList.length > 0) {
      State.siswaList.forEach(s => {
        if (s.kelas && s.kelas !== '-') kelasSet.add(String(s.kelas).trim());
      });
    }

    if (State.questions && State.questions.length > 0) {
      State.questions.forEach(q => {
        if (q.kelas && q.kelas !== '-') {
          const splitK = String(q.kelas).split(',');
          splitK.forEach(k => kelasSet.add(k.trim()));
        }
      });
    }

    const sortedKelas = Array.from(kelasSet).filter(Boolean).sort();

    if (sortedKelas.length === 0) {
      container.innerHTML = `
        <div class="col-span-4 p-2 text-center text-xs text-amber-700 bg-amber-50 rounded">
          Belum ada data kelas (Pastikan data siswa di Supabase terisi).
        </div>`;
      return;
    }

    let html = '';
    sortedKelas.forEach((k, idx) => {
      html += `
        <label class="flex items-center space-x-2 p-2 rounded hover:bg-purple-100/50 cursor-pointer text-xs font-semibold text-purple-950 border border-purple-100">
          <input type="checkbox" value="${k}" class="chk-jadwal-kelas rounded text-purple-700 focus:ring-purple-500">
          <span>${k}</span>
        </label>
      `;
    });

    container.innerHTML = html;
  },

  toggleSelectAllKelasJadwal(checked) {
    const checkboxes = document.querySelectorAll('.chk-jadwal-kelas');
    checkboxes.forEach(cb => cb.checked = checked);
  },

  renderJadwalList() {
    const container = document.getElementById('jadwal-list-container');
    if (!container) return;

    if (!State.schedules || State.schedules.length === 0) {
      container.innerHTML = `
        <div class="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border">
          Belum ada jadwal ujian yang diaktifkan.
        </div>`;
      return;
    }

    let html = '';
    State.schedules.forEach((j) => {
      html += `
        <div class="p-4 rounded-xl border bg-white shadow-sm flex flex-wrap justify-between items-center gap-3 hover:border-purple-300 transition">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="font-bold text-sm text-slate-800">${j.mapel}</span>
              <span class="bg-purple-100 text-purple-800 font-bold text-xs px-2.5 py-0.5 rounded-full border border-purple-200">
                Target: ${j.kelas}
              </span>
            </div>
            <div class="text-xs text-slate-500 flex items-center space-x-3">
              <span>📅 Tanggal: <strong>${j.tanggal}</strong></span>
              <span>⏰ Waktu: <strong>${j.jamMulai} - ${j.jamSelesai} WITA</strong> (${j.durasi} Menit)</span>
            </div>
          </div>

          <button onclick="JadwalModule.deleteJadwal(${j.id})" class="text-rose-600 hover:text-rose-800 font-bold text-xs bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition">
            🗑️ Hapus Jadwal
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  async saveJadwalUjian(e) {
    e.preventDefault();

    const mapel = document.getElementById('jadwal-mapel').value;
    const tanggal = document.getElementById('jadwal-tanggal').value;
    const durasi = parseInt(document.getElementById('jadwal-durasi').value) || 45;
    const jamMulai = document.getElementById('jadwal-jam-mulai').value;
    const jamSelesai = document.getElementById('jadwal-jam-selesai').value;

    const checkedNodes = document.querySelectorAll('.chk-jadwal-kelas:checked');
    const selectedKelas = Array.from(checkedNodes).map(cb => cb.value);

    if (!mapel) {
      alert("Silakan pilih Mata Pelajaran!");
      return;
    }

    if (selectedKelas.length === 0) {
      alert("Silakan centang minimal 1 Kelas Target!");
      return;
    }

    const payload = {
      mapel: mapel,
      kelas: selectedKelas.join(', '),
      tanggal: tanggal,
      durasi: durasi,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai
    };

    try {
      const client = await DB.getClient();
      const { data, error } = await client.from('jadwal_ujian').insert([payload]);
      if (error) throw error;

      alert(`Berhasil mengaktifkan jadwal ujian "${mapel}" untuk kelas (${selectedKelas.join(', ')})!`);
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal menyimpan jadwal ujian: " + err.message);
    }
  },

  async deleteJadwal(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus jadwal ujian ini?")) return;

    try {
      const client = await DB.getClient();
      const { error } = await client.from('jadwal_ujian').delete().eq('id', id);
      if (error) throw error;

      alert("Jadwal ujian berhasil dihapus!");
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal menghapus jadwal: " + err.message);
    }
  }
};

window.JadwalModule = JadwalModule;
