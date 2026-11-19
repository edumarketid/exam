const JadwalModule = {
  lastGeneratedAllocation: [],

  normalizeText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
      console.log("[JadwalModule] Memuat data jadwal ujian & kelas target...");
      
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
          <p class="text-xs font-extrabold text-ocean-950">🖨️ Cetak Jadwal & Daftar Hadir Pengawas Ruang (Maks. 20 Siswa/Ruang)</p>
          <p class="text-[11px] text-slate-600">Otomatis 2 sesi/hari (hari terakhir 1 sesi), ruang konsisten, & pengawas jabatan <strong>Guru</strong> dirotasi agar tidak mengawas ruang sama 2x sehari.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select id="filter-cetak-jadwal-tanggal" class="text-xs font-semibold border border-ocean-300 rounded-lg px-2.5 py-2 bg-white text-slate-800">
            <option value="ALL">Semua Tanggal (${uniqueDates.length} Hari)</option>
            ${dateOptionsHtml}
          </select>
          <button type="button" onclick="JadwalModule.openPrintJadwalModal()" class="bg-ocean-800 hover:bg-ocean-900 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5">
            <span>🖨️ Lihat & Cetak Jadwal / Daftar Hadir</span>
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

  // =========================================================================
  // LOGIKA PEMBAGIAN RUANG KONSISTEN & ROTASI PENGAWAS HARIAN
  // =========================================================================
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

    let rawGuru = (typeof GuruModule !== 'undefined' && Array.isArray(GuruModule.guruList) && GuruModule.guruList.length > 0)
      ? GuruModule.guruList
      : await DB.fetchGuru();

    // Filter ketat: hanya status Aktif & jabatan GURU (bukan Kepala Sekolah / Staf / TU)
    const eligibleGuru = (rawGuru || []).filter(g => {
      const isAktif = this.normalizeText(g.status || 'AKTIF') === 'AKTIF';
      const jab = this.normalizeText(g.jabatan || '');
      const isGuruRole = jab === 'GURU' || jab.startsWith('GURU ');
      return isAktif && isGuruRole;
    });

    // Hitung jumlah siswa aktif per kelas & urutkan nama kelas secara konsisten
    const siswaCountByKelas = {};
    (State.siswaList || []).forEach(s => {
      const kRaw = String(s.kelas || '').trim();
      const kNorm = this.normalizeText(kRaw);
      const st = this.normalizeText(s.status || 'AKTIF');
      if (!kNorm || kNorm === '-' || st === 'NONAKTIF') return;
      if (!siswaCountByKelas[kNorm]) {
        siswaCountByKelas[kNorm] = { label: kRaw, count: 0 };
      }
      siswaCountByKelas[kNorm].count += 1;
    });

    const sortedClassEntries = Object.values(siswaCountByKelas)
      .sort((a, b) => a.label.localeCompare(b.label, 'id'));

    // Bentuk Master Daftar Ruang Permanen (Maks. 20 siswa/ruang) agar Ruang 1..N konsisten sepanjang hari & sesi
    const MAX_PER_RUANG = 20;
    const masterRooms = [];
    let ruangCounter = 1;

    sortedClassEntries.forEach(cls => {
      let sisa = cls.count;
      while (sisa > 0) {
        const isi = Math.min(MAX_PER_RUANG, sisa);
        masterRooms.push({
          nomorRuang: ruangCounter,
          kelasNorm: this.normalizeText(cls.label),
          kelasLabel: cls.label,
          jumlahSiswa: isi,
          ruangLabel: `Ruang ${ruangCounter} (${cls.label} ${isi})`
        });
        ruangCounter++;
        sisa -= isi;
      }
    });

    let schedules = [...(State.schedules || [])];
    if (State.currentUser && State.currentUser.role === 'guru') {
      schedules = schedules.filter(j => this.isPairAllowed(j.mapel, j.kelas));
    }
    if (filterTanggal && filterTanggal !== 'ALL') {
      schedules = schedules.filter(j => String(j.tanggal || '').trim() === filterTanggal);
    }

    // Kelompokkan jadwal berdasarkan (Tanggal + Jam Mulai + Jam Selesai) -> Sesi Ujian
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

    // Urutkan sesi berdasarkan tanggal lalu jam mulai, lalu beri label Jam ke-1 / Jam ke-2 per tanggal
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

    // Petakan tiap ruang pada tiap sesi dengan mapel sesuai kelasnya
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
            mapel: mapelByKelasNorm[r.kelasNorm]
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
              mapel: j.mapel
            });
            fallbackNo++;
          });
        });
      }
    });

    // Acak guru pengawas per sesi:
    // (1) Tidak bentrok jam pada tanggal yang sama
    // (2) Dirotasi: tidak mengawas nomorRuang yang sama dua kali dalam sehari
    const assignedIntervalsByGuru = {};
    const assignedRoomsTodayByGuru = {};
    const sessionShuffledPool = {};

    const allocations = rawSlotRooms.map(room => {
      if (!sessionShuffledPool[room.sessionKey]) {
        sessionShuffledPool[room.sessionKey] = this.shuffleArray(eligibleGuru);
      }

      const pool = sessionShuffledPool[room.sessionKey];

      const freeCandidates = pool.filter(candidate => {
        const gKey = String(candidate.id_guru || candidate.no_hp || candidate.nama_guru);
        const bookedList = assignedIntervalsByGuru[gKey] || [];
        return !bookedList.some(b =>
          b.tanggal === room.tanggal &&
          this.isTimeOverlap(room.jamMulai, room.jamSelesai, b.jamMulai, b.jamSelesai)
        );
      });

      let chosenGuru = freeCandidates.find(candidate => {
        const gKey = String(candidate.id_guru || candidate.no_hp || candidate.nama_guru);
        const roomsToday = assignedRoomsTodayByGuru[`${gKey}|${room.tanggal}`];
        return !roomsToday || !roomsToday.has(room.nomorRuang);
      });

      if (!chosenGuru && freeCandidates.length > 0) {
        chosenGuru = freeCandidates[0];
      }

      if (chosenGuru) {
        const gKey = String(chosenGuru.id_guru || chosenGuru.no_hp || chosenGuru.nama_guru);
        if (!assignedIntervalsByGuru[gKey]) assignedIntervalsByGuru[gKey] = [];
        assignedIntervalsByGuru[gKey].push({
          tanggal: room.tanggal,
          jamMulai: room.jamMulai,
          jamSelesai: room.jamSelesai
        });

        const dayKey = `${gKey}|${room.tanggal}`;
        if (!assignedRoomsTodayByGuru[dayKey]) assignedRoomsTodayByGuru[dayKey] = new Set();
        assignedRoomsTodayByGuru[dayKey].add(room.nomorRuang);
      }

      return {
        ...room,
        pengawasNama: chosenGuru ? chosenGuru.nama_guru : '⚠️ Belum Ada Pengawas (Stok Guru Habis)',
        pengawasNip: chosenGuru ? (chosenGuru.nip || '-') : '-',
        isUnassigned: !chosenGuru
      };
    });

    this.lastGeneratedAllocation = allocations;
    return {
      allocations,
      totalEligibleGuru: eligibleGuru.length,
      totalMasterRooms: masterRooms.length
    };
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
      modal.className = 'fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto';
      document.body.appendChild(modal);
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
          <td class="p-2.5 text-slate-800 font-semibold">${row.mapel}</td>
          <td class="p-2.5 ${row.isUnassigned ? 'text-rose-600 font-bold' : 'text-slate-800 font-semibold'}">
            ${row.pengawasNama}
            ${!row.isUnassigned && row.pengawasNip !== '-' ? `<div class="text-[10px] text-slate-500 font-mono">NIP. ${row.pengawasNip}</div>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4">
        <div class="px-5 py-4 bg-ocean-950 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-extrabold text-sm">Pratinjau Jadwal Ujian, Pembagian Ruang & Daftar Hadir Pengawas</h3>
            <p class="text-[11px] text-teal-300">Total Ruang: ${totalMasterRooms} Ruang (Maks. 20 Siswa) &bull; Guru Aktif: ${totalEligibleGuru} Guru &bull; Rotasi Anti-Ruang Sama Aktif</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="JadwalModule.openPrintJadwalModal()" class="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3 py-2 rounded-lg transition">
              🔀 Acak Ulang Pengawas
            </button>
            <button type="button" onclick="JadwalModule.executePrintJadwal()" class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow transition">
              🖨️ Cetak Jadwal Ruang
            </button>
            <button type="button" onclick="JadwalModule.executePrintDaftarHadirPengawas()" class="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow transition">
              📋 Cetak Daftar Hadir Pengawas
            </button>
            <button type="button" onclick="document.getElementById('modal-cetak-jadwal-ruang').remove()" class="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3 py-2 rounded-lg transition">
              ✕ Tutup
            </button>
          </div>
        </div>

        <div class="p-4 max-h-[75vh] overflow-y-auto">
          <table class="w-full text-left border-collapse text-xs border border-slate-200">
            <thead>
              <tr class="bg-slate-100 border-b border-slate-300 text-[11px] font-extrabold text-slate-700 uppercase">
                <th class="p-2.5 text-center w-14">Ruang</th>
                <th class="p-2.5 w-36">Sesi / Waktu</th>
                <th class="p-2.5">Nama Ruang & Peserta</th>
                <th class="p-2.5">Mata Pelajaran</th>
                <th class="p-2.5">Guru Pengawas Ruang</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  executePrintJadwal() {
    const allocations = this.lastGeneratedAllocation || [];
    if (allocations.length === 0) return;

    const kopUrl = (typeof CONFIG !== 'undefined' && CONFIG.KOP_SEKOLAH_URL)
      ? CONFIG.KOP_SEKOLAH_URL
      : 'https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png';

    const todayStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    let lastSessionKey = '';
    const tableRows = allocations.map((r) => {
      let groupRow = '';
      if (r.sessionKey !== lastSessionKey) {
        lastSessionKey = r.sessionKey;
        groupRow = `
          <tr style="background-color:#f1f5f9;">
            <td colspan="6" style="font-weight:bold; font-size:11px; padding:7px 8px; color:#0f172a;">
              Hari / Tanggal: ${r.tanggalFormatted} &nbsp;|&nbsp; ${r.sesiLabel} (${r.jamMulai} - ${r.jamSelesai} WITA)
            </td>
          </tr>
        `;
      }

      return `
        ${groupRow}
        <tr>
          <td style="text-align:center; font-weight:bold;">${r.nomorRuang}</td>
          <td style="text-align:center;">${r.sesiLabel}<br><span style="font-size:10px;">${r.jamMulai} - ${r.jamSelesai}</span></td>
          <td><strong>${r.ruangLabel}</strong></td>
          <td>${r.mapel}</td>
          <td>
            <strong>${r.pengawasNama}</strong>
            ${!r.isUnassigned && r.pengawasNip !== '-' ? `<br><span style="font-size:10px;color:#475569;">NIP. ${r.pengawasNip}</span>` : ''}
          </td>
          <td style="height:26px;"></td>
        </tr>
      `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=1000,height=750');
    if (!printWin) {
      alert("Pop-up diblokir oleh browser! Izinkan pop-up untuk mencetak jadwal.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Jadwal Ujian & Pengawas Ruang - SMK Negeri 1 Wakatobi</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
          .kop { width: 100%; max-height: 115px; object-fit: contain; display: block; margin: 0 auto 8px auto; }
          .title { text-align: center; margin: 6px 0 14px 0; }
          .title h2 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
          .title p { margin: 3px 0 0 0; font-size: 12px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #334155; padding: 5px 8px; vertical-align: middle; }
          th { background-color: #e2e8f0; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10px; }
          .ttd-wrap { width: 100%; margin-top: 22px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .ttd-box { width: 260px; text-align: left; font-size: 11px; line-height: 1.45; }
          .ttd-space { height: 55px; }
        </style>
      </head>
      <body>
        <img src="${kopUrl}" class="kop" alt="Kop Sekolah" onerror="this.style.display='none'">
        <div class="title">
          <h2>JADWAL PELAKSANAAN UJIAN & PEMBAGIAN PENGAWAS RUANG</h2>
          <p>SMK NEGERI 1 WAKATOBI &bull; TAHUN AJARAN 2026/2027</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:45px;">Ruang</th>
              <th style="width:110px;">Sesi / Waktu</th>
              <th style="width:175px;">Nama Ruang & Peserta</th>
              <th>Mata Pelajaran</th>
              <th style="width:220px;">Guru Pengawas Ruang</th>
              <th style="width:80px;">Paraf</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="ttd-wrap">
          <div class="ttd-box">
            Mengetahui,<br>
            Kepala SMK Negeri 1 Wakatobi
            <div class="ttd-space"></div>
            <strong>..................................................</strong><br>
            NIP. ............................................
          </div>
          <div class="ttd-box">
            Wangi-Wangi Selatan, ${todayStr}<br>
            Wakasek Bidang Kurikulum,
            <div class="ttd-space"></div>
            <strong><u>Ajiardin, S.T., Gr.</u></strong><br>
            NIP. ............................................
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
    if (allocations.length === 0) return;

    const kopUrl = (typeof CONFIG !== 'undefined' && CONFIG.KOP_SEKOLAH_URL)
      ? CONFIG.KOP_SEKOLAH_URL
      : 'https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png';

    const todayStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Kelompokkan per tanggal dan sesi agar tiap sesi/hari tercetak rapi dengan nomor urut baru
    let lastSessionKey = '';
    let rowCounter = 0;

    const tableRows = allocations.map((r) => {
      let groupBanner = '';
      if (r.sessionKey !== lastSessionKey) {
        lastSessionKey = r.sessionKey;
        rowCounter = 0;
        groupBanner = `
          <tr style="background-color:#f1f5f9;">
            <td colspan="6" style="font-weight:bold; font-size:11px; padding:7px 8px; color:#0f172a;">
              Hari / Tanggal: ${r.tanggalFormatted} &nbsp;|&nbsp; ${r.sesiLabel} (Pukul ${r.jamMulai} - ${r.jamSelesai} WITA)
            </td>
          </tr>
        `;
      }

      rowCounter++;
      const isOdd = rowCounter % 2 === 1;
      const ttdCellHtml = isOdd
        ? `<td style="height:30px; text-align:left; padding-left:8px; font-size:10px; color:#334155;">${rowCounter}. ........................</td>`
        : `<td style="height:30px; text-align:right; padding-right:8px; font-size:10px; color:#334155;">${rowCounter}. ........................</td>`;

      return `
        ${groupBanner}
        <tr>
          <td style="text-align:center; font-weight:bold;">${rowCounter}</td>
          <td>
            <strong>${r.pengawasNama}</strong>
            ${!r.isUnassigned && r.pengawasNip !== '-' ? `<br><span style="font-size:10px;color:#475569;">NIP. ${r.pengawasNip}</span>` : ''}
          </td>
          <td><strong>${r.ruangLabel}</strong></td>
          <td>${r.mapel}</td>
          <td style="text-align:center;">${r.jamMulai} - ${r.jamSelesai}</td>
          ${ttdCellHtml}
        </tr>
      `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=1000,height=750');
    if (!printWin) {
      alert("Pop-up diblokir oleh browser! Izinkan pop-up untuk mencetak daftar hadir pengawas.");
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Daftar Hadir Pengawas Ruang Ujian - SMK Negeri 1 Wakatobi</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
          .kop { width: 100%; max-height: 110px; object-fit: contain; display: block; margin: 0 auto 8px auto; }
          .title { text-align: center; margin: 6px 0 14px 0; }
          .title h2 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
          .title p { margin: 3px 0 0 0; font-size: 12px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #334155; padding: 6px 8px; vertical-align: middle; }
          th { background-color: #e2e8f0; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10px; }
          .ttd-wrap { width: 100%; margin-top: 24px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .ttd-box { width: 240px; text-align: left; font-size: 11px; line-height: 1.45; }
          .ttd-space { height: 55px; }
        </style>
      </head>
      <body>
        <img src="${kopUrl}" class="kop" alt="Kop Sekolah" onerror="this.style.display='none'">
        <div class="title">
          <h2>DAFTAR HADIR PENGAWAS RUANG UJIAN</h2>
          <p>SMK NEGERI 1 WAKATOBI &bull; TAHUN AJARAN 2026/2027</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:32px;">No</th>
              <th style="width:205px;">Nama Guru Pengawas & NIP</th>
              <th style="width:155px;">Ruang & Peserta</th>
              <th>Mata Pelajaran</th>
              <th style="width:85px;">Waktu</th>
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
            Kepala SMK Negeri 1 Wakatobi
            <div class="ttd-space"></div>
            <strong>..................................................</strong><br>
            NIP. ............................................
          </div>
          <div class="ttd-box">
            Wangi-Wangi Selatan, ${todayStr}<br>
            Wakasek Bidang Kurikulum,
            <div class="ttd-space"></div>
            <strong><u>Ajiardin, S.T., Gr.</u></strong><br>
            NIP. ............................................
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
