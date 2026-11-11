const SoalModule = {
  async loadAndRender() {
    try {
      console.log("[SoalModule] Menarik data Bank Soal dari Supabase...");
      const rawBank = await DB.fetchBankSoal();
      
      // Normalisasi data dari berbagai variasi nama kolom Supabase
      State.questions = (rawBank || []).map(q => ({
        id: q.id || q.ID,
        mapel: String(q.mapel || q.MAPEL || q.nama_mapel || q.NAMA_MAPEL || '-').trim(),
        kelas: String(q.kelas || q.KELAS || '-').trim(),
        soal_html: q.soal_html || q.SOAL_HTML || q.soal || q.SOAL || '',
        opsi_a: q.opsi_a || q.OPSI_A || '',
        opsi_b: q.opsi_b || q.OPSI_B || '',
        opsi_c: q.opsi_c || q.OPSI_C || '',
        opsi_d: q.opsi_d || q.OPSI_D || '',
        opsi_e: q.opsi_e || q.OPSI_E || '',
        kunci_jawaban: String(q.kunci_jawaban || q.KUNCI_JAWABAN || 'A').trim().toUpperCase()
      }));

      console.log("[SoalModule] Bank Soal berhasil dimuat:", State.questions.length, "butir");
      
      this.populateFilterDropdowns();
      this.renderBankSoalList();
    } catch (err) {
      console.error("[SoalModule] Error load bank soal:", err.message);
    }
  },

  populateFilterDropdowns() {
    const filterMapel = document.getElementById('bank-filter-mapel');
    const filterKelas = document.getElementById('bank-filter-kelas');

    if (filterMapel) {
      const listMapel = [...new Set(State.questions.map(q => q.mapel))].filter(Boolean);
      let optHtml = `<option value="ALL">-- Semua Mapel --</option>`;
      listMapel.forEach(m => {
        optHtml += `<option value="${m}">${m}</option>`;
      });
      filterMapel.innerHTML = optHtml;
    }

    if (filterKelas) {
      const listKelasRaw = State.questions.map(q => q.kelas).join(',').split(',');
      const listKelas = [...new Set(listKelasRaw.map(k => k.trim()))].filter(Boolean);
      let optHtml = `<option value="ALL">-- Semua Kelas --</option>`;
      listKelas.forEach(k => {
        optHtml += `<option value="${k}">${k}</option>`;
      });
      filterKelas.innerHTML = optHtml;
    }
  },

  renderBankSoalList() {
    const container = document.getElementById('bank-soal-list');
    if (!container) return;

    const filterKelas = (document.getElementById('bank-filter-kelas')?.value || 'ALL').trim().toUpperCase();
    const filterMapel = (document.getElementById('bank-filter-mapel')?.value || 'ALL').trim().toUpperCase();

    container.innerHTML = '';
    let filtered = State.questions || [];

    // PRIVILEGE FILTER: Jika login sebagai GURU, filter hanya mapel diampunya
    if (State.currentUser && State.currentUser.role === 'guru') {
      const mapelGuru = String(State.currentUser.mapel_diampu || '').trim().toUpperCase();
      filtered = filtered.filter(q => 
        String(q.mapel).trim().toUpperCase().includes(mapelGuru) || 
        mapelGuru.includes(String(q.mapel).trim().toUpperCase())
      );
    }

    // Filter Dropdown Tampilan
    if (filterKelas !== 'ALL') {
      filtered = filtered.filter(q => {
        const kList = String(q.kelas).toUpperCase().split(',').map(k => k.trim());
        return kList.includes(filterKelas);
      });
    }

    if (filterMapel !== 'ALL') {
      filtered = filtered.filter(q => String(q.mapel).trim().toUpperCase() === filterMapel);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
          <p class="font-bold">Tidak ada naskah soal yang ditemukan.</p>
          <p class="mt-1 text-slate-500">Pastikan soal sudah diunggah atau sesuaikan filter Mapel & Kelas di atas.</p>
        </div>`;
      return;
    }

    filtered.forEach((q, idx) => {
      // Membuat preview ringkasan teks soal tanpa tag HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = q.soal_html;
      const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim();
      const snippetText = plainText.length > 70 ? plainText.substring(0, 70) + '...' : plainText;

      const div = document.createElement('div');
      div.className = "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition hover:border-ocean-300";
      
      div.innerHTML = `
        <!-- HEADER ROW (ACCORDION TOGGLE) -->
        <div class="p-4 bg-slate-50/70 flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 cursor-pointer" onclick="SoalModule.toggleSoalDetail(${q.id})">
          <div class="flex items-center space-x-2.5 flex-1 min-w-0">
            <span class="bg-ocean-700 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg">#${idx + 1}</span>
            <span class="bg-ocean-50 text-ocean-800 font-bold text-xs px-2.5 py-1 rounded-lg border border-ocean-200 truncate">${q.mapel}</span>
            <span class="bg-purple-50 text-purple-800 font-bold text-xs px-2.5 py-1 rounded-lg border border-purple-200 truncate hidden sm:inline-block">Kelas: ${q.kelas}</span>
            <span class="text-xs text-slate-600 font-medium truncate ml-2">${snippetText}</span>
          </div>

          <div class="flex items-center space-x-2 flex-shrink-0" onclick="event.stopPropagation()">
            <span class="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">Kunci: ${q.kunci_jawaban}</span>
            
            <button id="btn-toggle-${q.id}" onclick="SoalModule.toggleSoalDetail(${q.id})" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs px-3 py-1 rounded-lg border border-blue-200 transition flex items-center gap-1">
              <span>👁️ Lihat Soal</span>
            </button>

            <button onclick="SoalModule.openEditModal(${q.id})" class="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs px-3 py-1 rounded-lg border border-amber-300 transition">
              ✏️ Edit
            </button>
          </div>
        </div>

        <!-- DETAIL BODY (COLLAPSIBLE / DEFAULT HIDDEN) -->
        <div id="detail-soal-${q.id}" class="hidden p-5 space-y-4 bg-white border-t border-slate-100 transition-all duration-300">
          <div class="text-xs text-slate-800 leading-relaxed font-medium space-y-2">
            <div class="font-bold text-slate-500 mb-1 uppercase tracking-wider text-[10px]">Teks Pertanyaan / Studi Kasus:</div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">${q.soal_html}</div>
          </div>

          <div class="space-y-2 pt-1">
            <div class="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Pilihan Jawaban (A - E):</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div class="p-2.5 rounded-xl border ${q.kunci_jawaban === 'A' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-700'}">
                <strong>A.</strong> ${q.opsi_a}
              </div>
              <div class="p-2.5 rounded-xl border ${q.kunci_jawaban === 'B' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-700'}">
                <strong>B.</strong> ${q.opsi_b}
              </div>
              <div class="p-2.5 rounded-xl border ${q.kunci_jawaban === 'C' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-700'}">
                <strong>C.</strong> ${q.opsi_c}
              </div>
              <div class="p-2.5 rounded-xl border ${q.kunci_jawaban === 'D' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-700'}">
                <strong>D.</strong> ${q.opsi_d}
              </div>
              <div class="p-2.5 rounded-xl border ${q.kunci_jawaban === 'E' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-700'} md:col-span-2">
                <strong>E.</strong> ${q.opsi_e}
              </div>
            </div>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  },

  // --- LOGIKA ACCORDION BUKA/TUTUP DETAIL SOAL ---
  toggleSoalDetail(id) {
    const detailEl = document.getElementById(`detail-soal-${id}`);
    const btnEl = document.getElementById(`btn-toggle-${id}`);

    if (!detailEl || !btnEl) return;

    if (detailEl.classList.contains('hidden')) {
      detailEl.classList.remove('hidden');
      btnEl.innerHTML = `<span>🙈 Tutup Soal</span>`;
      btnEl.className = "bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-3 py-1 rounded-lg border border-slate-300 transition flex items-center gap-1";
    } else {
      detailEl.classList.add('hidden');
      btnEl.innerHTML = `<span>👁️ Lihat Soal</span>`;
      btnEl.className = "bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs px-3 py-1 rounded-lg border border-blue-200 transition flex items-center gap-1";
    }
  },

  // --- UNGGAH NASKAH SOAL HTML ---
  toggleSelectAllKelas(checked) {
    const checkboxes = document.querySelectorAll('.chk-upload-kelas');
    checkboxes.forEach(cb => cb.checked = checked);
  },

  async processHTMLUpload(e) {
    e.preventDefault();
    const mapelSelect = document.getElementById('select-upload-mapel').value;
    const selectedKelasNodes = document.querySelectorAll('.chk-upload-kelas:checked');
    const selectedKelas = Array.from(selectedKelasNodes).map(cb => cb.value);

    if (selectedKelas.length === 0) {
      alert("Silakan centang minimal 1 kelas target!");
      return;
    }

    const fileInput = document.getElementById('file-html-input');
    if (!fileInput.files || fileInput.files.length === 0) {
      alert("Silakan pilih berkas HTML naskah soal!");
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      const htmlText = event.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      
      const soalItems = doc.querySelectorAll('.soal-item');
      if (soalItems.length === 0) {
        alert("Gagal membaca soal! Pastikan berkas HTML menggunakan struktur tag <div class='soal-item' data-kunci='A'>");
        return;
      }

      const kelasTargetStr = selectedKelas.join(', ');
      const payloadBatch = [];

      soalItems.forEach(item => {
        const kunci = (item.getAttribute('data-kunci') || 'A').toUpperCase().trim();
        const kontenEl = item.querySelector('.soal-konten');
        const soalHtml = kontenEl ? kontenEl.innerHTML.trim() : item.innerHTML.trim();

        const opsiLis = item.querySelectorAll('.opsi-jawaban li');
        const opsiA = opsiLis[0] ? opsiLis[0].innerHTML.trim() : '';
        const opsiB = opsiLis[1] ? opsiLis[1].innerHTML.trim() : '';
        const opsiC = opsiLis[2] ? opsiLis[2].innerHTML.trim() : '';
        const opsiD = opsiLis[3] ? opsiLis[3].innerHTML.trim() : '';
        const opsiE = opsiLis[4] ? opsiLis[4].innerHTML.trim() : '';

        payloadBatch.push({
          mapel: mapelSelect,
          kelas: kelasTargetStr,
          soal_html: soalHtml,
          opsi_a: opsiA,
          opsi_b: opsiB,
          opsi_c: opsiC,
          opsi_d: opsiD,
          opsi_e: opsiE,
          kunci_jawaban: kunci
        });
      });

      try {
        const client = await DB.getClient();
        const { data, error } = await client.from('bank_soal').insert(payloadBatch);
        if (error) throw error;

        alert(`Berhasil mengunggah ${payloadBatch.length} butir soal ke Supabase untuk kelas (${kelasTargetStr})!`);
        await this.loadAndRender();
        App.switchAdminTab('bank-soal');
      } catch (err) {
        alert("Gagal menyimpan soal ke database: " + err.message);
      }
    };

    reader.readAsText(file);
  },

  // --- MODAL EDIT SOAL & GAMBAR ---
  openEditModal(id) {
    const q = State.questions.find(item => item.id === id);
    if (!q) return;

    document.getElementById('edit-soal-id').value = q.id;
    document.getElementById('edit-soal-mapel').value = q.mapel;
    document.getElementById('edit-soal-kelas').value = q.kelas;
    document.getElementById('edit-soal-html').value = q.soal_html;
    document.getElementById('edit-opsi-a').value = q.opsi_a;
    document.getElementById('edit-opsi-b').value = q.opsi_b;
    document.getElementById('edit-opsi-c').value = q.opsi_c;
    document.getElementById('edit-opsi-d').value = q.opsi_d;
    document.getElementById('edit-opsi-e').value = q.opsi_e;
    document.getElementById('edit-soal-kunci').value = q.kunci_jawaban;

    document.getElementById('modal-edit-soal').classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('modal-edit-soal').classList.add('hidden');
  },

  async uploadImageToStorage(fileInputId, targetTextareaId) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput.files || fileInput.files.length === 0) {
      alert("Pilih gambar terlebih dahulu!");
      return;
    }

    const file = fileInput.files[0];
    const fileName = `img_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

    try {
      const client = await DB.getClient();
      const { data, error } = await client.storage.from('soal-images').upload(fileName, file);
      if (error) throw error;

      const { data: publicData } = client.storage.from('soal-images').getPublicUrl(fileName);
      const imgUrl = publicData.publicUrl;

      const imgTag = `<br><img src="${imgUrl}" alt="Gambar Soal" class="my-2 rounded border max-h-48 object-contain"><br>`;
      const targetArea = document.getElementById(targetTextareaId);
      targetArea.value += imgTag;

      alert("Gambar berhasil diunggah dan tag HTML disisipkan!");
    } catch (err) {
      alert("Gagal upload gambar ke Supabase Storage: " + err.message);
    }
  },

  async saveEditedSoal(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('edit-soal-id').value);

    const payload = {
      mapel: document.getElementById('edit-soal-mapel').value.trim(),
      kelas: document.getElementById('edit-soal-kelas').value.trim(),
      soal_html: document.getElementById('edit-soal-html').value.trim(),
      opsi_a: document.getElementById('edit-opsi-a').value.trim(),
      opsi_b: document.getElementById('edit-opsi-b').value.trim(),
      opsi_c: document.getElementById('edit-opsi-c').value.trim(),
      opsi_d: document.getElementById('edit-opsi-d').value.trim(),
      opsi_e: document.getElementById('edit-opsi-e').value.trim(),
      kunci_jawaban: document.getElementById('edit-soal-kunci').value.trim().toUpperCase()
    };

    try {
      const client = await DB.getClient();
      const { error } = await client.from('bank_soal').update(payload).eq('id', id);
      if (error) throw error;

      alert("Perubahan soal berhasil disimpan!");
      this.closeEditModal();
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal update soal: " + err.message);
    }
  }
};

window.SoalModule = SoalModule;
