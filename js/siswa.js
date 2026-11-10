const SiswaModule = {
  async loadAndRender() {
    try {
      console.log("[SiswaModule] Menarik data siswa dari Supabase...");
      State.students = await DB.fetchSiswa();
      console.log("[SiswaModule] Data siswa diterima:", State.students.length, "orang");

      if (State.students.length > 0) {
        State.kelasOptions = [...new Set(State.students.map(item => item.kelas))].filter(Boolean);
      }
      
      this.populateKelasDropdowns();
      this.renderCards();
    } catch (err) {
      console.error("[SiswaModule] Error saat render siswa:", err.message);
    }
  },

  populateKelasDropdowns() {
    const selectKelasJadwal = document.getElementById('jadwal-kelas');
    const selectKelasKartu = document.getElementById('filter-kelas-kartu');
    const selectKelasRekap = document.getElementById('rekap-filter-kelas');
    const selectKelasMon = document.getElementById('monitoring-filter-kelas');
    const selectKelasBank = document.getElementById('bank-filter-kelas');

    if (!State.kelasOptions || State.kelasOptions.length === 0) return;

    const kelasOpts = State.kelasOptions.map(k => `<option value="${k}">${k}</option>`).join('');
    if (selectKelasJadwal) selectKelasJadwal.innerHTML = kelasOpts;
    if (selectKelasKartu) selectKelasKartu.innerHTML = `<option value="ALL">Semua Kelas</option>` + kelasOpts;
    if (selectKelasRekap) selectKelasRekap.innerHTML = `<option value="ALL">Semua Kelas</option>` + kelasOpts;
    if (selectKelasMon) selectKelasMon.innerHTML = `<option value="ALL">Semua Kelas Target</option>` + kelasOpts;
    if (selectKelasBank) selectKelasBank.innerHTML = `<option value="ALL">Semua Kelas</option>` + kelasOpts;

    const containerKelasCheckbox = document.getElementById('container-upload-kelas-checkboxes');
    if (containerKelasCheckbox) {
      containerKelasCheckbox.innerHTML = State.kelasOptions.map(k => `
        <label class="flex items-center gap-2 text-xs font-medium cursor-pointer bg-white p-1.5 border rounded hover:bg-blue-50 transition">
          <input type="checkbox" name="upload-kelas-target" value="${k}" class="rounded text-blue-600 focus:ring-blue-500">
          <span>${k}</span>
        </label>
      `).join('');
    }
  },

  renderCards() {
    const container = document.getElementById('cards-container');
    const filterKelas = document.getElementById('filter-kelas-kartu')?.value || 'ALL';
    if (!container) return;
    container.innerHTML = '';

    if (!State.students || State.students.length === 0) {
      container.innerHTML = `<p class="text-xs text-amber-600 italic col-span-2 text-center p-4">Belum ada data siswa di Supabase.</p>`;
      return;
    }

    const filtered = filterKelas === 'ALL' ? State.students : State.students.filter(s => s.kelas === filterKelas);

    filtered.forEach((s) => {
      const card = document.createElement('div');
      card.className = "border-2 border-blue-800 rounded-lg p-4 bg-white shadow-sm space-y-3 relative overflow-hidden";
      card.innerHTML = `
        <div class="flex items-center justify-between border-b-2 border-blue-800 pb-2">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-blue-700 text-white font-bold text-xs flex items-center justify-center rounded">CBT</div>
            <div>
              <h4 class="font-bold text-xs leading-tight text-blue-900">KARTU PESERTA UJIAN SUMATIF</h4>
              <p class="text-[10px] text-gray-500">SMK Negeri 1 Wakatobi - TA 2026/2027</p>
            </div>
          </div>
          <span class="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">${s.kelas}</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs">
          <div class="col-span-2 space-y-1">
            <div><span class="text-gray-500 text-[10px] block">Nama Peserta:</span><strong class="text-gray-800">${s.nama}</strong></div>
            <div><span class="text-gray-500 text-[10px] block">NISN / TTL:</span><span>${s.nisn} / ${s.ttl}</span></div>
            <div class="pt-1 flex gap-4">
              <div><span class="text-gray-500 text-[10px] block">Username:</span><code class="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded font-bold">${s.user}</code></div>
              <div><span class="text-gray-500 text-[10px] block">Password:</span><code class="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded font-bold">${s.pass}</code></div>
            </div>
          </div>
          <div class="flex flex-col items-center justify-center border-l pl-2">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${s.nisn}" alt="QR" class="w-16 h-16 border p-0.5 rounded">
            <span class="text-[9px] text-gray-400 mt-1">${s.id_siswa}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  },

  printCards() { window.print(); }
};

// WAJIB: Daftarkan ke window agar bisa dipanggil app.js
window.SiswaModule = SiswaModule;
