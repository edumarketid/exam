const RekapModule = {
  async refreshMonitoringData() {
    try {
      State.hasilUjianList = await DB.fetchHasilUjian();
      this.renderMonitoringTable();
    } catch (err) {
      console.error("[RekapModule] Error:", err.message);
    }
  },

  renderMonitoringTable() {
    const tbody = document.getElementById('monitoring-tbody');
    const filterKelas = document.getElementById('monitoring-filter-kelas')?.value || 'ALL';
    const filterStatus = document.getElementById('monitoring-filter-status')?.value || 'ALL';
    if (!tbody) return;

    tbody.innerHTML = '';
    let countBelum = 0, countSelesai = 0, countKecurangan = 0;

    let filteredStudents = State.students || [];
    if (filterKelas !== 'ALL') filteredStudents = filteredStudents.filter(s => s.kelas === filterKelas);

    let rowNo = 1;
    filteredStudents.forEach((s) => {
      const hasil = (State.hasilUjianList || []).find(h => h.ID_SISWA === s.id_siswa);
      let statusTag = '<span class="px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-700">Belum Mulai</span>';
      let statusCategory = 'BELUM';

      if (hasil) {
        if (hasil.status_selesai === 'DIDISKUALIFIKASI' || hasil.jumlah_pelanggaran >= 2) {
          statusCategory = 'KECURANGAN';
          countKecurangan++;
          statusTag = `<span class="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">Kecurangan</span>`;
        } else {
          statusCategory = 'SELESAI';
          countSelesai++;
          statusTag = `<span class="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Selesai</span>`;
        }
      } else {
        countBelum++;
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
        <td class="border p-2 text-center font-bold">${hasil?.jumlah_pelanggaran || 0}</td>
        <td class="border p-2 text-center font-bold text-blue-700">${hasil ? hasil.nilai : '-'}</td>
        <td class="border p-2 text-center">
          ${hasil ? `<button onclick="RekapModule.resetJawabanSiswa('${s.id_siswa}', '${s.nama}')" class="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded">Reset</button>` : '-'}
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('count-stat-belum').textContent = countBelum;
    document.getElementById('count-stat-kecurangan').textContent = countKecurangan;
    document.getElementById('count-stat-selesai').textContent = countSelesai;
  },

  async resetJawabanSiswa(idSiswa, namaSiswa) {
    if (!confirm(`Hapus riwayat ujian "${namaSiswa}"?`)) return;
    const client = await DB.getClient();
    if (client) {
      await client.from('hasil_ujian').delete().eq('ID_SISWA', idSiswa);
      await this.refreshMonitoringData();
      this.renderRekapNilai();
    }
  },

  renderRekapNilai() {
    const tbody = document.getElementById('rekap-nilai-tbody');
    const filterKelas = document.getElementById('rekap-filter-kelas')?.value || 'ALL';
    const filterMapel = document.getElementById('rekap-filter-mapel')?.value || 'ALL';
    if (!tbody) return;

    tbody.innerHTML = '';
    let filtered = State.hasilUjianList || [];
    if (filterMapel !== 'ALL') filtered = filtered.filter(h => h.mapel === filterMapel);

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-gray-500 italic">Belum ada rekap nilai.</td></tr>`;
      return;
    }

    let no = 1;
    filtered.forEach(h => {
      const student = (State.students || []).find(s => s.id_siswa === h.ID_SISWA) || { nama: 'Siswa', nisn: '-', kelas: '-' };
      if (filterKelas !== 'ALL' && student.kelas !== filterKelas) return;

      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 border-b";
      tr.innerHTML = `
        <td class="border p-2 text-center">${no++}</td>
        <td class="border p-2 font-mono">${student.nisn}</td>
        <td class="border p-2 font-bold">${student.nama}</td>
        <td class="border p-2 text-center font-bold">${student.kelas}</td>
        <td class="border p-2">${h.mapel}</td>
        <td class="border p-2 text-center font-bold text-emerald-700">${h.nilai || 0}</td>
        <td class="border p-2 text-center">${h.jumlah_pelanggaran || 0}</td>
        <td class="border p-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${h.status_selesai}</span></td>
        <td class="border p-2 text-gray-500 text-[10px]">${new Date(h.waktu_selesai).toLocaleString('id-ID')}</td>
        <td class="border p-2 text-center print:hidden"><button onclick="RekapModule.resetJawabanSiswa('${student.id_siswa}', '${student.nama}')" class="bg-red-600 text-white text-[10px] px-2 py-1 rounded">Reset</button></td>
      `;
      tbody.appendChild(tr);
    });
  },

  printHasilUjian() {
    const filterKelas = document.getElementById('rekap-filter-kelas').value;
    const filterMapel = document.getElementById('rekap-filter-mapel').value;
    document.getElementById('print-meta-info').textContent = `Mata Pelajaran: ${filterMapel} | Kelas: ${filterKelas}`;
    document.getElementById('print-date').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    window.print();
  }
};

window.RekapModule = RekapModule;
