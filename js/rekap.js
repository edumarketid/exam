const RekapModule = {
  async fetchAndNormalizeHasil() {
    try {
      const rawHasil = await DB.fetchHasilUjian();
      const siswaList = State.siswaList && State.siswaList.length > 0 ? State.siswaList : await DB.fetchSiswa();

      return (rawHasil || []).map(h => {
        // Ambil ID siswa dari berbagai variasi kolom Supabase
        const idSiswaStr = String(h.id_siswa || h.ID_SISWA || h.nisn || h.NISN || '').trim();
        
        // Cari data profil siswa asli dari tabel siswa untuk mendapatkan nama & kelas presisi
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
        const statusFix = h.status_selesai || h.STATUS_SELESAI || 'SELESAI';
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

  async refreshMonitoringData() {
    const container = document.getElementById('monitoring-list-container');
    if (!container) return;

    try {
      const hasilList = await this.fetchAndNormalizeHasil();
      container.innerHTML = '';

      if (!hasilList || hasilList.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic p-4 text-center">Belum ada aktivitas ujian siswa yang tercatat saat ini.</p>`;
        return;
      }

      hasilList.forEach((h) => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 border rounded-xl bg-slate-50 text-xs shadow-sm mb-2 hover:bg-blue-50 transition";
        div.innerHTML = `
          <div>
            <div class="font-bold text-slate-800">${h.nama_siswa} <span class="text-ocean-700 font-semibold">(${h.kelas})</span></div>
            <div class="text-[11px] text-slate-500 mt-0.5">Mata Ujian: <strong>${h.mapel}</strong> | Waktu Selesai: ${new Date(h.waktu_selesai).toLocaleString('id-ID')} WITA</div>
          </div>
          <div class="text-right">
            <div class="text-base font-extrabold ${h.status_selesai === 'DIDISKUALIFIKASI' ? 'text-rose-600' : 'text-emerald-600'}">
              Nilai: ${h.nilai}
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${h.status_selesai === 'DIDISKUALIFIKASI' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
              ${h.status_selesai} (${h.jumlah_pelanggaran}x Pelanggaran)
            </span>
          </div>
        `;
        container.appendChild(div);
      });
    } catch (err) {
      console.error("[RekapModule] Error monitoring:", err.message);
    }
  },

  async renderRekapNilai() {
    const container = document.getElementById('rekap-table-container');
    if (!container) return;

    try {
      const hasilList = await this.fetchAndNormalizeHasil();

      if (!hasilList || hasilList.length === 0) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
            <p class="font-bold">Belum ada hasil ujian yang tersimpan di Supabase.</p>
          </div>`;
        return;
      }

      // Menyusun opsi filter kelas dan mapel secara dinamis
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
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
    `;

    filtered.forEach((h, idx) => {
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
        </tr>
      `;
    });

    html += `</tbody></table>`;
    containerData.innerHTML = html;
  },

  async exportPDF() {
    const filterKelas = (document.getElementById('rekap-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('rekap-filter-mapel')?.value || 'ALL').trim();

    let listToPrint = this.currentHasilList || await this.fetchAndNormalizeHasil();

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

    // Cari data guru pengampu jika ada
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

    // Membuat dokumen window print khusus dengan Kop Surat resmi sekolah
    const printWindow = window.open('', '_blank');
    const tglSekarang = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    let printHtml = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>REKAPITULASI HASIL UJIAN CBT - SMKN 1 WAKATOBI</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Inter', sans-serif; color: #1e293b; }
        </style>
      </head>
      <body class="p-4 bg-white" onload="window.print()">
        <!-- KOP SURAT RESMI SEKOLAH -->
        <div class="border-b-4 border-double border-slate-800 pb-3 mb-4 text-center">
          <h1 class="font-extrabold text-base uppercase text-slate-900 tracking-wide">PEMERINTAH PROVINSI SULAWESI TENGGARA</h1>
          <h2 class="font-bold text-lg uppercase text-slate-900">DINAS PENDIDIKAN DAN KEBUDAYAAN</h2>
          <h3 class="font-black text-xl uppercase text-blue-900">SMK NEGERI 1 WAKATOBI</h3>
          <p class="text-[11px] text-slate-600 italic mt-0.5">Desa Numana, Kec. Wangi-Wangi Selatan, Kab. Wakatobi, Sulawesi Tenggara</p>
        </div>

        <div class="text-center mb-4">
          <h4 class="font-bold text-sm uppercase underline">REKAPITULASI NILAI UJIAN SUMATIF COMPUTER BASED TEST (CBT)</h4>
          <p class="text-xs text-slate-600 mt-1">
            Mata Pelajaran: <strong>${filterMapel === 'ALL' ? 'Semua Mata Pelajaran' : filterMapel}</strong> | 
            Kelas: <strong>${filterKelas === 'ALL' ? 'Semua Kelas' : filterKelas}</strong>
          </p>
        </div>

        <!-- TABEL HASIL DENGAN NOMOR DAN KELAS LENGKAP -->
        <table class="w-full text-left border-collapse border border-slate-300 text-xs mb-6">
          <thead>
            <tr class="bg-slate-100 text-[11px] font-bold text-slate-800 uppercase border-b border-slate-300">
              <th class="p-2 border border-slate-300 text-center w-8">NO</th>
              <th class="p-2 border border-slate-300">NAMA SISWA</th>
              <th class="p-2 border border-slate-300 text-center">KELAS</th>
              <th class="p-2 border border-slate-300">MATA PELAJARAN</th>
              <th class="p-2 border border-slate-300 text-center">NILAI AKHIR</th>
              <th class="p-2 border border-slate-300 text-center">STATUS</th>
            </tr>
          </thead>
          <tbody>
    `;

    listToPrint.forEach((h, idx) => {
      printHtml += `
        <tr class="border-b border-slate-200">
          <td class="p-2 border border-slate-300 text-center font-bold">${idx + 1}</td>
          <td class="p-2 border border-slate-300 font-bold">${h.nama_siswa}</td>
          <td class="p-2 border border-slate-300 text-center font-semibold">${h.kelas}</td>
          <td class="p-2 border border-slate-300">${h.mapel}</td>
          <td class="p-2 border border-slate-300 text-center font-extrabold text-sm">${h.nilai}</td>
          <td class="p-2 border border-slate-300 text-center font-bold text-[10px]">${h.status_selesai}</td>
        </tr>
      `;
    });

    printHtml += `
          </tbody>
        </table>

        <!-- TANDA TANGAN RESMI -->
        <div class="flex justify-between items-end text-xs pt-4">
          <div class="text-center w-56">
            <p>Mengetahui,</p>
            <p class="font-bold">Proktor / Panitia CBT</p>
            <div class="h-16"></div>
            <p class="font-bold underline">TIM IT SMKN 1 Wakatobi</p>
            <p class="text-[10px] text-slate-500">NIP. -</p>
          </div>

          <div class="text-center w-64">
            <p>Wangi-Wangi Selatan, ${tglSekarang}</p>
            <p class="font-bold">Guru Mata Pelajaran / Pengampu</p>
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
