const RekapModule = {
  pieChartInstance: null,

  async fetchAndNormalizeHasil() {
    try {
      const rawHasil = await DB.fetchHasilUjian();
      const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();

      return (rawHasil || []).map(h => {
        const idSiswaStr = String(h.id_siswa || h.ID_SISWA || h.nisn || h.NISN || '').trim();
        
        const profilSiswa = siswaList.find(s => 
          String(s.id_siswa).trim() === idSiswaStr || 
          String(s.nisn).trim() === idSiswaStr ||
          String(s.user).trim() === idSiswaStr
        );

        const namaFix = profilSiswa ? profilSiswa.nama : (h.nama_siswa || h.NAMA_SISWA || h.nama || '-');
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

  // --- DASHBOARD ANALITIK & GRAFIK PIZZA ---
  async refreshMonitoringData() {
    try {
      const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();
      State.siswaList = siswaList;

      let hasilList = await this.fetchAndNormalizeHasil();

      // Privilege Filter Guru jika login sebagai Guru
      if (State.currentUser && State.currentUser.role === 'guru') {
        const mapelGuru = String(State.currentUser.mapel_diampu || '').trim().toUpperCase();
        hasilList = hasilList.filter(h => 
          String(h.mapel).trim().toUpperCase().includes(mapelGuru) || 
          mapelGuru.includes(String(h.mapel).trim().toUpperCase())
        );
      }

      // 1. KALKULASI STATISTIK KESELURUHAN
      const activeSiswa = siswaList.filter(s => String(s.status).toLowerCase() === 'aktif');
      const totalSiswa = activeSiswa.length;

      let countSelesai = 0;
      let countMengerjakan = 0;
      let countMelanggar = 0;

      // Map status unik per siswa
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

      // 2. RENDER KARTU SUMMARY ATAS
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

      // 3. RENDER GRAFIK PIZZA (PIE CHART)
      this.renderDashboardPieChart({
        selesai: countSelesai,
        mengerjakan: countMengerjakan,
        belumMulai: countBelumMulai,
        melanggar: countMelanggar
      });

      // 4. RENDER RINCIAN JUMLAH SISWA PER KELAS
      this.renderDashboardKelasBreakdown(activeSiswa, statusPerSiswa);

      // 5. RENDER LOG AKTIVITAS TERKINI
      const logContainer = document.getElementById('monitoring-list-container');
      if (logContainer) {
        logContainer.innerHTML = '';
        if (!hasilList || hasilList.length === 0) {
          logContainer.innerHTML = `<p class="text-xs text-slate-500 italic p-4 text-center">Belum ada aktivitas ujian siswa yang tercatat saat ini.</p>`;
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
            '#10b981', // Emerald - Selesai
            '#3b82f6', // Blue - Mengerjakan
            '#94a3b8', // Slate - Belum Mulai
            '#f43f5e'  // Rose - Melanggar
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

    // Kelompokkan siswa berdasarkan kelas
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

  // --- REKAP NILAI & RESET PESERTA ---
  async renderRekapNilai() {
    const container = document.getElementById('rekap-table-container');
    if (!container) return;

    try {
      let hasilList = await this.fetchAndNormalizeHasil();

      // Hanya tampilkan yang sudah selesai/diskualifikasi pada tabel rekap nilai
      hasilList = hasilList.filter(h => h.status_selesai !== 'MENGERJAKAN');

      if (State.currentUser && State.currentUser.role === 'guru') {
        const mapelGuru = String(State.currentUser.mapel_diampu || '').trim().toUpperCase();
        hasilList = hasilList.filter(h => 
          String(h.mapel).trim().toUpperCase().includes(mapelGuru) || 
          mapelGuru.includes(String(h.mapel).trim().toUpperCase())
        );
      }

      if (!hasilList || hasilList.length === 0) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
            <p class="font-bold">Belum ada hasil ujian selesai yang tersimpan di Supabase.</p>
          </div>`;
        return;
      }

      let htmlControls = `
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-slate-50 rounded-xl border">
          <div class="flex gap-2">
            <select id="rekap-filter-kelas" onchange="RekapModule.applyFilters()" class="border px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700">
              <option value="ALL">-- Semua Kelas --</option>
              ${[...new Set(hasilList.map(h => h.kelas))].filter(Boolean).map(k => `<option value="${k}">${k}</option>`).join('')}
            </select>
            <select id="rekap-filter-mapel" onchange="RekapModule.applyFilters()" class="border px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700">
              <option value="ALL">-- Semua Mapel --</option>
              ${[...new Set(hasilList.map(h => h.mapel))].filter(Boolean).map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
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

  async exportPDF() {
    const filterKelas = (document.getElementById('rekap-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('rekap-filter-mapel')?.value || 'ALL').trim();

    let listToPrint = this.currentHasilList || await this.fetchAndNormalizeHasil();
    listToPrint = listToPrint.filter(h => h.status_selesai !== 'MENGERJAKAN');

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

    let namaGuruTtd = "Guru Mata Pelajaran";
    let nipGuruTtd = "-";

    try {
      const listGuru = await DB.fetchGuru();
      if (filterMapel !== 'ALL') {
        const foundG = listGuru.find(g => String(g.mapel_diampu).trim().toUpperCase() === filterMapel.toUpperCase());
        if (foundG) {
          namaGuruTtd = foundG.nama_guru;
          nipGuruTtd = foundG.nip;
        }
      } else if (State.currentUser && State.currentUser.role === 'guru') {
        namaGuruTtd = State.currentUser.nama_guru;
        nipGuruTtd = State.currentUser.nip;
      }
    } catch (e) {}

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
      const nisnSiswa = h.NISN || h.nisn || h.siswa?.NISN || h.siswa?.nisn || '-';
      printHtml += `
        <tr class="border-b border-slate-200">
          <td class="p-2 border border-slate-300 text-center font-bold">${idx + 1}</td>
          <td class="p-2 border border-slate-300 font-bold">${h.nama_siswa}</td>
          <td class="p-2 border border-slate-300 text-center font-semibold">${h.NISN}</td>
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
            <p class="font-bold underline">${namaGuruTtd}</p>
            <p class="text-[10px] text-slate-500">NIP. ${nipGuruTtd}</p>
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
