const RekapModule = {
  pieChartInstance: null,

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

  isAllowedForCurrentUser(targetMapel, targetKelas = null) {
    if (!State.currentUser || State.currentUser.role !== 'guru') return true;
    const pairs = this.getGuruPairs();
    if (pairs.length === 0) return false;

    const mUpper = String(targetMapel || '').trim().toUpperCase();
    if (!targetKelas) {
      return pairs.some(p => p.mapel.toUpperCase() === mUpper);
    }

    const kUpper = String(targetKelas).trim().toUpperCase();
    return pairs.some(p => p.mapel.toUpperCase() === mUpper && (p.kelas === '*' || p.kelas.toUpperCase() === kUpper));
  },

  isKelasAllowedForGuru(targetKelas) {
    if (!State.currentUser || State.currentUser.role !== 'guru') return true;
    const pairs = this.getGuruPairs();
    if (pairs.length === 0) return false;
    const kUpper = String(targetKelas || '').trim().toUpperCase();
    return pairs.some(p => p.kelas === '*' || p.kelas.toUpperCase() === kUpper);
  },

  async fetchAndNormalizeHasil() {
    try {
      const rawHasil = await DB.fetchHasilUjian();
      const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();

      return (rawHasil || []).map(h => {
        const idSiswaStr = String(h.id_siswa || h.ID_SISWA || h.nisn || h.NISN || '').trim();
        const namaHasilStr = String(h.nama_siswa || h.NAMA_SISWA || h.nama || '').trim().toLowerCase();
        
        const profilSiswa = siswaList.find(s => 
          String(s.id_siswa || '').trim() === idSiswaStr || 
          String(s.nisn || s.NISN || '').trim() === idSiswaStr ||
          String(s.user || '').trim() === idSiswaStr ||
          (namaHasilStr !== '' && String(s.nama || '').trim().toLowerCase() === namaHasilStr)
        );

        const namaFix = profilSiswa ? profilSiswa.nama : (h.nama_siswa || h.NAMA_SISWA || h.nama || '-');
        const nisnFix = profilSiswa ? (profilSiswa.NISN || profilSiswa.nisn || '-') : (h.NISN || h.nisn || '-');
        const kelasFix = profilSiswa ? profilSiswa.kelas : (h.kelas || h.KELAS || '-');
        const mapelFix = h.mapel || h.MAPEL || h.nama_mapel || '-';
        const nilaiFix = h.nilai !== undefined ? h.nilai : (h.NILAI !== undefined ? h.NILAI : 0);
        const pelanggaranFix = h.jumlah_pelanggaran !== undefined ? h.jumlah_pelanggaran : (h.JUMLAH_PELANGGARAN || 0);
        const statusFix = String(h.status_selesai || h.STATUS_SELESAI || 'SELESAI').toUpperCase();
        const waktuFix = h.waktu_selesai || h.WAKTU_SELESAI || new Date().toISOString();

        return {
          id: h.id || h.ID,
          id_siswa: idSiswaStr,
          nama_siswa: namaFix,
          nisn: nisnFix,
          kelas: kelasFix,
          mapel: mapelFix,
          nilai: nilaiFix,
          jumlah_pelanggaran: pelanggaranFix,
          status_selesai: statusFix,
          waktu_selesai: waktuFix
        };
      });
    } catch (err) {
      console.error("[RekapModule] Gagal normalisasi hasil ujian:", err.message);
      return [];
    }
  },

  async refreshMonitoringData() {
    try {
      const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();
      State.siswaList = siswaList;

      let hasilList = await this.fetchAndNormalizeHasil();

      if (State.currentUser && State.currentUser.role === 'guru') {
        hasilList = hasilList.filter(h => this.isAllowedForCurrentUser(h.mapel, h.kelas));
      }

      const activeSiswa = siswaList.filter(s => 
        String(s.status).toLowerCase() === 'aktif' && this.isKelasAllowedForGuru(s.kelas)
      );
      const totalSiswa = activeSiswa.length;

      let countSelesai = 0;
      let countMengerjakan = 0;
      let countMelanggar = 0;

      const statusPerSiswa = {};
      hasilList.forEach(h => {
        const key = String(h.id_siswa || h.nama_siswa).trim();
        statusPerSiswa[key] = h;
      });

      Object.values(statusPerSiswa).forEach(h => {
        if (h.status_selesai === 'DIDISKUALIFIKASI' || Number(h.jumlah_pelanggaran) > 0) {
          countMelanggar++;
        }
        if (h.status_selesai === 'MENGERJAKAN') {
          countMengerjakan++;
        } else if (h.status_selesai === 'SELESAI' || h.status_selesai === 'DIDISKUALIFIKASI') {
          countSelesai++;
        }
      });

      const countBelumMulai = Math.max(0, totalSiswa - (countSelesai + countMengerjakan));

      const cardsContainer = document.getElementById('dashboard-summary-cards');
      if (cardsContainer) {
        cardsContainer.innerHTML = `
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-[11px] font-bold text-slate-400 uppercase">Total Siswa</div>
            <div class="text-2xl font-black text-slate-800 mt-1">${totalSiswa}</div>
            <div class="text-[10px] text-slate-500 mt-1">Peserta Terdaftar Aktif</div>
          </div>

          <div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-sm">
            <div class="text-[11px] font-bold text-emerald-700 uppercase">Sudah Selesai</div>
            <div class="text-2xl font-black text-emerald-800 mt-1">${countSelesai}</div>
            <div class="text-[10px] text-emerald-600 mt-1">Ujian Terkirim</div>
          </div>

          <div class="bg-blue-50 p-4 rounded-2xl border border-blue-200 shadow-sm">
            <div class="text-[11px] font-bold text-blue-700 uppercase">Mengerjakan</div>
            <div class="text-2xl font-black text-blue-800 mt-1">${countMengerjakan}</div>
            <div class="text-[10px] text-blue-600 mt-1">Aktif di Ruang Tes</div>
          </div>

          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-[11px] font-bold text-slate-600 uppercase">Belum Mulai</div>
            <div class="text-2xl font-black text-slate-700 mt-1">${countBelumMulai}</div>
            <div class="text-[10px] text-slate-500 mt-1">Menunggu Login</div>
          </div>

          <div class="bg-rose-50 p-4 rounded-2xl border border-rose-200 shadow-sm">
            <div class="text-[11px] font-bold text-rose-700 uppercase">Melanggar</div>
            <div class="text-2xl font-black text-rose-800 mt-1">${countMelanggar}</div>
            <div class="text-[10px] text-rose-600 mt-1">Peringatan / Diskualifikasi</div>
          </div>
        `;
      }

      this.renderDashboardPieChart({
        selesai: countSelesai,
        mengerjakan: countMengerjakan,
        belumMulai: countBelumMulai,
        melanggar: countMelanggar
      });

      this.renderDashboardKelasBreakdown(activeSiswa, statusPerSiswa);

      const logContainer = document.getElementById('monitoring-list-container');
      if (logContainer) {
        logContainer.innerHTML = '';
        if (!hasilList || hasilList.length === 0) {
          logContainer.innerHTML = `<p class="text-xs text-slate-500 italic p-4 text-center">Belum ada aktivitas ujian siswa yang tercatat sesuai pasangan mapel & kelas Anda.</p>`;
        } else {
          hasilList.slice().reverse().forEach((h) => {
            const isMengerjakan = h.status_selesai === 'MENGERJAKAN';
            const isDiskualifikasi = h.status_selesai === 'DIDISKUALIFIKASI';

            let badgeClass = 'bg-emerald-100 text-emerald-700';
            if (isMengerjakan) badgeClass = 'bg-blue-100 text-blue-700 animate-pulse';
            if (isDiskualifikasi) badgeClass = 'bg-rose-100 text-rose-700';

            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 border rounded-xl bg-slate-50 text-xs shadow-sm hover:bg-blue-50/50 transition";
            div.innerHTML = `
              <div>
                <div class="font-bold text-slate-800">${h.nama_siswa} <span class="text-ocean-700 font-semibold">(${h.kelas})</span></div>
                <div class="text-[11px] text-slate-500 mt-0.5">Mata Ujian: <strong>${h.mapel}</strong> | Update: ${new Date(h.waktu_selesai).toLocaleTimeString('id-ID')} WITA</div>
              </div>
              <div class="text-right">
                <div class="text-sm font-extrabold ${isDiskualifikasi ? 'text-rose-600' : (isMengerjakan ? 'text-blue-600' : 'text-emerald-600')}">
                  ${isMengerjakan ? 'Sedang Tes...' : `Nilai: ${h.nilai}`}
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}">
                  ${h.status_selesai} (${h.jumlah_pelanggaran}x Pelanggaran)
                </span>
              </div>
            `;
            logContainer.appendChild(div);
          });
        }
      }
    } catch (err) {
      console.error("[RekapModule] Error render dashboard:", err.message);
    }
  },

  renderDashboardPieChart(stats) {
    const canvas = document.getElementById('dashboard-pie-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.pieChartInstance) {
      this.pieChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    this.pieChartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: [
          `Sudah Selesai (${stats.selesai})`,
          `Sedang Mengerjakan (${stats.mengerjakan})`,
          `Belum Mulai (${stats.belumMulai})`,
          `Melanggar / Diskualifikasi (${stats.melanggar})`
        ],
        datasets: [{
          data: [stats.selesai, stats.mengerjakan, stats.belumMulai, stats.melanggar],
          backgroundColor: [
            '#10b981',
            '#3b82f6',
            '#94a3b8',
            '#f43f5e'
          ],
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { size: 11, family: 'Inter', weight: '600' },
              padding: 12,
              usePointStyle: true
            }
          }
        }
      }
    });
  },

  renderDashboardKelasBreakdown(activeSiswa, statusPerSiswa) {
    const container = document.getElementById('dashboard-kelas-breakdown');
    if (!container) return;

    const kelasMap = {};
    activeSiswa.forEach(s => {
      const k = String(s.kelas || 'Tanpa Kelas').trim();
      if (!kelasMap[k]) {
        kelasMap[k] = { total: 0, selesai: 0, mengerjakan: 0, belum: 0, melanggar: 0 };
      }
      kelasMap[k].total++;

      const keySiswa = String(s.id_siswa || s.nama).trim();
      const record = statusPerSiswa[keySiswa];

      if (record) {
        if (record.status_selesai === 'DIDISKUALIFIKASI' || Number(record.jumlah_pelanggaran) > 0) {
          kelasMap[k].melanggar++;
        }
        if (record.status_selesai === 'MENGERJAKAN') {
          kelasMap[k].mengerjakan++;
        } else if (record.status_selesai === 'SELESAI' || record.status_selesai === 'DIDISKUALIFIKASI') {
          kelasMap[k].selesai++;
        }
      } else {
        kelasMap[k].belum++;
      }
    });

    const sortedKelas = Object.keys(kelasMap).sort();

    if (sortedKelas.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 text-center p-4">Belum ada data kelas terdaftar.</p>`;
      return;
    }

    let html = `
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
            <th class="p-2.5">Kelas</th>
            <th class="p-2.5 text-center">Jml Siswa</th>
            <th class="p-2.5 text-center text-emerald-700">Selesai</th>
            <th class="p-2.5 text-center text-blue-700">Mengerjakan</th>
            <th class="p-2.5 text-center text-slate-600">Belum</th>
            <th class="p-2.5 text-center text-rose-700">Melanggar</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
    `;

    sortedKelas.forEach(k => {
      const d = kelasMap[k];
      html += `
        <tr class="hover:bg-slate-50">
          <td class="p-2.5 font-bold text-slate-800">${k}</td>
          <td class="p-2.5 text-center font-extrabold">${d.total}</td>
          <td class="p-2.5 text-center"><span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">${d.selesai}</span></td>
          <td class="p-2.5 text-center"><span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">${d.mengerjakan}</span></td>
          <td class="p-2.5 text-center"><span class="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded">${d.belum}</span></td>
          <td class="p-2.5 text-center"><span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded">${d.melanggar}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  },

  async renderRekapNilai() {
    const container = document.getElementById('rekap-table-container');
    if (!container) return;

    try {
      if (!State.siswaList || State.siswaList.length === 0) {
        State.siswaList = await DB.fetchSiswa();
      }

      let hasilList = await this.fetchAndNormalizeHasil();
      hasilList = hasilList.filter(h => h.status_selesai !== 'MENGERJAKAN');

      if (State.currentUser && State.currentUser.role === 'guru') {
        hasilList = hasilList.filter(h => this.isAllowedForCurrentUser(h.mapel, h.kelas));
      }

      // Gabungkan opsi kelas & mapel dari hasil ujian maupun profil guru agar Berita Acara & Daftar Hadir tetap bisa dicetak
      const kelasSet = new Set(hasilList.map(h => h.kelas).filter(Boolean));
      const mapelSet = new Set(hasilList.map(h => h.mapel).filter(Boolean));

      if (State.currentUser && State.currentUser.role === 'guru') {
        this.getGuruPairs().forEach(p => {
          if (p.mapel) mapelSet.add(p.mapel);
          if (p.kelas && p.kelas !== '*') kelasSet.add(p.kelas);
        });
      }

      let htmlControls = `
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-slate-50 rounded-xl border">
          <div class="flex flex-wrap items-center gap-2">
            <select id="rekap-filter-kelas" onchange="RekapModule.applyFilters()" class="border px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700">
              <option value="ALL">-- Semua Kelas --</option>
              ${Array.from(kelasSet).sort().map(k => `<option value="${k}">${k}</option>`).join('')}
            </select>
            <select id="rekap-filter-mapel" onchange="RekapModule.applyFilters()" class="border px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700">
              <option value="ALL">-- Semua Mapel --</option>
              ${Array.from(mapelSet).sort().map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <button type="button" onclick="RekapModule.printBeritaAcara()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition">
              📋 Berita Acara
            </button>
            <button type="button" onclick="RekapModule.printDaftarHadir()" class="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition">
              ✍️ Daftar Hadir
            </button>
          </div>
          <div class="text-xs text-slate-500 font-bold">
            Total Record: <span id="rekap-total-count" class="text-ocean-700 font-extrabold">${hasilList.length}</span> Siswa
          </div>
        </div>
        <div id="rekap-table-data"></div>
      `;

      container.innerHTML = htmlControls;
      this.currentHasilList = hasilList;
      this.applyFilters();

    } catch (err) {
      console.error("[RekapModule] Error render rekap:", err.message);
    }
  },

  applyFilters() {
    const containerData = document.getElementById('rekap-table-data');
    if (!containerData || !this.currentHasilList) return;

    const filterKelas = (document.getElementById('rekap-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('rekap-filter-mapel')?.value || 'ALL').trim();

    let filtered = this.currentHasilList;

    if (filterKelas !== 'ALL') {
      filtered = filtered.filter(h => String(h.kelas).trim().toUpperCase() === filterKelas.toUpperCase());
    }
    if (filterMapel !== 'ALL') {
      filtered = filtered.filter(h => String(h.mapel).trim().toUpperCase() === filterMapel.toUpperCase());
    }

    const countElem = document.getElementById('rekap-total-count');
    if (countElem) countElem.textContent = filtered.length;

    if (filtered.length === 0) {
      containerData.innerHTML = `
        <div class="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border">
          Tidak ada data hasil ujian yang sesuai dengan filter.
        </div>`;
      return;
    }

    let html = `
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
            <th class="p-3 text-center">NO</th>
            <th class="p-3">NAMA SISWA</th>
            <th class="p-3">KELAS</th>
            <th class="p-3">MATA PELAJARAN</th>
            <th class="p-3 text-center">NILAI AKHIR</th>
            <th class="p-3 text-center">PELANGGARAN</th>
            <th class="p-3 text-center">STATUS</th>
            <th class="p-3 text-center">AKSI</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
    `;

    filtered.forEach((h, idx) => {
      const safeNama = String(h.nama_siswa).replace(/'/g, "\\'");
      const safeMapel = String(h.mapel).replace(/'/g, "\\'");

      html += `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 text-center font-bold text-slate-500">${idx + 1}</td>
          <td class="p-3 font-bold text-slate-800">${h.nama_siswa}</td>
          <td class="p-3"><span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">${h.kelas}</span></td>
          <td class="p-3 font-semibold text-slate-700">${h.mapel}</td>
          <td class="p-3 text-center font-extrabold text-sm text-emerald-700">${h.nilai}</td>
          <td class="p-3 text-center"><span class="font-bold text-amber-700">${h.jumlah_pelanggaran}x</span></td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${h.status_selesai === 'DIDISKUALIFIKASI' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
              ${h.status_selesai}
            </span>
          </td>
          <td class="p-3 text-center">
            <button onclick="RekapModule.resetHasilSiswa(${h.id}, '${safeNama}', '${safeMapel}')" 
                    title="Reset & Izinkan Ujian Ulang"
                    class="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-rose-200 transition inline-flex items-center gap-1">
              <span>🔄 Reset</span>
            </button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    containerData.innerHTML = html;
  },

  async resetHasilSiswa(id, namaSiswa, mapel) {
    if (!id) {
      alert("ID hasil ujian tidak valid.");
      return;
    }

    const konfirmasi = confirm(
      `KONFIRMASI RESET UJIAN SISWA\n\n` +
      `Nama Siswa : ${namaSiswa}\n` +
      `Mata Ujian : ${mapel}\n\n` +
      `Nilai dan status selesai siswa ini akan DIHAPUS sehingga siswa dapat mengikuti ujian ulang dari awal.\n\n` +
      `Apakah Anda yakin ingin melanjutkan?`
    );

    if (!konfirmasi) return;

    try {
      await DB.deleteHasilUjian(id);
      alert(`Berhasil! Riwayat ujian "${namaSiswa}" untuk mapel "${mapel}" telah direset. Siswa kini dapat mengerjakan ujian ulang.`);
      
      await this.renderRekapNilai();
      await this.refreshMonitoringData();
    } catch (err) {
      alert("Gagal mereset hasil ujian: " + err.message);
    }
  },

  // --- HELPER: RESOLVE PENGAWAS / GURU PENGAMPU UNTUK DOKUMEN CETAK ---
  async resolvePenandatangan(filterMapel, filterKelas) {
    let namaGuruTtd = "Guru Mata Pelajaran";
    let nipGuruTtd = "-";

    if (State.currentUser && State.currentUser.role === 'guru') {
      return {
        nama: State.currentUser.nama_guru || namaGuruTtd,
        nip: State.currentUser.nip || nipGuruTtd
      };
    }

    try {
      const listGuru = await DB.fetchGuru();
      if (filterMapel !== 'ALL') {
        const targetM = filterMapel.toUpperCase();
        const foundG = listGuru.find(g => {
          const pairsG = typeof GuruModule !== 'undefined' ? GuruModule.getGuruPairs({ ...g, role: 'guru' }) : [];
          return pairsG.some(p =>
            p.mapel.toUpperCase() === targetM &&
            (filterKelas === 'ALL' || p.kelas === '*' || p.kelas.toUpperCase() === filterKelas.toUpperCase())
          );
        });
        if (foundG) {
          namaGuruTtd = foundG.nama_guru;
          nipGuruTtd = foundG.nip;
        }
      }
    } catch (e) {}

    return { nama: namaGuruTtd, nip: nipGuruTtd };
  },

  // --- CETAK BERITA ACARA PELAKSANAAN UJIAN ---
  async printBeritaAcara() {
    const filterKelas = (document.getElementById('rekap-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('rekap-filter-mapel')?.value || 'ALL').trim();

    if (filterKelas === 'ALL' || filterMapel === 'ALL') {
      alert("Silakan pilih spesifik Kelas dan Mata Pelajaran pada dropdown filter terlebih dahulu sebelum mencetak Berita Acara!");
      return;
    }

    const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();
    const pesertaKelas = siswaList.filter(s =>
      String(s.status).toLowerCase() === 'aktif' &&
      String(s.kelas).trim().toUpperCase() === filterKelas.toUpperCase()
    );

    const hasilList = await this.fetchAndNormalizeHasil();
    const hasilPaket = hasilList.filter(h =>
      String(h.kelas).trim().toUpperCase() === filterKelas.toUpperCase() &&
      String(h.mapel).trim().toUpperCase() === filterMapel.toUpperCase()
    );

    const hadirIds = new Set(hasilPaket.map(h => String(h.id_siswa || h.nisn || h.nama_siswa).trim().toUpperCase()));
    const tidakHadirList = pesertaKelas.filter(s => {
      const k1 = String(s.id_siswa || '').trim().toUpperCase();
      const k2 = String(s.nisn || s.NISN || '').trim().toUpperCase();
      const k3 = String(s.nama || '').trim().toUpperCase();
      return !hadirIds.has(k1) && !hadirIds.has(k2) && !hadirIds.has(k3);
    });

    const jmlTerdaftar = pesertaKelas.length;
    const jmlTidakHadir = tidakHadirList.length;
    const jmlHadir = Math.max(0, jmlTerdaftar - jmlTidakHadir);
    const pelanggarList = hasilPaket.filter(h => h.status_selesai === 'DIDISKUALIFIKASI' || Number(h.jumlah_pelanggaran) > 0);

    const ttd = await this.resolvePenandatangan(filterMapel, filterKelas);
    const kopUrl = "https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png";
    const now = new Date();
    const hariStr = now.toLocaleDateString('id-ID', { weekday: 'long' });
    const tglStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const tidakHadirText = tidakHadirList.length > 0
      ? tidakHadirList.map((s, i) => `${i + 1}. ${s.nama} (NISN: ${s.nisn || s.NISN || '-'})`).join('<br>')
      : 'Nihil (Seluruh peserta hadir mengikuti ujian)';

    const catatanPelanggaran = pelanggarList.length > 0
      ? `Terdapat ${pelanggarList.length} peserta tercatat melanggar tata tertib keamanan CBT (${pelanggarList.map(p => `${p.nama_siswa}: ${p.status_selesai}`).join('; ')}).`
      : 'Pelaksanaan ujian berjalan dengan tertib, aman, dan lancar tanpa kendala teknis yang berarti.';

    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>BERITA ACARA UJIAN - ${filterMapel} (${filterKelas})</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: 'Times New Roman', serif; color: #0f172a; font-size: 11.5pt; line-height: 1.5; }
        </style>
      </head>
      <body class="p-4 bg-white" onload="window.print()">
        <div class="mb-4 border-b-4 border-double border-slate-900 pb-2 text-center">
          <img src="${kopUrl}" alt="Kop Surat SMKN 1 Wakatobi" class="w-full max-h-32 object-contain mx-auto"
               onerror="this.style.display='none'; document.getElementById('fallback-ba').style.display='block';">
          <div id="fallback-ba" class="hidden text-center">
            <h1 class="font-bold text-sm uppercase">PEMERINTAH PROVINSI SULAWESI TENGGARA</h1>
            <h2 class="font-bold text-base uppercase">DINAS PENDIDIKAN DAN KEBUDAYAAN</h2>
            <h3 class="font-extrabold text-lg uppercase">SMK NEGERI 1 WAKATOBI</h3>
          </div>
        </div>

        <div class="text-center mb-5">
          <h4 class="font-bold text-sm uppercase underline tracking-wide">BERITA ACARA PELAKSANAAN UJIAN SUMATIF BERBASIS KOMPUTER (CBT)</h4>
          <p class="text-xs mt-0.5">Tahun Ajaran 2026/2027</p>
        </div>

        <p class="text-justify mb-3">
          Pada hari ini <strong>${hariStr}</strong> tanggal <strong>${tglStr}</strong>, telah diselenggarakan Ujian Sumatif Berbasis Komputer (<em>Computer Based Test</em>) di <strong>SMK Negeri 1 Wakatobi</strong> dengan rincian sebagai berikut:
        </p>

        <table class="w-full text-xs mb-4">
          <tr><td class="py-1 w-48">1. Satuan Pendidikan</td><td class="w-4">:</td><td class="font-bold">SMK Negeri 1 Wakatobi</td></tr>
          <tr><td class="py-1">2. Mata Pelajaran</td><td>:</td><td class="font-bold">${filterMapel}</td></tr>
          <tr><td class="py-1">3. Kelas / Rombel</td><td>:</td><td class="font-bold">${filterKelas}</td></tr>
          <tr><td class="py-1">4. Jumlah Peserta Terdaftar</td><td>:</td><td><strong>${jmlTerdaftar}</strong> orang</td></tr>
          <tr><td class="py-1">5. Jumlah Peserta Hadir</td><td>:</td><td><strong>${jmlHadir}</strong> orang</td></tr>
          <tr><td class="py-1">6. Jumlah Peserta Tidak Hadir</td><td>:</td><td><strong>${jmlTidakHadir}</strong> orang</td></tr>
        </table>

        <div class="mb-3">
          <p class="font-bold text-xs mb-1">Daftar Peserta Tidak Hadir:</p>
          <div class="border border-slate-400 rounded p-2.5 text-xs bg-slate-50">${tidakHadirText}</div>
        </div>

        <div class="mb-6">
          <p class="font-bold text-xs mb-1">Catatan Selama Pelaksanaan Ujian:</p>
          <div class="border border-slate-400 rounded p-2.5 text-xs min-h-[54px]">${catatanPelanggaran}</div>
        </div>

        <p class="text-justify text-xs mb-6">
          Demikian Berita Acara ini dibuat dengan sesungguhnya untuk dipergunakan sebagaimana mestinya.
        </p>

        <div class="flex justify-between items-end text-xs pt-2">
          <div class="text-left w-60">
            <p>Mengetahui,</p>
            <p class="font-bold">Plt. Kepala Sekolah</p>
            <div class="h-16"></div>
            <p class="font-bold underline">Abdul Kaharuddin, S.Pd.I.</p>
            <p>NIP. 197511222010011007</p>
          </div>
          <div class="text-left w-64">
            <p>Wangi-Wangi, ${tglStr}</p>
            <p class="font-bold">Pengawas Ruang / Guru Mapel</p>
            <div class="h-16"></div>
            <p class="font-bold underline">${ttd.nama}</p>
            <p>NIP. ${ttd.nip}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  },

  // --- CETAK DAFTAR HADIR PESERTA UJIAN ---
  async printDaftarHadir() {
    const filterKelas = (document.getElementById('rekap-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('rekap-filter-mapel')?.value || 'ALL').trim();

    if (filterKelas === 'ALL') {
      alert("Silakan pilih Kelas pada dropdown filter terlebih dahulu sebelum mencetak Daftar Hadir!");
      return;
    }

    const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();
    const pesertaKelas = siswaList
      .filter(s => String(s.status).toLowerCase() === 'aktif' && String(s.kelas).trim().toUpperCase() === filterKelas.toUpperCase())
      .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));

    if (pesertaKelas.length === 0) {
      alert(`Tidak ditemukan data siswa aktif pada kelas ${filterKelas}.`);
      return;
    }

    const hasilList = await this.fetchAndNormalizeHasil();
    const hasilPaket = hasilList.filter(h =>
      String(h.kelas).trim().toUpperCase() === filterKelas.toUpperCase() &&
      (filterMapel === 'ALL' || String(h.mapel).trim().toUpperCase() === filterMapel.toUpperCase())
    );

    const ttd = await this.resolvePenandatangan(filterMapel, filterKelas);
    const kopUrl = "https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png";
    const tglStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    let rowsHtml = '';
    pesertaKelas.forEach((s, idx) => {
      const k1 = String(s.id_siswa || '').trim().toUpperCase();
      const k2 = String(s.nisn || s.NISN || '').trim().toUpperCase();
      const k3 = String(s.nama || '').trim().toUpperCase();

      const rec = hasilPaket.find(h => {
        const hk = String(h.id_siswa || h.nisn || h.nama_siswa).trim().toUpperCase();
        return hk === k1 || hk === k2 || String(h.nama_siswa || '').trim().toUpperCase() === k3;
      });

      const ketStatus = rec ? `Hadir (${rec.status_selesai})` : 'Belum / Tidak Hadir';
      const ttdCell = idx % 2 === 0
        ? `<td class="p-2 border border-slate-400 text-left w-28">${idx + 1}. ..........</td><td class="p-2 border border-slate-400 w-28"></td>`
        : `<td class="p-2 border border-slate-400 w-28"></td><td class="p-2 border border-slate-400 text-left w-28">${idx + 1}. ..........</td>`;

      rowsHtml += `
        <tr>
          <td class="p-2 border border-slate-400 text-center font-bold">${idx + 1}</td>
          <td class="p-2 border border-slate-400 text-center font-mono">${s.nisn || s.NISN || '-'}</td>
          <td class="p-2 border border-slate-400 font-bold">${s.nama}</td>
          <td class="p-2 border border-slate-400 text-center text-[10px] font-semibold">${ketStatus}</td>
          ${ttdCell}
        </tr>
      `;
    });

    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>DAFTAR HADIR PESERTA UJIAN - ${filterKelas}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Inter', sans-serif; color: #0f172a; font-size: 10pt; }
        </style>
      </head>
      <body class="p-4 bg-white" onload="window.print()">
        <div class="mb-4 border-b-4 border-double border-slate-900 pb-2 text-center">
          <img src="${kopUrl}" alt="Kop Surat SMKN 1 Wakatobi" class="w-full max-h-32 object-contain mx-auto"
               onerror="this.style.display='none'; document.getElementById('fallback-dh').style.display='block';">
          <div id="fallback-dh" class="hidden text-center">
            <h1 class="font-extrabold text-sm uppercase">PEMERINTAH PROVINSI SULAWESI TENGGARA</h1>
            <h2 class="font-bold text-base uppercase">DINAS PENDIDIKAN DAN KEBUDAYAAN</h2>
            <h3 class="font-black text-lg uppercase">SMK NEGERI 1 WAKATOBI</h3>
          </div>
        </div>

        <div class="text-center mb-4">
          <h4 class="font-bold text-sm uppercase underline">DAFTAR HADIR PESERTA UJIAN SUMATIF BERBASIS KOMPUTER (CBT)</h4>
          <p class="text-xs text-slate-600 mt-1">
            Kelas: <strong>${filterKelas}</strong> | 
            Mata Pelajaran: <strong>${filterMapel === 'ALL' ? 'Semua Mata Pelajaran' : filterMapel}</strong> | 
            Tanggal: <strong>${tglStr}</strong>
          </p>
        </div>

        <table class="w-full text-left border-collapse border border-slate-400 text-xs mb-6">
          <thead>
            <tr class="bg-slate-100 text-[10px] font-bold uppercase text-center">
              <th class="p-2 border border-slate-400 w-10">NO</th>
              <th class="p-2 border border-slate-400 w-28">NISN</th>
              <th class="p-2 border border-slate-400">NAMA LENGKAP PESERTA</th>
              <th class="p-2 border border-slate-400 w-32">KETERANGAN CBT</th>
              <th class="p-2 border border-slate-400" colspan="2">TANDA TANGAN</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="flex justify-between items-end text-xs pt-2">
          <div class="text-left w-60">
            <p>Mengetahui,</p>
            <p class="font-bold">Plt. Kepala Sekolah</p>
            <div class="h-16"></div>
            <p class="font-bold underline">Abdul Kaharuddin, S.Pd.I.</p>
            <p class="text-[10px] text-slate-500">NIP. 197511222010011007</p>
          </div>
          <div class="text-left w-64">
            <p>Wangi-Wangi, ${tglStr}</p>
            <p class="font-bold">Pengawas Ruang / Guru Mapel</p>
            <div class="h-16"></div>
            <p class="font-bold underline">${ttd.nama}</p>
            <p class="text-[10px] text-slate-500">NIP. ${ttd.nip}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  },

  async exportPDF() {
    const filterKelas = (document.getElementById('rekap-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('rekap-filter-mapel')?.value || 'ALL').trim();

    let listToPrint = this.currentHasilList || await this.fetchAndNormalizeHasil();
    listToPrint = listToPrint.filter(h => h.status_selesai !== 'MENGERJAKAN');

    if (State.currentUser && State.currentUser.role === 'guru') {
      listToPrint = listToPrint.filter(h => this.isAllowedForCurrentUser(h.mapel, h.kelas));
    }

    if (filterKelas !== 'ALL') {
      listToPrint = listToPrint.filter(h => String(h.kelas).trim().toUpperCase() === filterKelas.toUpperCase());
    }
    if (filterMapel !== 'ALL') {
      listToPrint = listToPrint.filter(h => String(h.mapel).trim().toUpperCase() === filterMapel.toUpperCase());
    }

    if (listToPrint.length === 0) {
      alert("Tidak ada data hasil ujian yang dapat dicetak!");
      return;
    }

    const ttd = await this.resolvePenandatangan(filterMapel, filterKelas);
    const kopUrl = "https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png";
    const tglSekarang = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const printWindow = window.open('', '_blank');

    let printHtml = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>REKAPITULASI HASIL UJIAN CBT - SMKN 1 WAKATOBI</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: 'Inter', sans-serif; color: #1e293b; }
        </style>
      </head>
      <body class="p-4 bg-white" onload="window.print()">
        
        <div class="mb-4 border-b-4 border-double border-slate-800 pb-2 text-center">
          <img src="${kopUrl}" alt="Kop Surat SMKN 1 Wakatobi" class="w-full max-h-32 object-contain mx-auto" 
               onerror="this.style.display='none'; document.getElementById('fallback-header').style.display='block';">
          
          <div id="fallback-header" class="hidden text-center">
            <h1 class="font-extrabold text-sm uppercase text-slate-900 tracking-wide">PEMERINTAH PROVINSI SULAWESI TENGGARA</h1>
            <h2 class="font-bold text-base uppercase text-slate-900">DINAS PENDIDIKAN DAN KEBUDAYAAN</h2>
            <h3 class="font-black text-lg uppercase text-blue-900">SMK NEGERI 1 WAKATOBI</h3>
            <p class="text-[10px] text-slate-600 italic">Desa Numana, Kec. Wangi-Wangi Selatan, Kab. Wakatobi, Sulawesi Tenggara</p>
          </div>
        </div>

        <div class="text-center mb-4">
          <h4 class="font-bold text-sm uppercase underline">REKAPITULASI NILAI UJIAN SUMATIF COMPUTER BASED TEST (CBT)</h4>
          <p class="text-xs text-slate-600 mt-1">
            Mata Pelajaran: <strong>${filterMapel === 'ALL' ? 'Semua Mata Pelajaran' : filterMapel}</strong> | 
            Kelas: <strong>${filterKelas === 'ALL' ? 'Semua Kelas' : filterKelas}</strong>
          </p>
        </div>

        <table class="w-full text-left border-collapse border border-slate-300 text-xs mb-6">
          <thead>
            <tr class="bg-slate-100 text-[11px] font-bold text-slate-800 uppercase border-b border-slate-300">
              <th class="p-2 border border-slate-300 text-center w-8">NO</th>
              <th class="p-2 border border-slate-300 text-center">NAMA SISWA</th>
              <th class="p-2 border border-slate-300 text-center">NISN</th>
              <th class="p-2 border border-slate-300 text-center">NILAI AKHIR</th>
              <th class="p-2 border border-slate-300 text-center">STATUS</th>
            </tr>
          </thead>
          <tbody>
    `;

    listToPrint.forEach((h, idx) => {
      const nisnSiswa = h.nisn || h.NISN || h.siswa?.NISN || h.siswa?.nisn || '-';
      printHtml += `
        <tr class="border-b border-slate-200">
          <td class="p-2 border border-slate-300 text-center font-bold">${idx + 1}</td>
          <td class="p-2 border border-slate-300 font-bold">${h.nama_siswa}</td>
          <td class="p-2 border border-slate-300 text-center font-semibold">${nisnSiswa}</td>
          <td class="p-2 border border-slate-300 text-center font-extrabold text-sm">${h.nilai}</td>
          <td class="p-2 border border-slate-300 text-center font-bold text-[10px]">${h.status_selesai}</td>
        </tr>
      `;
    });

    printHtml += `
          </tbody>
        </table>

        <div class="flex justify-between items-end text-xs pt-4">
          <div class="text-left w-56">
            <p>Mengetahui,</p>
            <p class="font-bold">Plt. Kepala Sekolah</p>
            <div class="h-16"></div>
            <p class="font-bold underline">Abdul Kaharuddin, S.Pd.I.</p>
            <p class="text-[10px] text-slate-500">NIP. 197511222010011007</p>
          </div>

          <div class="text-left w-64">
            <p>Wangi-Wangi, ${tglSekarang}</p>
            <p class="font-bold">Guru Mata Pelajaran</p>
            <div class="h-16"></div>
            <p class="font-bold underline">${ttd.nama}</p>
            <p class="text-[10px] text-slate-500">NIP. ${ttd.nip}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printHtml);
    printWindow.document.close();
  }
};

window.RekapModule = RekapModule;
