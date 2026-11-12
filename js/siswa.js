const SiswaModule = {
  async loadAndRender() {
    try {
      console.log("[SiswaModule] Menarik data siswa dari Supabase...");
      State.siswaList = await DB.fetchSiswa();
      console.log("[SiswaModule] Data siswa dimuat:", State.siswaList.length, "orang");
      this.renderTable();
    } catch (err) {
      console.error("[SiswaModule] Error render siswa:", err.message);
    }
  },

  renderTable() {
    const container = document.getElementById('siswa-list-container');
    if (!container) return;

    if (!State.siswaList || State.siswaList.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
          <p class="font-bold">Belum ada data siswa di database Supabase.</p>
          <p class="mt-1 text-slate-500">Pastikan tabel "siswa" di Supabase sudah terisi data.</p>
        </div>`;
      return;
    }

    let html = `
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
            <th class="p-3 text-center w-10">
              <input type="checkbox" onchange="SiswaModule.toggleSelectAll(this.checked)" class="rounded">
            </th>
            <th class="p-3">No</th>
            <th class="p-3">NISN / Username</th>
            <th class="p-3">Nama Siswa</th>
            <th class="p-3">Kelas</th>
            <th class="p-3">Password</th>
            <th class="p-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
    `;

    State.siswaList.forEach((s, idx) => {
      html += `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 text-center">
            <input type="checkbox" name="chk-siswa-kartu" value="${s.id_siswa}" class="chk-siswa-item rounded">
          </td>
          <td class="p-3 font-bold text-slate-500">${idx + 1}</td>
          <td class="p-3 font-mono font-bold text-ocean-800">${s.nisn}</td>
          <td class="p-3 font-bold text-slate-800">${s.nama}</td>
          <td class="p-3"><span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">${s.kelas}</span></td>
          <td class="p-3 font-mono text-slate-500">${s.pass || 'smk123'}</td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
              ${s.status || 'Aktif'}
            </span>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  },

  toggleSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.chk-siswa-item');
    checkboxes.forEach(cb => cb.checked = checked);
  },

  printSelectedKartu() {
    const selectedNodes = document.querySelectorAll('.chk-siswa-item:checked');
    const selectedIds = Array.from(selectedNodes).map(cb => cb.value);

    if (selectedIds.length === 0) {
      alert("Silakan centang minimal 1 siswa untuk mencetak kartu!");
      return;
    }

    const selectedSiswa = State.siswaList.filter(s => selectedIds.includes(String(s.id_siswa)));
    
    // Buka jendela cetak kartu baru
    const printWindow = window.open('', '_blank');
    let kartuHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cetak Kartu Ujian SMKN 1 Wakatobi</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4; margin: 10mm; }
          .card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        </style>
      </head>
      <body class="p-4 bg-white text-slate-800" onload="window.print()">
        <h2 class="text-center font-bold text-base mb-4 border-b pb-2">KARTU PESERTA UJIAN SUMATIF - SMKN 1 WAKATOBI</h2>
        <div class="card-grid">
    `;

    selectedSiswa.forEach(s => {
      kartuHtml += `
        <div class="border-2 border-slate-800 rounded-xl p-4 bg-slate-50 space-y-2 text-xs break-inside-avoid">
          <div class="flex items-center justify-between border-b border-slate-300 pb-2">
            <div class="font-bold text-sm text-blue-900">SMK NEGERI 1 WAKATOBI</div>
            <span class="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">KARTU PESERTA</span>
          </div>
          <div class="flex items-start gap-3 pt-1">
            <!-- Kotak Foto 3x4 di Samping Kiri -->
            <div class="w-16 h-20 shrink-0 border border-dashed border-slate-500 bg-white rounded flex flex-col items-center justify-center text-[9px] font-bold text-slate-400 text-center leading-tight">
              <span>FOTO</span>
              <span>3 x 4</span>
            </div>
            <!-- Identitas Peserta di Samping Kanan -->
            <div class="space-y-1 flex-1 min-w-0">
              <div class="flex"><span class="w-24 shrink-0 font-semibold">Nama Peserta</span><span class="mr-1">:</span><strong class="truncate">${s.nama}</strong></div>
              <div class="flex"><span class="w-24 shrink-0 font-semibold">NISN / User</span><span class="mr-1">:</span><strong class="font-mono text-blue-800">${s.nisn}</strong></div>
              <div class="flex"><span class="w-24 shrink-0 font-semibold">Kelas</span><span class="mr-1">:</span><strong>${s.kelas}</strong></div>
              <div class="flex"><span class="w-24 shrink-0 font-semibold">Password</span><span class="mr-1">:</span><strong class="font-mono text-emerald-700">${s.pass || 'smk123'}</strong></div>
            </div>
          </div>
        </div>
      `;
    });

    kartuHtml += `</div></body></html>`;
    printWindow.document.write(kartuHtml);
    printWindow.document.close();
  }
};

window.SiswaModule = SiswaModule;
