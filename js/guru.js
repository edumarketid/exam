const GuruModule = {
  guruList: [],

  // --- HELPER: CEK HAK AKSES MAPEL & KELAS GURU YANG SEDANG LOGIN ---
  getGuruAccess(user = State.currentUser) {
    if (!user || user.role !== 'guru') {
      return { isGuru: false, mapelList: [], kelasList: [] };
    }

    const rawMapel = String(user.mapel_diampu || '').trim();
    const rawKelas = String(user.kelas_diampu || '').trim();

    const mapelList = (!rawMapel || rawMapel === '-' || rawMapel.toUpperCase() === 'ALL')
      ? []
      : rawMapel.split(',').map(m => m.trim().toUpperCase()).filter(Boolean);

    const kelasList = (!rawKelas || rawKelas === '-' || rawKelas.toUpperCase() === 'ALL')
      ? []
      : rawKelas.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);

    return {
      isGuru: true,
      mapelList,
      kelasList
    };
  },

  // Mengembalikan true jika admin, atau jika mapel & kelas cocok dengan yang diampu guru
  canAccess(targetMapel, targetKelas = null) {
    const access = this.getGuruAccess();
    if (!access.isGuru) return true; // Admin/Proktor bebas akses semua

    // 1. Cek Kecocokan Mapel (jika guru punya daftar mapel)
    let mapelMatch = true;
    if (access.mapelList.length > 0 && targetMapel) {
      const mUpper = String(targetMapel).trim().toUpperCase();
      mapelMatch = access.mapelList.some(m => m === mUpper || mUpper.includes(m) || m.includes(mUpper));
    } else if (access.mapelList.length === 0) {
      // Jika mapel '-' (Pengawas saja), tidak punya akses khusus mapel kecuali pengawasan
      mapelMatch = false;
    }

    // 2. Cek Kecocokan Kelas (jika targetKelas diberikan dan guru punya daftar kelas spesifik)
    let kelasMatch = true;
    if (targetKelas && access.kelasList.length > 0) {
      const kUpper = String(targetKelas).trim().toUpperCase();
      kelasMatch = access.kelasList.some(k => k === kUpper);
    }

    return mapelMatch && kelasMatch;
  },

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
    if (this.guruList) {
      this.guruList.forEach(g => {
        if (g.mapel_diampu && g.mapel_diampu !== '-') {
          String(g.mapel_diampu).split(',').forEach(m => {
            if (m.trim()) mapelSet.add(m.trim());
          });
        }
      });
    }

    let optionsHtml = `<option value="-">-- Umum / Pengawas Saja --</option>`;
    Array.from(mapelSet).sort().forEach(m => {
      optionsHtml += `<option value="${m}">${m}</option>`;
    });

    if (selectAdd) {
      selectAdd.multiple = true;
      selectAdd.size = Math.min(5, Math.max(3, mapelSet.size + 1));
      selectAdd.title = "Tahan tombol Ctrl (Windows) atau Cmd (Mac) untuk memilih lebih dari 1 mapel";
      selectAdd.innerHTML = optionsHtml;
    }
    if (selectEdit) {
      selectEdit.multiple = true;
      selectEdit.size = Math.min(5, Math.max(3, mapelSet.size + 1));
      selectEdit.title = "Tahan tombol Ctrl (Windows) atau Cmd (Mac) untuk memilih lebih dari 1 mapel";
      selectEdit.innerHTML = optionsHtml;
    }
  },

  getSelectedMapelString(selectElement) {
    if (!selectElement) return '-';
    if (selectElement.multiple) {
      const selected = Array.from(selectElement.selectedOptions)
        .map(opt => opt.value.trim())
        .filter(val => val !== '' && val !== '-');
      return selected.length > 0 ? selected.join(', ') : '-';
    }
    return selectElement.value || '-';
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

      // Tampilkan badge per mapel & per kelas agar rapi jika lebih dari 1
      const mapelBadges = String(g.mapel_diampu || '-')
        .split(',')
        .map(m => m.trim())
        .filter(Boolean)
        .map(m => `<span class="inline-block bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 mb-1">${m}</span>`)
        .join('');

      const kelasBadges = String(g.kelas_diampu || '-')
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
        .map(k => `<span class="inline-block bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1">${k}</span>`)
        .join('');

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
            <div class="mb-1">${mapelBadges}</div>
            <div class="text-[10px] text-slate-500">Kelas: ${kelasBadges}</div>
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
    const mapel = this.getSelectedMapelString(document.getElementById('guru-mapel'));
    const jabatan = document.getElementById('guru-jabatan').value;
    // Rapikan format koma pada input kelas (misal: "XI TKJ 1, XI TKJ 2")
    const rawKelas = document.getElementById('guru-kelas').value.trim();
    const kelas = rawKelas
      ? rawKelas.split(',').map(k => k.trim()).filter(Boolean).join(', ')
      : '-';
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
      alert(`Berhasil menambahkan akun Guru/Pengawas:\n${nama}\nMapel: ${mapel}\nKelas: ${kelas}`);
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
    document.getElementById('edit-guru-jabatan').value = g.jabatan;
    document.getElementById('edit-guru-kelas').value = g.kelas_diampu;

    // Tandai semua mapel yang diampu pada multiple select
    const selectEdit = document.getElementById('edit-guru-mapel');
    if (selectEdit) {
      const currentMapels = String(g.mapel_diampu || '-')
        .split(',')
        .map(m => m.trim().toUpperCase())
        .filter(Boolean);

      Array.from(selectEdit.options).forEach(opt => {
        opt.selected = currentMapels.includes(opt.value.trim().toUpperCase());
      });
    }

    document.getElementById('modal-edit-guru').classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('modal-edit-guru').classList.add('hidden');
  },

  async saveEditedGuru(e) {
    e.preventDefault();
    const idGuru = parseInt(document.getElementById('edit-guru-id').value);

    const rawKelas = document.getElementById('edit-guru-kelas').value.trim();
    const kelasFix = rawKelas
      ? rawKelas.split(',').map(k => k.trim()).filter(Boolean).join(', ')
      : '-';

    const payload = {
      nama_guru: document.getElementById('edit-guru-nama').value.trim(),
      nip: document.getElementById('edit-guru-nip').value.trim() || '-',
      no_hp: document.getElementById('edit-guru-hp').value.trim(),
      password: document.getElementById('edit-guru-password').value.trim(),
      status: document.getElementById('edit-guru-status').value,
      mapel_diampu: this.getSelectedMapelString(document.getElementById('edit-guru-mapel')),
      jabatan: document.getElementById('edit-guru-jabatan').value.trim(),
      kelas_diampu: kelasFix
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
