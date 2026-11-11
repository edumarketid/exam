const SoalModule = {
  async loadAndRender() {
    try {
      const rawQuestions = await DB.fetchBankSoal();
      State.questions = (rawQuestions || []).map(q => ({
        id: q.id || q.ID,
        mapel: q.mapel || q.MAPEL || q.nama_mapel || 'Lainnya',
        kelas: q.kelas || q.KELAS || 'Umum',
        soal_html: q.soal_html || q.SOAL_HTML || q.soal || '',
        opsi_a: q.opsi_a || q.OPSI_A || '',
        opsi_b: q.opsi_b || q.OPSI_B || '',
        opsi_c: q.opsi_c || q.OPSI_C || '',
        opsi_d: q.opsi_d || q.OPSI_D || '',
        opsi_e: q.opsi_e || q.OPSI_E || '',
        kunci_jawaban: q.kunci_jawaban || q.KUNCI_JAWABAN || 'A'
      }));

      this.renderBankSoalList();
    } catch (err) {
      console.error("[SoalModule] Error:", err.message);
    }
  },

  toggleSelectAllKelas(checked) {
    const checkboxes = document.querySelectorAll('input[name="upload-kelas-target"]');
    checkboxes.forEach(cb => cb.checked = checked);
  },

  async processHTMLUpload(e) {
    e.preventDefault();
    const mapel = document.getElementById('select-upload-mapel').value;
    const selectedKelasNodes = document.querySelectorAll('input[name="upload-kelas-target"]:checked');
    const selectedKelasList = Array.from(selectedKelasNodes).map(cb => cb.value);

    if (selectedKelasList.length === 0) {
      alert("Silakan centang minimal 1 kelas target!");
      return;
    }

    const fileInput = document.getElementById('file-html-input');
    const file = fileInput.files[0];
    const logBox = document.getElementById('upload-log');

    if (!file) return;

    logBox.classList.remove('hidden');
    logBox.textContent = `[INFO] Membaca file: ${file.name}...\n[INFO] Kelas Target: ${selectedKelasList.join(', ')}\n`;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const htmlText = event.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const soalElements = doc.querySelectorAll('.soal-item');
      if (soalElements.length === 0) {
        logBox.textContent += `[ERROR] tidak ditemukan div.soal-item!\n`;
        return;
      }

      const parsedQuestions = [];
      selectedKelasList.forEach((kelasTarget) => {
        soalElements.forEach((el) => {
          const kunci = el.getAttribute('data-kunci') || 'A';
          const kontenEl = el.querySelector('.soal-konten');
          const soalHtml = kontenEl ? kontenEl.innerHTML.trim() : el.innerHTML.trim();
          const opsiItems = el.querySelectorAll('.opsi-jawaban li');
          parsedQuestions.push({
            mapel: mapel,
            kelas: kelasTarget,
            soal_html: soalHtml,
            opsi_a: opsiItems[0] ? opsiItems[0].innerHTML.trim() : '',
            opsi_b: opsiItems[1] ? opsiItems[1].innerHTML.trim() : '',
            opsi_c: opsiItems[2] ? opsiItems[2].innerHTML.trim() : '',
            opsi_d: opsiItems[3] ? opsiItems[3].innerHTML.trim() : '',
            opsi_e: opsiItems[4] ? opsiItems[4].innerHTML.trim() : '',
            kunci_jawaban: kunci.toUpperCase()
          });
        });
      });

      const client = await DB.getClient();
      if (client) {
        const { error } = await client.from('bank_soal').insert(parsedQuestions);
        if (!error) {
          alert(`Berhasil upload ${parsedQuestions.length} baris soal ke Supabase!`);
          await this.loadAndRender();
        } else {
          alert(`Gagal upload: ${error.message}`);
        }
      }
    };
    reader.readAsText(file);
  },

  toggleAccordionMapel(mapelKey) {
    State.openAccordionMapel[mapelKey] = !State.openAccordionMapel[mapelKey];
    this.renderBankSoalList();
  },

  renderBankSoalList() {
    const container = document.getElementById('bank-soal-list');
    const filterKelas = (document.getElementById('bank-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('bank-filter-mapel')?.value || 'ALL').trim();
    if (!container) return;

    container.innerHTML = '';
    let filtered = State.questions || [];

    if (filterKelas !== 'ALL') filtered = filtered.filter(q => String(q.kelas).trim().toUpperCase() === filterKelas.toUpperCase());
    if (filterMapel !== 'ALL') filtered = filtered.filter(q => String(q.mapel).trim().toUpperCase() === filterMapel.toUpperCase());

    if (filtered.length === 0) {
      container.innerHTML = `<div class="text-xs text-amber-700 bg-amber-50 border p-4 rounded text-center">Tidak ada soal yang cocok dengan filter saat ini.</div>`;
      return;
    }

    const groupedByMapel = {};
    filtered.forEach(q => {
      if (!groupedByMapel[q.mapel]) groupedByMapel[q.mapel] = [];
      groupedByMapel[q.mapel].push(q);
    });

    Object.keys(groupedByMapel).forEach((mapelName) => {
      const mapelQuestions = groupedByMapel[mapelName];
      const isOpen = State.openAccordionMapel[mapelName] !== false;
      const daftarKelasUnique = [...new Set(mapelQuestions.map(q => q.kelas))].join(', ');

      const mapelCard = document.createElement('div');
      mapelCard.className = "border rounded-lg bg-white overflow-hidden shadow-sm mb-3";
      mapelCard.innerHTML = `
        <div class="p-4 bg-gray-50 flex justify-between items-center border-b">
          <div onclick="SoalModule.toggleAccordionMapel('${mapelName.replace(/'/g, "\\'")}')" class="flex items-center gap-3 cursor-pointer flex-grow">
            <div class="w-8 h-8 rounded bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
              ${isOpen ? '▼' : '►'}
            </div>
            <div>
              <h4 class="font-bold text-sm text-gray-800">${mapelName}</h4>
              <p class="text-[11px] text-gray-500">Target Kelas: <strong class="text-blue-800">${daftarKelasUnique}</strong> | Total: <strong class="text-emerald-700">${mapelQuestions.length} Soal</strong></p>
            </div>
          </div>
          <button onclick="SoalModule.deleteSoalByMapel('${mapelName.replace(/'/g, "\\'")}')" class="bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded">Hapus Mapel Ini</button>
        </div>
        <div class="${isOpen ? 'block' : 'hidden'} p-4 space-y-4 bg-white">
          ${mapelQuestions.map((q, idx) => `
            <div class="border p-3 rounded bg-gray-50 text-xs space-y-2">
              <div class="flex justify-between border-b pb-1 font-bold">
                <span class="text-blue-800">[Kelas: ${q.kelas}]</span>
                <span class="text-emerald-800">Kunci: ${q.kunci_jawaban}</span>
              </div>
              <div>${q.soal_html}</div>
              <div class="grid grid-cols-2 gap-1 font-sans text-gray-700 pt-1">
                <div>A. ${q.opsi_a}</div><div>B. ${q.opsi_b}</div>
                <div>C. ${q.opsi_c}</div><div>D. ${q.opsi_d}</div>
                <div class="col-span-2">E. ${q.opsi_e}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      container.appendChild(mapelCard);
    });
  },

  async deleteSoalByMapel(mapelName) {
    if (!confirm(`Hapus seluruh soal mapel "${mapelName}"?`)) return;
    const client = await DB.getClient();
    if (client) {
      await client.from('bank_soal').delete().eq('mapel', mapelName);
      await this.loadAndRender();
    }
  },

  printNaskahSoalArsip() {
    const filterKelas = document.getElementById('bank-filter-kelas').value;
    const filterMapel = document.getElementById('bank-filter-mapel').value;
    const container = document.getElementById('print-soal-content-container');
    if (!container) return;

    container.innerHTML = '';
    let filtered = State.questions || [];

    if (filterKelas !== 'ALL') filtered = filtered.filter(q => q.kelas === filterKelas);
    if (filterMapel !== 'ALL') filtered = filtered.filter(q => q.mapel === filterMapel);

    document.getElementById('print-soal-meta').textContent = `Mata Pelajaran: ${filterMapel} | Kelas Target: ${filterKelas} | Alokasi Waktu: 45 Menit`;

    filtered.forEach((q, idx) => {
      const item = document.createElement('div');
      item.className = "border-b pb-4 space-y-2";
      item.innerHTML = `
        <div class="flex gap-2 font-bold">
          <span>${idx + 1}.</span>
          <div>${q.soal_html}</div>
        </div>
        <div class="pl-5 space-y-1">
          <div>A. ${q.opsi_a}</div><div>B. ${q.opsi_b}</div>
          <div>C. ${q.opsi_c}</div><div>D. ${q.opsi_d}</div>
          <div>E. ${q.opsi_e}</div>
        </div>
      `;
      container.appendChild(item);
    });

    window.print();
  }
};

window.SoalModule = SoalModule;
