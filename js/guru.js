const GuruModule = {
  guruList: [],

  async loadAndRender() {
    try {
      console.log("[GuruModule] Memuat data guru & pengawas dari Supabase...");
      
      if (!State.mapelList || State.mapelList.length === 0) {
        State.mapelList = await DB.fetchMapel();
      }

      this.populateMapelDropdowns();
      this.guruList = await DB.fetchGuru();
      this.renderTable();
    } catch (err) {
      console.error("[GuruModule] Error memuat data guru:", err.message);
    }
  },

  populateMapelDropdowns() {
    const selectAdd = document.getElementById('guru-mapel');
    const selectEdit = document.getElementById('edit-guru-mapel');

    const mapelSet = new Set(State.mapelList || []);
    if (State.questions) {
      State.questions.forEach(q => { if (q.mapel) mapelSet.add(q.mapel); });
    }

    let optionsHtml = `<option value="-">-- Umum / Pengawas Saja --</option>`;
    Array.from(mapelSet).sort().forEach(m => {
      optionsHtml += `<option value="${m}">${m}</option>`;
    });

    if (selectAdd) selectAdd.innerHTML = `<option value="">-- Pilih Mata Pelajaran --</option>` + optionsHtml;
    if (selectEdit) selectEdit.innerHTML = optionsHtml;
  },

  renderTable() {
    const container = document.getElementById('guru-table-container');
    if (!container) return;

    if (!this.guruList || this.guruList.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
          <p class="font-bold">Belum ada data guru atau pengawas yang terdaftar.</p>
          <p class="mt-1 text-slate-500">Gunakan formulir di atas untuk menambahkan akun guru baru.</p>
        </div>`;
      return;
    }

    let html = `
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
            <th class="p-3 text-center">No</th>
            <th class="p-3">Nama Guru & NIP</th>
            <th class="p-3">No. HP / Login</th>
            <th class="p-3">Password</th>
            <th class="p-3">Mapel & Kelas Diampu</th>
            <th class="p-3 text-center">Status</th>
            <th class="p-3 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
    `;

    this.guruList.forEach((g, idx) => {
      const isAktif = String(g.status).toLowerCase() === 'aktif';
      const safeNama = String(g.nama_guru).replace(/'/g, "\\'");

      html += `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 text-center font-bold text-slate-500">${idx + 1}</td>
          <td class="p-3">
            <div class="font-bold text-slate-800">${g.nama_guru}</div>
            <div class="text-[10px] text-slate-500 font-mono">NIP: ${g.nip || '-'} • ${g.jabatan}</div>
          </td>
          <td class="p-3 font-mono font-bold text-ocean-800">${g.no_hp}</td>
          <td class="p-3 font-mono text-slate-600">${g.password}</td>
          <td class="p-3">
            <div class="font-semibold text-slate-800">${g.mapel_diampu}</div>
            <div class="text-[10px] text-purple-700 font-semibold">Kelas: ${g.kelas_diampu || '-'}</div>
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isAktif ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
              ${g.status}
            </span>
          </td>
          <td class="p-3 text-center space-x-1">
            <button onclick="GuruModule.openEditModal(${g.id_guru})" class="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-amber-300 transition">
              ✏️ Edit
            </button>
            <button onclick="GuruModule.deleteGuru(${g.id_guru}, '${safeNama}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-rose-300 transition">
              🗑️ Hapus
            </button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  },

  async saveNewGuru(e) {
    e.preventDefault();

    const nama = document.getElementById('guru-nama').value.trim();
    const nip = document.getElementById('guru-nip').value.trim() || '-';
    const noHp = document.getElementById('guru-hp').value.trim();
    const password = document.getElementById('guru-password').value.trim() || 'guru123';
    const mapel = document.getElementById('guru-mapel').value || '-';
    const jabatan = document.getElementById('guru-jabatan').value;
    const kelas = document.getElementById('guru-kelas').value.trim() || '-';
    const kepegawaian = document.getElementById('guru-kepegawaian').value;

    if (!nama || !noHp) {
      alert("Nama Guru dan No. HP wajib diisi!");
      return;
    }

    // Cek duplikasi No HP
    const exists = this.guruList.some(g => String(g.no_hp).trim() === noHp);
    if (exists) {
      alert(`Nomor HP "${noHp}" sudah terdaftar pada akun guru lain!`);
      return;
    }

    const payload = {
      nama_guru: nama,
      nip: nip,
      no_hp: noHp,
      password: password,
      jabatan: jabatan,
      mapel_diampu: mapel,
      kelas_diampu: kelas,
      status_kepegawaian: kepegawaian,
      status: 'Aktif'
    };

    try {
      await DB.insertGuru(payload);
      alert(`Berhasil menambahkan akun Guru/Pengawas:\n${nama} (Login: ${noHp} / Pass: ${password})`);
      document.getElementById('form-tambah-guru').reset();
      document.getElementById('guru-password').value = 'guru123';
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal menyimpan data guru: " + err.message);
    }
  },

  openEditModal(idGuru) {
    const g = this.guruList.find(item => item.id_guru === idGuru);
    if (!g) return;

    document.getElementById('edit-guru-id').value = g.id_guru;
    document.getElementById('edit-guru-nama').value = g.nama_guru;
    document.getElementById('edit-guru-nip').value = g.nip;
    document.getElementById('edit-guru-hp').value = g.no_hp;
    document.getElementById('edit-guru-password').value = g.password;
    document.getElementById('edit-guru-status').value = g.status;
    document.getElementById('edit-guru-mapel').value = g.mapel_diampu;
    document.getElementById('edit-guru-jabatan').value = g.jabatan;
    document.getElementById('edit-guru-kelas').value = g.kelas_diampu;

    document.getElementById('modal-edit-guru').classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('modal-edit-guru').classList.add('hidden');
  },

  async saveEditedGuru(e) {
    e.preventDefault();
    const idGuru = parseInt(document.getElementById('edit-guru-id').value);

    const payload = {
      nama_guru: document.getElementById('edit-guru-nama').value.trim(),
      nip: document.getElementById('edit-guru-nip').value.trim() || '-',
      no_hp: document.getElementById('edit-guru-hp').value.trim(),
      password: document.getElementById('edit-guru-password').value.trim(),
      status: document.getElementById('edit-guru-status').value,
      mapel_diampu: document.getElementById('edit-guru-mapel').value,
      jabatan: document.getElementById('edit-guru-jabatan').value.trim(),
      kelas_diampu: document.getElementById('edit-guru-kelas').value.trim() || '-'
    };

    try {
      await DB.updateGuru(idGuru, payload);
      alert("Data Guru & Pengawas berhasil diperbarui!");
      this.closeEditModal();
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal memperbarui data guru: " + err.message);
    }
  },

  async deleteGuru(idGuru, namaGuru) {
    if (!confirm(`Apakah Anda yakin ingin menghapus akun guru "${namaGuru}" secara permanen?`)) return;

    try {
      await DB.deleteGuru(idGuru);
      alert(`Akun guru "${namaGuru}" berhasil dihapus.`);
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal menghapus data guru: " + err.message);
    }
  }
};

window.GuruModule = GuruModule;
