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

  canAccess(targetMapel, targetKelas = null) {
    const access = this.getGuruAccess();
    if (!access.isGuru) return true;

    let mapelMatch = true;
    if (access.mapelList.length > 0 && targetMapel) {
      const mUpper = String(targetMapel).trim().toUpperCase();
      mapelMatch = access.mapelList.some(m => m === mUpper || mUpper.includes(m) || m.includes(mUpper));
    } else if (access.mapelList.length === 0) {
      mapelMatch = false;
    }

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
      if (!State.siswaList || State.siswaList.length === 0) {
        State.siswaList = await DB.fetchSiswa();
      }

      this.guruList = await DB.fetchGuru();
      this.renderChecklistInputs();
      this.renderTable();
    } catch (err) {
      console.error("[GuruModule] Error memuat data guru:", err.message);
    }
  },

  // --- KUMPULKAN DAFTAR UNIK MAPEL & KELAS DARI DATABASE ---
  getAvailableOptions() {
    const mapelSet = new Set(State.mapelList || []);
    if (State.questions) {
      State.questions.forEach(q => { if (q.mapel) mapelSet.add(String(q.mapel).trim()); });
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

    const kelasSet = new Set();
    if (State.siswaList) {
      State.siswaList.forEach(s => {
        if (s.kelas && String(s.kelas).trim() !== '-') {
          kelasSet.add(String(s.kelas).trim());
        }
      });
    }
    if (this.guruList) {
      this.guruList.forEach(g => {
        if (g.kelas_diampu && g.kelas_diampu !== '-') {
          String(g.kelas_diampu).split(',').forEach(k => {
            if (k.trim()) kelasSet.add(k.trim());
          });
        }
      });
    }

    return {
      mapels: Array.from(mapelSet).filter(Boolean).sort(),
      kelas: Array.from(kelasSet).filter(Boolean).sort()
    };
  },

  // --- UBAH INPUT MAPEL & KELAS MENJADI DAFTAR CENTANG (CHECKBOX) ---
  renderChecklistInputs() {
    const { mapels, kelas } = this.getAvailableOptions();

    this.mountChecklistContainer('guru-mapel', 'add-mapel', mapels, 'Belum ada data mapel');
    this.mountChecklistContainer('guru-kelas', 'add-kelas', kelas, 'Belum ada data kelas di tabel siswa');
    this.mountChecklistContainer('edit-guru-mapel', 'edit-mapel', mapels, 'Belum ada data mapel');
    this.mountChecklistContainer('edit-guru-kelas', 'edit-kelas', kelas, 'Belum ada data kelas di tabel siswa');
  },

  mountChecklistContainer(originalId, groupName, items, emptyText) {
    const origEl = document.getElementById(originalId);
    if (!origEl) return;

    // Sembunyikan input/select asli & hilangkan atribut required agar tidak memblokir submit
    origEl.classList.add('hidden');
    origEl.removeAttribute('required');

    const boxId = `${originalId}-checklist-box`;
    let boxEl = document.getElementById(boxId);
    if (!boxEl) {
      boxEl = document.createElement('div');
      boxEl.id = boxId;
      origEl.parentNode.insertBefore(boxEl, origEl.nextSibling);
    }

    if (items.length === 0) {
      boxEl.innerHTML = `<div class="p-2.5 text-[11px] text-slate-400 italic border rounded-lg bg-slate-50">${emptyText}</div>`;
      return;
    }

    const itemsHtml = items.map(item => `
      <label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-blue-50 cursor-pointer text-xs text-slate-700 select-none">
        <input type="checkbox" name="chk-${groupName}" value="${item}" class="rounded text-blue-600 focus:ring-blue-500">
        <span class="truncate" title="${item}">${item}</span>
      </label>
    `).join('');

    boxEl.innerHTML = `
      <div class="border border-slate-300 rounded-xl bg-white overflow-hidden">
        <div class="flex items-center justify-between px-2.5 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600">
          <span>Centang pilihan (boleh lebih dari 1)</span>
          <div class="space-x-2">
            <button type="button" onclick="GuruModule.toggleChecklistGroup('${groupName}', true)" class="text-blue-700 hover:underline">Pilih Semua</button>
            <span>|</span>
            <button type="button" onclick="GuruModule.toggleChecklistGroup('${groupName}', false)" class="text-rose-600 hover:underline">Reset</button>
          </div>
        </div>
        <div class="max-h-32 overflow-y-auto p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1">
          ${itemsHtml}
        </div>
      </div>
    `;
  },

  toggleChecklistGroup(groupName, checked) {
    document.querySelectorAll(`input[name="chk-${groupName}"]`).forEach(cb => {
      cb.checked = checked;
    });
  },

  getCheckedValuesString(groupName) {
    const checkedNodes = document.querySelectorAll(`input[name="chk-${groupName}"]:checked`);
    const values = Array.from(checkedNodes).map(cb => cb.value.trim()).filter(Boolean);
    return values.length > 0 ? values.join(', ') : '-';
  },

  setCheckedValues(groupName, commaSeparatedStr) {
    const selectedList = String(commaSeparatedStr || '-')
      .split(',')
      .map(v => v.trim().toUpperCase())
      .filter(v => v && v !== '-');

    document.querySelectorAll(`input[name="chk-${groupName}"]`).forEach(cb => {
      cb.checked = selectedList.includes(cb.value.trim().toUpperCase());
    });
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
        .map(k => `<span class="inline-block bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 mb-1">${k}</span>`)
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
    const mapel = this.getCheckedValuesString('add-mapel');
    const jabatan = document.getElementById('guru-jabatan').value;
    const kelas = this.getCheckedValuesString('add-kelas');
    const kepegawaian = document.getElementById('guru-kepegawaian').value;

    if (!nama || !noHp) {
      alert("Nama Guru dan No. HP wajib diisi!");
      return;
    }

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
      this.toggleChecklistGroup('add-mapel', false);
      this.toggleChecklistGroup('add-kelas', false);
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

    // Otomatis centang mapel dan kelas sesuai data guru yang diedit
    this.setCheckedValues('edit-mapel', g.mapel_diampu);
    this.setCheckedValues('edit-kelas', g.kelas_diampu);

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
      mapel_diampu: this.getCheckedValuesString('edit-mapel'),
      jabatan: document.getElementById('edit-guru-jabatan').value.trim(),
      kelas_diampu: this.getCheckedValuesString('edit-kelas')
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
