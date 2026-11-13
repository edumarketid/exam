const GuruModule = {
  guruList: [],

  // --- PARSER PASANGAN (MAPEL + KELAS) DARI PROFIL GURU ---
  // Mendukung format baru: "Mapel A (X TKJ 1), Mapel B (XI TKJ 2)"
  // Maupun format lama: mapel_diampu="Mapel A, Mapel B" & kelas_diampu="X TKJ 1, XI TKJ 2"
  getGuruPairs(user = State.currentUser) {
    if (!user || user.role !== 'guru') return [];

    const rawMapel = String(user.mapel_diampu || '').trim();
    const rawKelas = String(user.kelas_diampu || '').trim();

    if (!rawMapel || rawMapel === '-') return [];

    const pairs = [];
    const mapelTokens = rawMapel.split(',').map(s => s.trim()).filter(Boolean);

    const legacyKelasList = (!rawKelas || rawKelas === '-' || rawKelas.toUpperCase() === 'ALL')
      ? []
      : rawKelas.split(',').map(k => k.trim()).filter(Boolean);

    mapelTokens.forEach(token => {
      // Cek apakah formatnya "Nama Mapel (Nama Kelas)"
      const match = token.match(/^(.+?)\s*\(([^()]+)\)$/);
      if (match) {
        pairs.push({
          mapel: match[1].trim(),
          kelas: match[2].trim()
        });
      } else {
        // Fallback format lama
        if (legacyKelasList.length > 0) {
          legacyKelasList.forEach(k => {
            pairs.push({ mapel: token, kelas: k });
          });
        } else {
          pairs.push({ mapel: token, kelas: '*' });
        }
      }
    });

    return pairs;
  },

  canAccess(targetMapel, targetKelas = null) {
    if (!State.currentUser || State.currentUser.role !== 'guru') return true;

    const pairs = this.getGuruPairs(State.currentUser);
    if (pairs.length === 0) return false;

    const mUpper = String(targetMapel || '').trim().toUpperCase();
    if (!mUpper) return false;

    // Jika targetKelas tidak disertakan (misal filter daftar mapel saja)
    if (!targetKelas) {
      return pairs.some(p => p.mapel.toUpperCase() === mUpper);
    }

    // Jika targetKelas berupa string dipisah koma (misal "X TKJ 1, X TKJ 2")
    const targetKelasList = String(targetKelas)
      .split(',')
      .map(k => k.trim().toUpperCase())
      .filter(Boolean);

    if (targetKelasList.length === 0) {
      return pairs.some(p => p.mapel.toUpperCase() === mUpper);
    }

    return pairs.some(p => {
      const matchM = p.mapel.toUpperCase() === mUpper;
      const matchK = p.kelas === '*' || targetKelasList.includes(p.kelas.toUpperCase());
      return matchM && matchK;
    });
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

  getAvailableOptions() {
    const mapelSet = new Set(State.mapelList || []);
    if (State.questions) {
      State.questions.forEach(q => { if (q.mapel) mapelSet.add(String(q.mapel).trim()); });
    }
    if (this.guruList) {
      this.guruList.forEach(g => {
        if (g.mapel_diampu && g.mapel_diampu !== '-') {
          String(g.mapel_diampu).split(',').forEach(token => {
            const m = token.replace(/\s*\([^()]+\)$/, '').trim();
            if (m && m !== '-') mapelSet.add(m);
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

  renderChecklistInputs() {
    const { mapels, kelas } = this.getAvailableOptions();

    this.mountPairChecklist('guru-mapel', 'guru-kelas', 'add-pair', mapels, kelas);
    this.mountPairChecklist('edit-guru-mapel', 'edit-guru-kelas', 'edit-pair', mapels, kelas);
  },

  mountPairChecklist(mapelId, kelasId, groupName, mapels, kelasList) {
    const mapelEl = document.getElementById(mapelId);
    const kelasEl = document.getElementById(kelasId);
    if (!mapelEl) return;

    mapelEl.classList.add('hidden');
    mapelEl.removeAttribute('required');

    // Sembunyikan input kelas lama karena sudah digabung menjadi pasangan (Mapel + Kelas)
    if (kelasEl && kelasEl.parentElement) {
      kelasEl.parentElement.classList.add('hidden');
    }

    // Perluas kolom wadah mapel agar matriks pasangan lebih lega dibaca
    if (mapelEl.parentElement) {
      mapelEl.parentElement.classList.add('md:col-span-2');
    }

    const boxId = `${mapelId}-checklist-box`;
    let boxEl = document.getElementById(boxId);
    if (!boxEl) {
      boxEl = document.createElement('div');
      boxEl.id = boxId;
      mapelEl.parentNode.insertBefore(boxEl, mapelEl.nextSibling);
    }

    if (mapels.length === 0 || kelasList.length === 0) {
      boxEl.innerHTML = `<div class="p-2.5 text-[11px] text-slate-400 italic border rounded-lg bg-slate-50">Pastikan data Mapel dan data Kelas di tabel Siswa sudah terisi.</div>`;
      return;
    }

    let rowsHtml = '';
    mapels.forEach(m => {
      const kelasChecks = kelasList.map(k => {
        const pairVal = `${m} (${k})`;
        return `
          <label class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 cursor-pointer text-[11px] text-slate-700 select-none">
            <input type="checkbox" name="chk-${groupName}" value="${pairVal}" data-mapel="${m}" data-kelas="${k}" class="rounded text-blue-600 focus:ring-blue-500">
            <span class="font-semibold">${k}</span>
          </label>
        `;
      }).join('');

      rowsHtml += `
        <div class="p-2 border-b border-slate-100 last:border-b-0">
          <div class="font-bold text-xs text-ocean-900 mb-1.5">${m}</div>
          <div class="flex flex-wrap gap-1.5">${kelasChecks}</div>
        </div>
      `;
    });

    boxEl.innerHTML = `
      <div class="border border-slate-300 rounded-xl bg-white overflow-hidden">
        <div class="flex items-center justify-between px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600">
          <span>Centang pasangan Mapel & Kelas yang diampu (kosongkan jika hanya Pengawas)</span>
          <button type="button" onclick="GuruModule.toggleChecklistGroup('${groupName}', false)" class="text-rose-600 hover:underline">Reset Pilihan</button>
        </div>
        <div class="max-h-48 overflow-y-auto divide-y divide-slate-100">
          ${rowsHtml}
        </div>
      </div>
    `;
  },

  toggleChecklistGroup(groupName, checked) {
    document.querySelectorAll(`input[name="chk-${groupName}"]`).forEach(cb => {
      cb.checked = checked;
    });
  },

  getCheckedPairPayload(groupName) {
    const checkedNodes = Array.from(document.querySelectorAll(`input[name="chk-${groupName}"]:checked`));
    if (checkedNodes.length === 0) {
      return { mapel_diampu: '-', kelas_diampu: '-' };
    }

    const pairStrings = checkedNodes.map(cb => cb.value.trim());
    const uniqueKelas = [...new Set(checkedNodes.map(cb => cb.getAttribute('data-kelas').trim()))];

    return {
      mapel_diampu: pairStrings.join(', '),
      kelas_diampu: uniqueKelas.join(', ')
    };
  },

  setCheckedPairsFromGuru(groupName, guruObj) {
    this.toggleChecklistGroup(groupName, false);
    const pairs = this.getGuruPairs(guruObj);
    if (pairs.length === 0) return;

    document.querySelectorAll(`input[name="chk-${groupName}"]`).forEach(cb => {
      const m = cb.getAttribute('data-mapel').trim().toUpperCase();
      const k = cb.getAttribute('data-kelas').trim().toUpperCase();
      cb.checked = pairs.some(p => p.mapel.toUpperCase() === m && (p.kelas === '*' || p.kelas.toUpperCase() === k));
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
            <th class="p-3">Pasangan Mapel & Kelas Diampu</th>
            <th class="p-3 text-center">Status</th>
            <th class="p-3 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
    `;

    this.guruList.forEach((g, idx) => {
      const isAktif = String(g.status).toLowerCase() === 'aktif';
      const safeNama = String(g.nama_guru).replace(/'/g, "\\'");

      const pairBadges = String(g.mapel_diampu || '-')
        .split(',')
        .map(m => m.trim())
        .filter(Boolean)
        .map(m => `<span class="inline-block bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-semibold mr-1 mb-1">${m}</span>`)
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
            <div>${pairBadges}</div>
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
    const jabatan = document.getElementById('guru-jabatan').value;
    const kepegawaian = document.getElementById('guru-kepegawaian').value;
    const pairData = this.getCheckedPairPayload('add-pair');

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
      mapel_diampu: pairData.mapel_diampu,
      kelas_diampu: pairData.kelas_diampu,
      status_kepegawaian: kepegawaian,
      status: 'Aktif'
    };

    try {
      await DB.insertGuru(payload);
      alert(`Berhasil menambahkan akun Guru/Pengawas:\n${nama}\nAmpuan: ${pairData.mapel_diampu}`);
      document.getElementById('form-tambah-guru').reset();
      document.getElementById('guru-password').value = 'guru123';
      this.toggleChecklistGroup('add-pair', false);
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

    this.setCheckedPairsFromGuru('edit-pair', { ...g, role: 'guru' });

    document.getElementById('modal-edit-guru').classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('modal-edit-guru').classList.add('hidden');
  },

  async saveEditedGuru(e) {
    e.preventDefault();
    const idGuru = parseInt(document.getElementById('edit-guru-id').value);
    const pairData = this.getCheckedPairPayload('edit-pair');

    const payload = {
      nama_guru: document.getElementById('edit-guru-nama').value.trim(),
      nip: document.getElementById('edit-guru-nip').value.trim() || '-',
      no_hp: document.getElementById('edit-guru-hp').value.trim(),
      password: document.getElementById('edit-guru-password').value.trim(),
      status: document.getElementById('edit-guru-status').value,
      mapel_diampu: pairData.mapel_diampu,
      jabatan: document.getElementById('edit-guru-jabatan').value.trim(),
      kelas_diampu: pairData.kelas_diampu
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
