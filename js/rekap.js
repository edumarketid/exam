const RekapModule = {
  async refreshMonitoringData() {
    State.hasilUjianList = await DB.fetchHasilUjian();
    this.renderMonitoringTable();
  },

  filterMonitoringStatus(statusKey) {
    const select = document.getElementById('monitoring-filter-status');
    if (select) {
      select.value = statusKey;
      this.renderMonitoringTable();
    }
  },

  renderMonitoringTable() {
    const tbody = document.getElementById('monitoring-tbody');
    const filterKelas = document.getElementById('monitoring-filter-kelas')?.value || 'ALL';
    const filterStatus = document.getElementById('monitoring-filter-status')?.value || 'ALL';
    if (!tbody) return;

    tbody.innerHTML = '';

    let countBelum = 0;
    let countKerjakan = 0;
    let countKecurangan = 0;
    let countSelesai = 0;

    let filteredStudents = State.students;
    if (filterKelas !== 'ALL') {
      filteredStudents = filteredStudents.filter(s => s.kelas === filterKelas);
    }

    let rowNo = 1;

    filteredStudents.forEach((s) => {
      const hasil = State.hasilUjianList.find(h => h.ID_SISWA === s.id_siswa);
      let statusTag = '';
      let statusCategory = 'BELUM';

      if (hasil) {
        if (hasil.status_selesai === 'DIDISKUALIFIKASI' || hasil.jumlah_pelanggaran >= 2) {
          statusCategory = 'KECURANGAN';
          countKecurangan++;
          statusTag = `<span class="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">Melakukan Kecurangan</span>`;
        } else if (hasil.status_selesai === 'SELESAI') {
          statusCategory = 'SELESAI';
          countSelesai++;
          statusTag = `<span class="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Sudah Selesai</span>`;
        }
      } else {
        statusCategory = 'BELUM';
        countBelum++;
        statusTag = `<span class="px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-700">Belum Mulai</span>`;
      }

      if (filterStatus !== 'ALL' && filterStatus !== statusCategory) return;

      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 border-b";
      tr.innerHTML = `
        <td class="border p-2 text-center">${rowNo++}</td>
        <td class="border p-2 font-mono">${s.nisn}</td>
        <td class="border p-2 font-bold">${s.nama}</td>
        <td class="border p-2 text-center font-bold">${s.kelas}</td>
        <td class="border p-2 text-center">${statusTag}</td>
        <td class="border p-2 text-center font-bold ${hasil?.jumlah_pelanggaran > 0 ? 'text-red-600' : 'text-gray-500'}">${hasil?.jumlah_pelanggaran || 0}</td>
        <td class="border p-2 text-center font-bold text-blue-700">${hasil ? hasil.nilai : '-'}</td>
        <td class="border p-2 text-center">
          ${hasil ? `
            <button onclick="RekapModule.resetJawabanSiswa('${s.id_siswa}', '${s.nama}')" class="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2.5 py-1 rounded transition">
              Reset / Hapus Jawaban
            </button>
          ` : `<span class="text-gray-400 text-[10px] italic">Tidak ada aksi</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('count-stat-belum').textContent = countBelum;
    document.getElementById('count-stat-kerjakan').textContent = countKerjakan;
    document.getElementById('count-stat-kecurangan').textContent = countKecurangan;
    document.getElementById('count-stat-selesai').textContent = countSelesai;
  },

  async resetJawabanSiswa(idSiswa, namaSiswa) {
    if (!confirm(`HAPUS JAWABAN SISWA?\n\nApakah Anda yakin ingin menghapus seluruh riwayat jawaban & diskualifikasi untuk siswa: "${namaSiswa}"?`)) return;

    const client = await DB.getClient();
    if (client) {
      try {
        const { error } = await client.from('hasil_ujian').delete().eq('ID_SISWA', idSiswa);
        if (error) throw error;
        alert(`Jawaban siswa "${namaSiswa}" berhasil dihapus dari database.`);
        await this.refreshMonitoringData();
        this.renderRekapNilai();
      } catch (err) {
        alert(`Gagal menghapus jawaban: ${err.message}`);
      }
    }
  },

  renderRekapNilai() {
    const tbody = document.getElementById('rekap-nilai-tbody');
    const filterKelas = document.getElementById('rekap-filter-kelas')?.value || 'ALL';
    const filterMapel = document.getElementById('rekap-filter-mapel')?.value || 'ALL';
    if (!tbody) return;

    tbody.innerHTML = '';
    let filtered = State.hasilUjianList;

    if (filterMapel !== 'ALL') {
      filtered = filtered.filter(h => h.mapel === filterMapel);
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-gray-500 italic">Belum ada data rekap nilai ujian.</td></tr>`;
      return;
    }

    let no = 1;
    filtered.forEach(h => {
      const student = State.students.find(s => s.id_siswa === h.ID_SISWA) || { nama: 'Siswa', nisn: '-', kelas: '-' };
      if (filterKelas !== 'ALL' && student.kelas !== filterKelas) return;

      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 border-b";
      tr.innerHTML = `
        <td class="border p-2 text-center">${no++}</td>
        <td class="border p-2 font-mono">${student.nisn}</td>
        <td class="border p-2 font-bold">${student.nama}</td>
        <td class="border p-2 text-center font-bold">${student.kelas}</td>
        <td class="border p-2">${h.mapel}</td>
        <td class="border p-2 text-center font-bold ${h.nilai >= 75 ? 'text-emerald-700' : 'text-red-600'}">${h.nilai || 0}</td>
        <td class="border p-2 text-center font-bold ${h.jumlah_pelanggaran > 0 ? 'text-red-600' : 'text-gray-600'}">${h.jumlah_pelanggaran || 0}</td>
        <td class="border p-2 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${h.status_selesai === 'DIDISKUALIFIKASI' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}">
            ${h.status_selesai}
          </span>
        </td>
        <td class="border p-2 text-gray-500 text-[10px]">${new Date(h.waktu_selesai).toLocaleString('id-ID')}</td>
        <td class="border p-2 text-center print:hidden">
          <button onclick="RekapModule.resetJawabanSiswa('${student.id_siswa}', '${student.nama}')" class="bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold">
            Reset
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

   printHasilUjian() {
    const filterKelas = document.getElementById('rekap-filter-kelas').value;
    const filterMapel = document.getElementById('rekap-filter-mapel').value;
    
    // Update Judul & Informasi Meta Cetak Nilai
    const titleElem = document.getElementById('print-doc-title');
    if (titleElem) {
      titleElem.textContent = "DAFTAR HASIL PENILAIAN SUMATIF SEMESTER GANJIL T.A. 2026/2027";
    }
    
    document.getElementById('print-meta-info').textContent = `Mata Pelajaran: ${filterMapel} | Kelas: ${filterKelas}`;
    document.getElementById('print-date').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    window.print();
  }
};
