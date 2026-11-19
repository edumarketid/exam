const JadwalModule = {
  lastGeneratedAllocation: [],
  lastMasterRooms: [],
  lastGuruCodeList: [],
  lastMapelCodeList: [],
  lastKepalaSekolah: { nama: '..................................................', nip: '............................................' },

  normalizeText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  getKopUrl() {
    if (typeof DB !== 'undefined' && typeof DB.getKopSekolahUrl === 'function') {
      return DB.getKopSekolahUrl();
    }
    return (typeof CONFIG !== 'undefined' && CONFIG.KOP_SEKOLAH_URL)
      ? CONFIG.KOP_SEKOLAH_URL
      : 'https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png';
  },

  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  extractKepalaSekolah(rawGuruList) {
    const list = Array.isArray(rawGuruList) ? rawGuruList : [];
    if (list.length === 0) {
      return {
        nama: '..................................................',
        nip: '............................................'
      };
    }

    const firstRow = list[0];
    const nama = String(firstRow.nama_guru || firstRow.nama || '').trim() || '..................................................';
    const rawNip = String(firstRow.nip || '').trim();
    const nip = (rawNip && rawNip !== '-') ? rawNip : '............................................';

    return { nama, nip };
  },

  getGuruPairs() {
    if (!State.currentUser || State.currentUser.role !== 'guru') return [];
    if (typeof GuruModule !== 'undefined' && typeof GuruModule.getGuruPairs === 'function') {
      return GuruModule.getGuruPairs(State.currentUser);
    }

    const rawMapel = String(State.currentUser.mapel_diampu || '').trim();
    const rawKelas = String(State.currentUser.kelas_diampu || '').trim();
    if (!rawMapel || rawMapel === '-') return [];

    const pairs = [];
    const legacyKelasList = (!rawKelas || rawKelas === '-' || rawKelas.toUpperCase() === 'ALL')
      ? []
      : rawKelas.split(',').map(k => k.trim()).filter(Boolean);

    rawMapel.split(',').map(s => s.trim()).filter(Boolean).forEach(token => {
      const match = token.match(/^(.+?)\s*\(([^()]+)\)$/);
      if (match) {
        pairs.push({ mapel: match[1].trim(), kelas: match[2].trim() });
      } else if (legacyKelasList.length > 0) {
        legacyKelasList.forEach(k => pairs.push({ mapel: token, kelas: k }));
      } else {
        pairs.push({ mapel: token, kelas: '*' });
      }
    });
    return pairs;
  },

  isPairAllowed(targetMapel, targetKelas = null) {
    if (!State.currentUser || State.currentUser.role !== 'guru') return true;
    const pairs = this.getGuruPairs();
    if (pairs.length === 0) return false;

    const mUpper = String(targetMapel || '').trim().toUpperCase();
    if (!targetKelas) {
      return pairs.some(p => p.mapel.toUpperCase() === mUpper);
    }

    const targetKelasList = String(targetKelas).split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
    return pairs.some(p => {
      const matchM = p.mapel.toUpperCase() === mUpper;
      const matchK = p.kelas === '*' || targetKelasList.includes(p.kelas.toUpperCase());
      return matchM && matchK;
    });
  },

  async loadAndRender() {
    try {
      if (typeof MapelModule !== 'undefined' && MapelModule.ensureMapelLoaded) {
        await MapelModule.ensureMapelLoaded();
      } else if (!State.mapelList || State.mapelList.length === 0) {
        State.mapelList = await DB.fetchMapel();
      }

      if (!State.siswaList || State.siswaList.length === 0) {
        State.siswaList = await DB.fetchSiswa();
      }

      State.schedules = await DB.fetchSchedules();

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

    const mapelList = (typeof MapelModule !== 'undefined' && MapelModule.getMapelListForCurrentUser)
      ? MapelModule.getMapelListForCurrentUser()
      : [...new Set((State.mapelList || []).map(m => String(m || '').trim()).filter(Boolean))].sort();

    mapelList.forEach(m => {
      html += `<option value="${m}">${m}</option>`;
    });

    selectMapel.innerHTML = html;
    selectMapel.onchange = () => this.renderKelasCheckboxes();
  },

  renderKelasCheckboxes() {
    const container = document.getElementById('container-jadwal-kelas-checkboxes');
    if (!container) return;

    const selectedMapel = (document.getElementById('jadwal-mapel')?.value || '').trim().toUpperCase();
    const kelasSet = new Set();

    if (State.currentUser && State.currentUser.role === 'guru') {
      const pairs = this.getGuruPairs();
      const relevantPairs = selectedMapel
        ? pairs.filter(p => p.mapel.toUpperCase() === selectedMapel)
        : pairs;

      relevantPairs.forEach(p => {
        if (p.kelas === '*') {
          (State.siswaList || []).forEach(s => { if (s.kelas && s.kelas !== '-') kelasSet.add(String(s.kelas).trim()); });
        } else {
          kelasSet.add(p.kelas);
        }
      });
    } else {
      if (State.siswaList && State.siswaList.length > 0) {
        State.siswaList.forEach(s => {
          if (s.kelas && s.kelas !== '-') kelasSet.add(String(s.kelas).trim());
        });
      }
      if (State.questions && State.questions.length > 0) {
        State.questions.forEach(q => {
          if (q.kelas && q.kelas !== '-') {
            String(q.kelas).split(',').forEach(k => kelasSet.add(k.trim()));
          }
        });
      }
    }

    const sortedKelas = Array.from(kelasSet).filter(Boolean).sort();

    if (sortedKelas.length === 0) {
      container.innerHTML = `
        <div class="col-span-4 p-2 text-center text-xs text-amber-700 bg-amber-50 rounded">
          Pilih Mata Pelajaran terlebih dahulu untuk melihat kelas target Anda.
        </div>`;
      return;
    }

    let html = '';
    sortedKelas.forEach((k) => {
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

    let listJadwal = State.schedules || [];
    if (State.currentUser && State.currentUser.role === 'guru') {
      listJadwal = listJadwal.filter(j => this.isPairAllowed(j.mapel, j.kelas));
    }

    if (listJadwal.length === 0) {
      container.innerHTML = `
        <div class="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border">
          Belum ada jadwal ujian aktif untuk pasangan mata pelajaran dan kelas Anda.
        </div>`;
      return;
    }

    const uniqueDates = [...new Set(listJadwal.map(j => String(j.tanggal || '').trim()).filter(Boolean))].sort();
    const dateOptionsHtml = uniqueDates
      .map(tgl => `<option value="${tgl}">${tgl}</option>`)
      .join('');

    let html = `
      <div class="p-3.5 mb-3 rounded-xl bg-ocean-50 border border-ocean-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-extrabold text-ocean-950">🖨️ Cetak Jadwal (Kode Guru & Mapel), Daftar Hadir Pengawas & Daftar Hadir Siswa</p>
          <p class="text-[11px] text-slate-600">Maks. 20 siswa/ruang &bull; 2 pengawas per ruang &bull; Daftar hadir pengawas dipisah per hari &amp; daftar hadir siswa otomatis terisi pengawas.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select id="filter-cetak-jadwal-tanggal" class="text-xs font-semibold border border-ocean-300 rounded-lg px-2.5 py-2 bg-white text-slate-800">
            <option value="ALL">Semua Tanggal (${uniqueDates.length} Hari)</option>
            ${dateOptionsHtml}
          </select>
          <button type="button" onclick="JadwalModule.openPrintJadwalModal()" class="bg-ocean-800 hover:bg-ocean-900 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5">
            <span>🖨️ Kelola & Cetak Dokumen Ujian</span>
          </button>
        </div>
      </div>
    `;

    listJadwal.forEach((j) => {
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

  isTimeOverlap(startA, endA, startB, endB) {
    const toMinutes = (t) => {
      const parts = String(t || '00:00').substring(0, 5).split(':');
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    };
    const sA = toMinutes(startA);
    const eA = toMinutes(endA);
    const sB = toMinutes(startB);
    const eB = toMinutes(endB);
    return sA < eB && eA > sB;
  },

  formatTanggalIndonesia(dateStr) {
    if (!dateStr) return '-';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  },

  async buildRoomAndSupervisorAllocation(filterTanggal = 'ALL') {
    if (!State.siswaList || State.siswaList.length === 0) {
      State.siswaList = await DB.fetchSiswa();
    }

    // Gunakan cache daftar guru jika sudah ada di memori (tanpa query ulang)
    let rawGuru = (typeof GuruModule !== 'undefined' && Array.isArray(GuruModule.guruList) && GuruModule.guruList.length > 0)
      ? GuruModule.guruList
      : (Array.isArray(DB._cachedGuruList) && DB._cachedGuruList.length > 0 ? DB._cachedGuruList : await DB.fetchGuru());

    this.lastKepalaSekolah = this.extractKepalaSekolah(rawGuru);
    if (typeof DB !== 'undefined') DB._cachedKepsek = this.lastKepalaSekolah;

    const eligibleGuru = (rawGuru || [])
      .filter(g => {
        const isAktif = this.normalizeText(g.status || 'AKTIF') === 'AKTIF';
        const jab = this.normalizeText(g.jabatan || '');
        const isGuruRole = jab === 'GURU' || jab.startsWith('GURU ');
        return isAktif && isGuruRole;
      })
      .sort((a, b) => String(a.nama_guru || '').localeCompare(String(b.nama_guru || ''), 'id'))
      .map((g, idx) => ({
        ...g,
        kodeGuru: String(idx + 1).padStart(2, '0')
      }));

    this.lastGuruCodeList = eligibleGuru;

    const siswaGroupByKelas = {};
    (State.siswaList || []).forEach(s => {
      const kRaw = String(s.kelas || '').trim();
      const kNorm = this.normalizeText(kRaw);
      const st = this.normalizeText(s.status || 'AKTIF');
      if (!kNorm || kNorm === '-' || st === 'NONAKTIF') return;
      if (!siswaGroupByKelas[kNorm]) {
        siswaGroupByKelas[kNorm] = { label: kRaw, students: [] };
      }
      siswaGroupByKelas[kNorm].students.push(s);
    });

    const sortedClassEntries = Object.values(siswaGroupByKelas)
      .sort((a, b) => a.label.localeCompare(b.label, 'id'));

    const MAX_PER_RUANG = 20;
    const masterRooms = [];
    let ruangCounter = 1;

    sortedClassEntries.forEach(cls => {
      const sortedStudents = [...cls.students].sort((a, b) =>
        String(a.nama || a.nama_siswa || '').localeCompare(String(b.nama || b.nama_siswa || ''), 'id')
      );

      for (let startIdx = 0; startIdx < sortedStudents.length; startIdx += MAX_PER_RUANG) {
        const chunkStudents = sortedStudents.slice(startIdx, startIdx + MAX_PER_RUANG);
        const isi = chunkStudents.length;
        masterRooms.push({
          nomorRuang: ruangCounter,
          kelasNorm: this.normalizeText(cls.label),
          kelasLabel: cls.label,
          jumlahSiswa: isi,
          students: chunkStudents,
          ruangLabel: `Ruang ${ruangCounter} (${cls.label} ${isi})`
        });
        ruangCounter++;
      }
    });

    this.lastMasterRooms = masterRooms;

    let schedules = [...(State.schedules || [])];
    if (State.currentUser && State.currentUser.role === 'guru') {
      schedules = schedules.filter(j => this.isPairAllowed(j.mapel, j.kelas));
    }
    if (filterTanggal && filterTanggal !== 'ALL') {
      schedules = schedules.filter(j => String(j.tanggal || '').trim() === filterTanggal);
    }

    const uniqueMapels = [...new Set(
      schedules.map(j => String(j.mapel || '').trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'id'));

    const mapelCodeMap = {};
    this.lastMapelCodeList = uniqueMapels.map((mName, idx) => {
      const code = `MP-${String(idx + 1).padStart(2, '0')}`;
      mapelCodeMap[this.normalizeText(mName)] = code;
      return { kodeMapel: code, namaMapel: mName };
    });

    const getMapelCode = (mapelStr) => {
      return String(mapelStr || '')
        .split('/')
        .map(part => {
          const clean = part.trim();
          return mapelCodeMap[this.normalizeText(clean)] || clean;
        })
        .join(' / ');
    };

    const sessionMap = {};
    schedules.forEach(j => {
      const tgl = String(j.tanggal || '').trim();
      const jm = String(j.jamMulai || '').substring(0, 5);
      const js = String(j.jamSelesai || '').substring(0, 5);
      const sKey = `${tgl}|${jm}|${js}`;
      if (!sessionMap[sKey]) {
        sessionMap[sKey] = {
          sessionKey: sKey,
          tanggal: tgl,
          jamMulai: jm,
          jamSelesai: js,
          durasi: j.durasi || 45,
          items: []
        };
      }
      sessionMap[sKey].items.push(j);
    });

    const sortedSessions = Object.values(sessionMap).sort((a, b) => {
      const cmpD = a.tanggal.localeCompare(b.tanggal);
      if (cmpD !== 0) return cmpD;
      return a.jamMulai.localeCompare(b.jamMulai);
    });

    const sessionCountPerDay = {};
    sortedSessions.forEach(sess => {
      sessionCountPerDay[sess.tanggal] = (sessionCountPerDay[sess.tanggal] || 0) + 1;
      sess.jamKe = sessionCountPerDay[sess.tanggal];
    });

    const rawSlotRooms = [];
    sortedSessions.forEach(sess => {
      const totalSesiHariIni = sessionCountPerDay[sess.tanggal];
      const sesiLabel = totalSesiHariIni === 1
        ? `Jam ke-1 (Sesi Tunggal)`
        : `Jam ke-${sess.jamKe}`;

      const mapelByKelasNorm = {};
      sess.items.forEach(j => {
        String(j.kelas || '').split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
          const kN = this.normalizeText(k);
          if (!mapelByKelasNorm[kN]) {
            mapelByKelasNorm[kN] = j.mapel;
          } else if (!mapelByKelasNorm[kN].includes(j.mapel)) {
            mapelByKelasNorm[kN] += ` / ${j.mapel}`;
          }
        });
      });

      const activeMasterRooms = masterRooms.filter(r => !!mapelByKelasNorm[r.kelasNorm]);

      if (activeMasterRooms.length > 0) {
        activeMasterRooms.forEach(r => {
          const mFull = mapelByKelasNorm[r.kelasNorm];
          rawSlotRooms.push({
            sessionKey: sess.sessionKey,
            tanggal: sess.tanggal,
            tanggalFormatted: this.formatTanggalIndonesia(sess.tanggal),
            jamKe: sess.jamKe,
            sesiLabel,
            jamMulai: sess.jamMulai,
            jamSelesai: sess.jamSelesai,
            durasi: sess.durasi,
            nomorRuang: r.nomorRuang,
            ruangLabel: r.ruangLabel,
            kelas: r.kelasLabel,
            jumlahSiswa: r.jumlahSiswa,
            students: r.students,
            mapel: mFull,
            kodeMapel: getMapelCode(mFull)
          });
        });
      } else {
        let fallbackNo = 1;
        sess.items.forEach(j => {
          String(j.kelas || '').split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
            rawSlotRooms.push({
              sessionKey: sess.sessionKey,
              tanggal: sess.tanggal,
              tanggalFormatted: this.formatTanggalIndonesia(sess.tanggal),
              jamKe: sess.jamKe,
              sesiLabel,
              jamMulai: sess.jamMulai,
              jamSelesai: sess.jamSelesai,
              durasi: sess.durasi,
              nomorRuang: fallbackNo,
              ruangLabel: `Ruang ${fallbackNo} (${k} 0)`,
              kelas: k,
              jumlahSiswa: 0,
              students: [],
              mapel: j.mapel,
              kodeMapel: getMapelCode(j.mapel)
            });
            fallbackNo++;
          });
        });
      }
    });

    const assignedIntervalsByGuru = {};
    const assignedRoomsTodayByGuru = {};
    const sessionAssignCountByGuru = {};
    const sessionShuffledPool = {};

    const pickOneSupervisor = (room, pool, excludeGuruKey = null) => {
      if (!pool || pool.length === 0) return null;

      const getKey = (g) => String(g.id_guru || g.no_hp || g.nama_guru);
      const otherCandidates = pool.filter(c => getKey(c) !== excludeGuruKey);
      const candidateList = otherCandidates.length > 0 ? otherCandidates : pool;

      const freeAtTime = candidateList.filter(c => {
        const gKey = getKey(c);
        const bookedList = assignedIntervalsByGuru[gKey] || [];
        return !bookedList.some(b =>
          b.tanggal === room.tanggal &&
          this.isTimeOverlap(room.jamMulai, room.jamSelesai, b.jamMulai, b.jamSelesai)
        );
      });

      let chosen = freeAtTime.find(c => {
        const gKey = getKey(c);
        const roomsToday = assignedRoomsTodayByGuru[`${gKey}|${room.tanggal}`];
        return !roomsToday || !roomsToday.has(room.nomorRuang);
      });

      if (!chosen && freeAtTime.length > 0) {
        chosen = freeAtTime[0];
      }

      if (!chosen && candidateList.length > 0) {
        const sortedByLoad = [...candidateList].sort((a, b) => {
          const loadA = sessionAssignCountByGuru[`${room.sessionKey}|${getKey(a)}`] || 0;
          const loadB = sessionAssignCountByGuru[`${room.sessionKey}|${getKey(b)}`] || 0;
          return loadA - loadB;
        });
        chosen = sortedByLoad[0];
      }

      if (chosen) {
        const gKey = getKey(chosen);
        if (!assignedIntervalsByGuru[gKey]) assignedIntervalsByGuru[gKey] = [];
        assignedIntervalsByGuru[gKey].push({
          tanggal: room.tanggal,
          jamMulai: room.jamMulai,
          jamSelesai: room.jamSelesai
        });

        const dayKey = `${gKey}|${room.tanggal}`;
        if (!assignedRoomsTodayByGuru[dayKey]) assignedRoomsTodayByGuru[dayKey] = new Set();
        assignedRoomsTodayByGuru[dayKey].add(room.nomorRuang);

        const sessLoadKey = `${room.sessionKey}|${gKey}`;
        sessionAssignCountByGuru[sessLoadKey] = (sessionAssignCountByGuru[sessLoadKey] || 0) + 1;
      }

      return chosen || null;
    };

    const allocations = rawSlotRooms.map(room => {
      if (!sessionShuffledPool[room.sessionKey]) {
        sessionShuffledPool[room.sessionKey] = this.shuffleArray(eligibleGuru);
      }
      const pool = sessionShuffledPool[room.sessionKey];

      const p1 = pickOneSupervisor(room, pool, null);
      const p1Key = p1 ? String(p1.id_guru || p1.no_hp || p1.nama_guru) : null;
      const p2 = pickOneSupervisor(room, pool, p1Key);

      return {
        ...room,
        pengawas1Kode: p1 ? p1.kodeGuru : '-',
        pengawas1Nama: p1 ? p1.nama_guru : '-',
        pengawas1Nip: p1 ? (p1.nip || '-') : '-',
        isP1Unassigned: !p1,
        pengawas2Kode: p2 ? p2.kodeGuru : '-',
        pengawas2Nama: p2 ? p2.nama_guru : '-',
        pengawas2Nip: p2 ? (p2.nip || '-') : '-',
        isP2Unassigned: !p2
      };
    });

    this.lastGeneratedAllocation = allocations;
    return {
      allocations,
      totalEligibleGuru: eligibleGuru.length,
      totalMasterRooms: masterRooms.length
    };
  },

  closePrintJadwalModal() {
    const modal = document.getElementById('modal-cetak-jadwal-ruang');
    if (modal) modal.remove();
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  },

  async openPrintJadwalModal() {
    const filterTanggal = document.getElementById('filter-cetak-jadwal-tanggal')?.value || 'ALL';
    const { allocations, totalEligibleGuru, totalMasterRooms } = await this.buildRoomAndSupervisorAllocation(filterTanggal);

    if (allocations.length === 0) {
      alert("Tidak ada jadwal ujian yang dapat dicetak pada filter tanggal yang dipilih.");
      return;
    }

    let modal = document.getElementById('modal-cetak-jadwal-ruang');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-cetak-jadwal-ruang';
      modal.className = 'fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto';
      modal.onclick = (e) => {
        if (e.target === modal) this.closePrintJadwalModal();
      };
      document.body.appendChild(modal);
    }

    if (!this._escHandler) {
      this._escHandler = (e) => {
        if (e.key === 'Escape') this.closePrintJadwalModal();
      };
      document.addEventListener('keydown', this._escHandler);
    }

    let lastSessionKey = '';
    const rowsHtml = allocations.map((row, idx) => {
      let headerBanner = '';
      if (row.sessionKey !== lastSessionKey) {
        lastSessionKey = row.sessionKey;
        headerBanner = `
          <tr class="bg-ocean-100/80 border-y border-ocean-300">
            <td colspan="5" class="px-3 py-2 font-extrabold text-xs text-ocean-950">
              📅 ${row.tanggalFormatted} &bull; ⏰ ${row.sesiLabel} (${row.jamMulai} - ${row.jamSelesai} WITA)
            </td>
          </tr>
        `;
      }

      return `
        ${headerBanner}
        <tr class="border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}">
          <td class="p-2.5 text-center font-bold text-slate-600">${row.nomorRuang}</td>
          <td class="p-2.5 font-semibold text-slate-700">${row.sesiLabel}<div class="text-[10px] font-mono text-slate-500">${row.jamMulai} - ${row.jamSelesai}</div></td>
          <td class="p-2.5 font-bold text-ocean-900">${row.ruangLabel}</td>
          <td class="p-2.5 text-slate-800">
            <span class="inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-mono font-bold text-[11px] mr-1.5">${row.kodeMapel}</span>
            <span class="font-semibold">${row.mapel}</span>
          </td>
          <td class="p-2.5 text-slate-800">
            <span class="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[11px] mr-1.5">
              Kode: ${row.pengawas1Kode} &amp; ${row.pengawas2Kode}
            </span>
            <span class="text-[11px] text-slate-600">(${row.pengawas1Nama} &amp; ${row.pengawas2Nama})</span>
          </td>
        </tr>
      `;
    }).join('');

    const kepsek = this.lastKepalaSekolah;

    modal.innerHTML = `
      <div class="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 flex flex-col max-h-[92vh]">
        <div class="px-5 py-3.5 bg-ocean-950 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 class="font-extrabold text-sm">Pratinjau Jadwal Ujian, Daftar Hadir Pengawas &amp; Daftar Hadir Siswa</h3>
            <p class="text-[11px] text-teal-300">Total Ruang: ${totalMasterRooms} &bull; Guru Aktif: ${totalEligibleGuru} &bull; Kepala Sekolah: <strong>${kepsek.nama}</strong></p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="JadwalModule.openPrintJadwalModal()" class="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3 py-2 rounded-lg transition">
              🔀 Acak Ulang Pengawas
            </button>
            <button type="button" onclick="JadwalModule.executePrintJadwal()" class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-3 py-2 rounded-lg shadow transition">
              🖨️ Cetak Jadwal (Kode Ringkas)
            </button>
            <button type="button" onclick="JadwalModule.executePrintDaftarHadirPengawas()" class="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-3 py-2 rounded-lg shadow transition">
              📋 Cetak Daftar Hadir Pengawas (Per Hari)
            </button>
            <button type="button" onclick="JadwalModule.executePrintDaftarHadirSiswa()" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-3 py-2 rounded-lg shadow transition">
              🧑‍🎓 Cetak Daftar Hadir Siswa
            </button>
            <button type="button" onclick="JadwalModule.closePrintJadwalModal()" class="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-lg shadow transition">
              ⬅️ Tutup / Kembali
            </button>
          </div>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <table class="w-full text-left border-collapse text-xs border border-slate-200">
            <thead>
              <tr class="bg-slate-100 border-b border-slate-300 text-[11px] font-extrabold text-slate-700 uppercase">
                <th class="p-2.5 text-center w-14">Ruang</th>
                <th class="p-2.5 w-36">Sesi / Waktu</th>
                <th class="p-2.5">Nama Ruang & Peserta</th>
                <th class="p-2.5">Kode &amp; Mata Pelajaran</th>
                <th class="p-2.5">Kode &amp; Nama Pengawas Ruang</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>

        <div class="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span class="text-[11px] text-slate-500">Tekan tombol <strong>ESC</strong> atau klik Tutup untuk kembali.</span>
          <button type="button" onclick="JadwalModule.closePrintJadwalModal()" class="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg transition">
            ⬅️ Tutup / Kembali
          </button>
        </div>
      </div>
    `;
  },

  getPrintToolbarHtml() {
    return `
      <div class="no-print" style="background:#0f172a;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-radius:8px;">
        <span style="font-size:12px;font-weight:bold;">Pratinjau Dokumen Siap Cetak — SMK Negeri 1 Wakatobi</span>
        <div style="display:flex;gap:8px;">
          <button onclick="window.print()" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">🖨️ Cetak / Simpan PDF</button>
          <button onclick="window.close()" style="background:#e11d48;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">✕ Tutup Tab Ini</button>
        </div>
      </div>
    `;
  },

  executePrintJadwal() {
    const allocations = this.lastGeneratedAllocation || [];
    const rooms = this.lastMasterRooms || [];
    const guruCodes = this.lastGuruCodeList || [];
    const mapelCodes = this.lastMapelCodeList || [];
    const kepsek = this.lastKepalaSekolah;
    if (allocations.length === 0) return;

    const kopUrl = this.getKopUrl();
    const todayStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const sessionList = [];
    const sessionLookup = {};
    allocations.forEach(a => {
      if (!sessionLookup[a.sessionKey]) {
        const sObj = {
          sessionKey: a.sessionKey,
          tanggal: a.tanggal,
          tanggalFormatted: a.tanggalFormatted,
          sesiLabel: a.jamKe === 1 ? 'Jam 1' : `Jam ${a.jamKe}`,
          jamMulai: a.jamMulai,
          jamSelesai: a.jamSelesai
        };
        sessionLookup[a.sessionKey] = sObj;
        sessionList.push(sObj);
      }
    });

    const cellMap = {};
    allocations.forEach(a => {
      cellMap[`${a.sessionKey}|${a.nomorRuang}`] = a;
    });

    const activeRoomNums = [...new Set(allocations.map(a => a.nomorRuang))].sort((a, b) => a - b);
    const displayRooms = activeRoomNums.map(num => {
      const found = rooms.find(r => r.nomorRuang === num) || allocations.find(a => a.nomorRuang === num);
      return {
        nomorRuang: num,
        ruangLabel: found ? found.ruangLabel : `Ruang ${num}`
      };
    });

    const daysGroup = [];
    sessionList.forEach(s => {
      let lastDay = daysGroup[daysGroup.length - 1];
      if (!lastDay || lastDay.tanggal !== s.tanggal) {
        lastDay = {
          tanggal: s.tanggal,
          tanggalFormatted: s.tanggalFormatted,
          sessions: []
        };
        daysGroup.push(lastDay);
      }
      lastDay.sessions.push(s);
    });

    const thDaysHtml = daysGroup.map(d =>
      `<th colspan="${d.sessions.length}">${d.tanggalFormatted}</th>`
    ).join('');

    const thSessionsHtml = sessionList.map(s =>
      `<th style="font-size:8.5px;">${s.sesiLabel}<br><span style="font-weight:normal;">${s.jamMulai}-${s.jamSelesai}</span></th>`
    ).join('');

    const matrixRowsHtml = displayRooms.map(rm => {
      const cellsHtml = sessionList.map(s => {
        const cell = cellMap[`${s.sessionKey}|${rm.nomorRuang}`];
        if (!cell) return `<td style="text-align:center;color:#94a3b8;">-</td>`;
        return `
          <td style="text-align:center;line-height:1.25;">
            <div style="font-weight:bold;color:#1e293b;">${cell.kodeMapel}</div>
            <div style="font-size:9px;color:#0f766e;font-weight:bold;">P: ${cell.pengawas1Kode} &amp; ${cell.pengawas2Kode}</div>
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td style="font-weight:bold;white-space:nowrap;">${rm.ruangLabel}</td>
          ${cellsHtml}
        </tr>
      `;
    }).join('');

    const mapelLegendItems = mapelCodes
      .map(m => `<div><strong>${m.kodeMapel}</strong> : ${m.namaMapel}</div>`)
      .join('');

    const guruLegendItems = guruCodes
      .map(g => `<div><strong>${g.kodeGuru}</strong> : ${g.nama_guru}</div>`)
      .join('');

    const printWin = window.open('', '_blank', 'width=1100,height=780');
    if (!printWin) {
      alert("Pop-up diblokir oleh browser! Izinkan pop-up untuk mencetak jadwal.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Jadwal Ujian & Kode Pengawas Ruang - SMK Negeri 1 Wakatobi</title>
        <style>
          @page { size: A4 landscape; margin: 9mm; }
          @media print { .no-print { display: none !important; } }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9.5px; margin: 0; }
          .kop { width: 100%; max-height: 92px; object-fit: contain; display: block; margin: 0 auto 5px auto; }
          .title { text-align: center; margin: 3px 0 8px 0; }
          .title h2 { margin: 0; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.4px; }
          .title p { margin: 2px 0 0 0; font-size: 10.5px; font-weight: bold; }
          table.matrix { width: 100%; border-collapse: collapse; margin-top: 4px; }
          table.matrix th, table.matrix td { border: 1px solid #334155; padding: 3.5px 4px; vertical-align: middle; }
          table.matrix th { background-color: #e2e8f0; font-weight: bold; text-align: center; font-size: 9px; }
          .legend-grid { display: flex; gap: 12px; margin-top: 8px; page-break-inside: avoid; }
          .legend-box { border: 1px solid #64748b; border-radius: 4px; padding: 5px 8px; background: #f8fafc; }
          .legend-box h4 { margin: 0 0 4px 0; font-size: 9.5px; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; }
          .cols-mapel { column-count: 1; font-size: 8.5px; line-height: 1.35; }
          .cols-guru { column-count: 3; column-gap: 14px; font-size: 8.5px; line-height: 1.35; }
          .ttd-wrap { width: 100%; margin-top: 12px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
          .ttd-box { width: 260px; text-align: left; font-size: 9.5px; line-height: 1.35; }
          .ttd-space { height: 42px; }
        </style>
      </head>
      <body>
        ${this.getPrintToolbarHtml()}
        <img src="${kopUrl}" class="kop" alt="Kop Sekolah" onerror="this.style.display='none'">
        <div class="title">
          <h2>JADWAL PELAKSANAAN UJIAN &amp; PEMBAGIAN PENGAWAS RUANG</h2>
          <p>SMK NEGERI 1 WAKATOBI &bull; TAHUN AJARAN 2026/2027</p>
        </div>

        <table class="matrix">
          <thead>
            <tr>
              <th rowspan="2" style="width:145px;">Ruang &amp; Peserta</th>
              ${thDaysHtml}
            </tr>
            <tr>
              ${thSessionsHtml}
            </tr>
          </thead>
          <tbody>
            ${matrixRowsHtml}
          </tbody>
        </table>

        <div class="legend-grid">
          <div class="legend-box" style="width:32%;">
            <h4>Keterangan Kode Mata Pelajaran</h4>
            <div class="cols-mapel">${mapelLegendItems}</div>
          </div>
          <div class="legend-box" style="width:68%;">
            <h4>Keterangan Kode Guru Pengawas Ruang (P = Pengawas 1 &amp; 2)</h4>
            <div class="cols-guru">${guruLegendItems}</div>
          </div>
        </div>

        <div class="ttd-wrap">
          <div class="ttd-box">
            Wangi-Wangi Selatan, ${todayStr}<br>
            Kepala SMK Negeri 1 Wakatobi,
            <div class="ttd-space"></div>
            <strong><u>${kepsek.nama}</u></strong><br>
            NIP. ${kepsek.nip}
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  },

  executePrintDaftarHadirPengawas() {
    const allocations = this.lastGeneratedAllocation || [];
    const kepsek = this.lastKepalaSekolah;
    if (allocations.length === 0) return;

    const kopUrl = this.getKopUrl();

    const dayGroupsMap = {};
    allocations.forEach(r => {
      if (!dayGroupsMap[r.tanggal]) {
        dayGroupsMap[r.tanggal] = {
          tanggal: r.tanggal,
          tanggalFormatted: r.tanggalFormatted,
          items: []
        };
      }
      dayGroupsMap[r.tanggal].items.push(r);
    });

    const sortedDayGroups = Object.values(dayGroupsMap).sort((a, b) =>
      a.tanggal.localeCompare(b.tanggal)
    );

    const pagesHtml = sortedDayGroups.map((dayGrp, dIdx) => {
      let lastSessionKey = '';
      let rowCounter = 0;

      const tableRows = dayGrp.items.map((r) => {
        let sessionBanner = '';
        if (r.sessionKey !== lastSessionKey) {
          lastSessionKey = r.sessionKey;
          rowCounter = 0;
          sessionBanner = `
            <tr style="background-color:#f1f5f9;">
              <td colspan="5" style="font-weight:bold; font-size:11px; padding:6px 8px; color:#0f172a;">
                ${r.sesiLabel} &nbsp;|&nbsp; Pukul ${r.jamMulai} - ${r.jamSelesai} WITA
              </td>
            </tr>
          `;
        }

        const supervisors = [
          { kode: r.pengawas1Kode, nama: r.pengawas1Nama, nip: r.pengawas1Nip, label: 'Pengawas 1' },
          { kode: r.pengawas2Kode, nama: r.pengawas2Nama, nip: r.pengawas2Nip, label: 'Pengawas 2' }
        ];

        return sessionBanner + supervisors.map((sup, sIdx) => {
          rowCounter++;
          const isOdd = rowCounter % 2 === 1;
          const ttdCellHtml = isOdd
            ? `<td style="height:26px; text-align:left; padding-left:8px; font-size:10px; color:#334155;">${rowCounter}. ......................</td>`
            : `<td style="height:26px; text-align:right; padding-right:8px; font-size:10px; color:#334155;">${rowCounter}. ......................</td>`;

          const ruangCellHtml = sIdx === 0
            ? `<td rowspan="2" style="vertical-align:middle;"><strong>${r.ruangLabel}</strong></td>
               <td rowspan="2" style="vertical-align:middle;"><strong>[${r.kodeMapel}]</strong> ${r.mapel}</td>`
            : '';

          return `
            <tr>
              <td style="text-align:center; font-weight:bold;">${rowCounter}</td>
              <td>
                <strong>[${sup.kode}] ${sup.nama}</strong> <span style="font-size:9.5px;color:#64748b;">(${sup.label})</span>
                ${sup.nip !== '-' ? `<br><span style="font-size:10px;color:#475569;">NIP. ${sup.nip}</span>` : ''}
              </td>
              ${ruangCellHtml}
              ${ttdCellHtml}
            </tr>
          `;
        }).join('');
      }).join('');

      return `
        <div class="${dIdx > 0 ? 'page-break' : ''}">
          <img src="${kopUrl}" class="kop" alt="Kop Sekolah" onerror="this.style.display='none'">
          <div class="title">
            <h2>DAFTAR HADIR PENGAWAS RUANG UJIAN</h2>
            <p>SMK NEGERI 1 WAKATOBI &bull; TAHUN AJARAN 2026/2027</p>
          </div>

          <div style="margin:6px 0 8px 0; font-size:11.5px; font-weight:bold;">
            Hari / Tanggal : ${dayGrp.tanggalFormatted}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:32px;">No</th>
                <th style="width:235px;">Kode, Nama Pengawas &amp; NIP</th>
                <th style="width:160px;">Ruang &amp; Peserta</th>
                <th>Mata Pelajaran</th>
                <th style="width:145px;">Tanda Tangan</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="ttd-wrap">
            <div class="ttd-box">
              Mengetahui,<br>
              Kepala SMK Negeri 1 Wakatobi,
              <div class="ttd-space"></div>
              <strong><u>${kepsek.nama}</u></strong><br>
              NIP. ${kepsek.nip}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=1000,height=780');
    if (!printWin) {
      alert("Pop-up diblokir oleh browser! Izinkan pop-up untuk mencetak daftar hadir pengawas.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Daftar Hadir Pengawas Ruang Ujian (Per Hari) - SMK Negeri 1 Wakatobi</title>
        <style>
          @page { size: A4 portrait; margin: 11mm; }
          @media print {
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
          }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
          .kop { width: 100%; max-height: 105px; object-fit: contain; display: block; margin: 0 auto 6px auto; }
          .title { text-align: center; margin: 4px 0 10px 0; }
          .title h2 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
          .title p { margin: 2px 0 0 0; font-size: 11.5px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          th, td { border: 1px solid #334155; padding: 4.5px 8px; vertical-align: middle; }
          th { background-color: #e2e8f0; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10px; }
          .ttd-wrap { width: 100%; margin-top: 20px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
          .ttd-box { width: 255px; text-align: left; font-size: 11px; line-height: 1.45; }
          .ttd-space { height: 52px; }
        </style>
      </head>
      <body>
        ${this.getPrintToolbarHtml()}
        ${pagesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  },

  executePrintDaftarHadirSiswa() {
    const allocations = this.lastGeneratedAllocation || [];
    const rooms = this.lastMasterRooms || [];
    const kepsek = this.lastKepalaSekolah;

    if (rooms.length === 0) {
      alert("Data siswa per ruang tidak ditemukan. Pastikan data siswa sudah terisi.");
      return;
    }

    const kopUrl = this.getKopUrl();

    const sheetEntries = allocations.length > 0
      ? allocations.map(a => {
          const masterMatch = rooms.find(r => r.nomorRuang === a.nomorRuang);
          return {
            ruangLabel: a.ruangLabel,
            kelasLabel: a.kelas,
            jumlahSiswa: a.jumlahSiswa,
            students: (a.students && a.students.length > 0) ? a.students : (masterMatch ? masterMatch.students : []),
            tanggalFormatted: a.tanggalFormatted,
            sesiLabel: `${a.sesiLabel} (${a.jamMulai} - ${a.jamSelesai} WITA)`,
            mapel: a.mapel,
            pengawas1Nama: a.pengawas1Nama,
            pengawas1Nip: a.pengawas1Nip,
            pengawas2Nama: a.pengawas2Nama,
            pengawas2Nip: a.pengawas2Nip
          };
        })
      : rooms.map(rm => ({
          ruangLabel: rm.ruangLabel,
          kelasLabel: rm.kelasLabel,
          jumlahSiswa: rm.jumlahSiswa,
          students: rm.students || [],
          tanggalFormatted: '....................................................',
          sesiLabel: 'Jam ke-1 / Jam ke-2 (....... - .......)',
          mapel: '....................................................',
          pengawas1Nama: '..................................................',
          pengawas1Nip: '............................................',
          pengawas2Nama: '..................................................',
          pengawas2Nip: '............................................'
        }));

    const pagesHtml = sheetEntries.map((entry, idx) => {
      const studentRows = (entry.students || []).map((s, sIdx) => {
        const no = sIdx + 1;
        const nisn = s.nisn || s.NISN || s.id_siswa || '-';
        const nama = s.nama || s.nama_siswa || s.NAMA || '-';
        const isOdd = no % 2 === 1;
        const ttdCell = isOdd
          ? `<td style="height:24px; text-align:left; padding-left:8px; font-size:10px; color:#334155;">${no}. ......................</td>`
          : `<td style="height:24px; text-align:right; padding-right:8px; font-size:10px; color:#334155;">${no}. ......................</td>`;

        return `
          <tr>
            <td style="text-align:center; font-weight:bold;">${no}</td>
            <td style="text-align:center; font-family:monospace;">${nisn}</td>
            <td>${nama}</td>
            <td style="text-align:center;">${entry.kelasLabel}</td>
            ${ttdCell}
          </tr>
        `;
      }).join('');

      const nip1Display = (entry.pengawas1Nip && entry.pengawas1Nip !== '-') ? entry.pengawas1Nip : '............................................';
      const nip2Display = (entry.pengawas2Nip && entry.pengawas2Nip !== '-') ? entry.pengawas2Nip : '............................................';

      return `
        <div class="${idx > 0 ? 'page-break' : ''}">
          <img src="${kopUrl}" class="kop" alt="Kop Sekolah" onerror="this.style.display='none'">
          <div class="title">
            <h2>DAFTAR HADIR PESERTA UJIAN</h2>
            <p>SMK NEGERI 1 WAKATOBI &bull; TAHUN AJARAN 2026/2027</p>
          </div>

          <table class="meta-table">
            <tr>
              <td style="width:125px;"><strong>Ruang Ujian</strong></td>
              <td style="width:230px;">: <strong>${entry.ruangLabel}</strong></td>
              <td style="width:120px;"><strong>Hari / Tanggal</strong></td>
              <td>: ${entry.tanggalFormatted}</td>
            </tr>
            <tr>
              <td><strong>Kelas / Peserta</strong></td>
              <td>: ${entry.kelasLabel} (${entry.jumlahSiswa} Siswa)</td>
              <td><strong>Mata Pelajaran</strong></td>
              <td>: <strong>${entry.mapel}</strong></td>
            </tr>
            <tr>
              <td><strong>Sesi / Waktu</strong></td>
              <td>: ${entry.sesiLabel}</td>
              <td><strong>Rekap Kehadiran</strong></td>
              <td>: Hadir: ...... | Tidak Hadir: ......</td>
            </tr>
          </table>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width:34px;">No</th>
                <th style="width:115px;">NISN / ID</th>
                <th>Nama Lengkap Peserta Ujian</th>
                <th style="width:105px;">Kelas</th>
                <th style="width:165px;">Tanda Tangan</th>
              </tr>
            </thead>
            <tbody>
              ${studentRows}
            </tbody>
          </table>

          <div class="ttd-section">
            <div class="ttd-pengawas-row">
              <div class="ttd-box">
                Pengawas Ruang 1,
                <div class="ttd-space"></div>
                <strong><u>${entry.pengawas1Nama}</u></strong><br>
                NIP. ${nip1Display}
              </div>
              <div class="ttd-box">
                Pengawas Ruang 2,
                <div class="ttd-space"></div>
                <strong><u>${entry.pengawas2Nama}</u></strong><br>
                NIP. ${nip2Display}
              </div>
            </div>

            <div class="ttd-kepsek-center">
              <div class="ttd-box-center">
                Mengetahui,<br>
                Kepala SMK Negeri 1 Wakatobi,
                <div class="ttd-space"></div>
                <strong><u>${kepsek.nama}</u></strong><br>
                NIP. ${kepsek.nip}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=1000,height=780');
    if (!printWin) {
      alert("Pop-up diblokir oleh browser! Izinkan pop-up untuk mencetak daftar hadir siswa.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Daftar Hadir Peserta Ujian per Ruang - SMK Negeri 1 Wakatobi</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          @media print {
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
          }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10.5px; margin: 0; }
          .kop { width: 100%; max-height: 98px; object-fit: contain; display: block; margin: 0 auto 5px auto; }
          .title { text-align: center; margin: 3px 0 8px 0; }
          .title h2 { margin: 0; font-size: 14.5px; text-transform: uppercase; letter-spacing: 0.5px; }
          .title p { margin: 2px 0 0 0; font-size: 11px; font-weight: bold; }
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 7px; font-size: 10.5px; }
          .meta-table td { border: none; padding: 1.5px 4px; }
          .data-table { width: 100%; border-collapse: collapse; }
          .data-table th, .data-table td { border: 1px solid #334155; padding: 3.8px 6px; vertical-align: middle; }
          .data-table th { background-color: #e2e8f0; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 9.5px; }
          .ttd-section { width: 100%; margin-top: 14px; page-break-inside: avoid; }
          .ttd-pengawas-row { width: 100%; display: flex; justify-content: space-between; padding: 0 24px; box-sizing: border-box; }
          .ttd-box { width: 235px; text-align: left; font-size: 10.5px; line-height: 1.35; }
          .ttd-kepsek-center { width: 100%; margin-top: 10px; display: flex; justify-content: center; }
          .ttd-box-center { width: 260px; text-align: center; font-size: 10.5px; line-height: 1.35; }
          .ttd-space { height: 42px; }
        </style>
      </head>
      <body>
        ${this.getPrintToolbarHtml()}
        ${pagesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
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
