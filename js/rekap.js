const RekapModule = {
  async refreshMonitoringData() {
    const container = document.getElementById('monitoring-list-container');
    if (!container) return;

    try {
      const hasilList = await DB.fetchHasilUjian();
      container.innerHTML = '';

      if (!hasilList || hasilList.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic p-4 text-center">Belum ada aktivitas ujian siswa yang tercatat saat ini.</p>`;
        return;
      }

      hasilList.forEach((h, idx) => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 border rounded-xl bg-slate-50 text-xs shadow-sm mb-2 hover:bg-blue-50 transition";
        div.innerHTML = `
          <div>
            <div class="font-bold text-slate-800">${h.nama_siswa} <span class="text-blue-700 font-semibold">(${h.kelas})</span></div>
            <div class="text-[11px] text-slate-500 mt-0.5">Mata Ujian: <strong>${h.mapel}</strong> | Waktu: ${new Date(h.waktu_selesai).toLocaleTimeString('id-ID')} WITA</div>
          </div>
          <div class="text-right">
            <div class="text-base font-extrabold ${h.status_selesai === 'DIDISKUALIFIKASI' ? 'text-rose-600' : 'text-emerald-600'}">
              Nilai: ${h.nilai}
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${h.status_selesai === 'DIDISKUALIFIKASI' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
              ${h.status_selesai} (${h.jumlah_pelanggaran} Pelanggaran)
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
      const hasilList = await DB.fetchHasilUjian();

      if (!hasilList || hasilList.length === 0) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
            <p class="font-bold">Belum ada hasil ujian yang tersimpan di Supabase.</p>
          </div>`;
        return;
      }

      let html = `
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
              <th class="p-3">No</th>
              <th class="p-3">Nama Siswa</th>
              <th class="p-3">Kelas</th>
              <th class="p-3">Mata Pelajaran</th>
              <th class="p-3 text-center">Nilai Akhir</th>
              <th class="p-3 text-center">Pelanggaran</th>
              <th class="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
      `;

      hasilList.forEach((h, idx) => {
        html += `
          <tr class="hover:bg-slate-50 transition">
            <td class="p-3 font-bold text-slate-500">${idx + 1}</td>
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
      container.innerHTML = html;
    } catch (err) {
      console.error("[RekapModule] Error render rekap:", err.message);
    }
  },

  async exportPDF() {
    window.print();
  }
};

window.RekapModule = RekapModule;
