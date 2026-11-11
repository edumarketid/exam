const SoalModule = {
  async loadAndRender() {
    try {
      console.log("[SoalModule] Menarik bank soal dari Supabase...");
      const rawQuestions = await DB.fetchBankSoal();
      
      // Normalisasi nama kolom Supabase (Case-Insensitive)
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

      console.log("[SoalModule] Data bank soal berhasil dimuat:", State.questions.length, "butir");
      this.renderBankSoalList();
    } catch (err) {
      console.error("[SoalModule] Error saat render bank soal:", err.message);
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
    logBox.textContent = `[INFO] Membaca file: ${file.name}...\n[INFO] Kelas Target (${selectedKelasList.length} kelas): ${selectedKelasList.join(', ')}\n`;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const htmlText = event.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const soalElements = doc.querySelectorAll('.soal-item');
      if (soalElements.length === 0) {
        logBox.textContent += `[ERROR] Gagal! Tidak ditemukan elemen div.soal-item.\n`;
        return;
      }

      // Gabungkan seluruh kelas target yang dicentang menjadi 1 string pisahan koma
      const combinedKelasString = selectedKelasList.join(', ');

      const parsedQuestions = [];
      soalElements.forEach((el) => {
        const kunci = el.getAttribute('data-kunci') || 'A';
        const kontenEl = el.querySelector('.soal-konten');
        const soalHtml = kontenEl ? kontenEl.innerHTML.trim() : el.innerHTML.trim();
        const opsiItems = el.querySelectorAll('.opsi-jawaban li');

        parsedQuestions.push({
          mapel: mapel,
          kelas: combinedKelasString, // Disimpan sebagai 1 paket master untuk banyak kelas
          soal_html: soalHtml,
          opsi_a: opsiItems[0] ? opsiItems[0].innerHTML.trim() : '',
          opsi_b: opsiItems[1] ? opsiItems[1].innerHTML.trim() : '',
          opsi_c: opsiItems[2] ? opsiItems[2].innerHTML.trim() : '',
          opsi_d: opsiItems[3] ? opsiItems[3].innerHTML.trim() : '',
          opsi_e: opsiItems[4] ? opsiItems[4].innerHTML.trim() : '',
          kunci_jawaban: kunci.toUpperCase()
        });
      });

      const client = await DB.getClient();
      if (client) {
        const { error } = await client.from('bank_soal').insert(parsedQuestions);
        if (!error) {
          alert(`BERHASIL UNGGAH NASKAH MASTER!\n\nSebanyak ${parsedQuestions.length} butir soal berhasil disimpan untuk ${selectedKelasList.length} kelas target (${combinedKelasString}).\n\nEdit soal cukup dilakukan 1 kali saja!`);
          await this.loadAndRender();
        } else {
          alert(`Gagal menyimpan ke Supabase: ${error.message}`);
        }
      }
    };
    reader.readAsText(file);
  },

  toggleAccordionGroup(groupKey) {
    State.openAccordionMapel[groupKey] = !State.openAccordionMapel[groupKey];
    this.renderBankSoalList();
  },

  renderBankSoalList() {
    const container = document.getElementById('bank-soal-list');
    const filterKelas = (document.getElementById('bank-filter-kelas')?.value || 'ALL').trim();
    const filterMapel = (document.getElementById('bank-filter-mapel')?.value || 'ALL').trim();
    if (!container) return;

    container.innerHTML = '';
    let filtered = State.questions || [];

    // Filter Fleksibel: Memeriksa apakah kelas target mengandung string filter
    if (filterKelas !== 'ALL') {
      filtered = filtered.filter(q => 
        String(q.kelas).toUpperCase().split(',').map(k => k.trim()).includes(filterKelas.toUpperCase())
      );
    }
    if (filterMapel !== 'ALL') {
      filtered = filtered.filter(q => String(q.mapel).trim().toUpperCase() === filterMapel.toUpperCase());
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-4 rounded-lg text-center">
          <p class="font-bold">Tidak ada soal yang cocok dengan filter saat ini.</p>
          <p class="text-[11px] text-amber-600 mt-1">Coba sesuaikan filter Kelas atau Mapel di bagian atas.</p>
        </div>`;
      return;
    }

    // Kelompokkan naskah master berdasarkan kombinasi Mapel + Paket Kelas
    const groupedByMapelAndKelas = {};
    filtered.forEach(q => {
      const groupKey = `${q.mapel}___${q.kelas}`;
      if (!groupedByMapelAndKelas[groupKey]) groupedByMapelAndKelas[groupKey] = [];
      groupedByMapelAndKelas[groupKey].push(q);
    });

    Object.keys(groupedByMapelAndKelas).forEach((groupKey) => {
      const groupQuestions = groupedByMapelAndKelas[groupKey];
      const [mapelName, kelasName] = groupKey.split('___');
      
      const isOpen = State.openAccordionMapel[groupKey] !== false;

      const groupCard = document.createElement('div');
      groupCard.className = "border rounded-lg bg-white overflow-hidden shadow-sm transition mb-3";

      groupCard.innerHTML = `
        <div class="p-4 bg-gray-50 hover:bg-blue-50 flex justify-between items-center transition border-b">
          <div onclick="SoalModule.toggleAccordionGroup('${groupKey.replace(/'/g, "\\'")}')" class="flex items-center gap-3 cursor-pointer flex-grow">
            <div class="w-8 h-8 rounded bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow">
              ${isOpen ? '▼' : '►'}
            </div>
            <div>
              <h4 class="font-bold text-sm text-gray-800">${mapelName}</h4>
              <p class="text-[11px] text-gray-600 mt-0.5">
                Target Kelas (${kelasName.split(',').length} Kelas): <strong class="text-blue-800 font-bold bg-blue-100 px-2 py-0.5 rounded">${kelasName}</strong> | Total: <strong class="text-emerald-700 font-bold">${groupQuestions.length} Butir Master Soal</strong>
              </p>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <button onclick="event.stopPropagation(); SoalModule.deleteSoalByGroup('${mapelName.replace(/'/g, "\\'")}', '${kelasName.replace(/'/g, "\\'")}')" class="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-1.5 rounded shadow transition flex items-center gap-1">
              🗑️ Hapus Paket Naskah Ini
            </button>
            <span onclick="SoalModule.toggleAccordionGroup('${groupKey.replace(/'/g, "\\'")}')" class="cursor-pointer text-xs font-semibold text-blue-600 bg-blue-100 px-2.5 py-1.5 rounded-full hover:bg-blue-200">
              ${isOpen ? 'Tutup' : 'Buka'}
            </span>
          </div>
        </div>

        <div class="${isOpen ? 'block' : 'hidden'} p-4 space-y-4 bg-white">
          <div class="grid grid-cols-1 gap-4">
            ${groupQuestions.map((q, idx) => {
              const qId = q.id || idx;
              return `
                <div class="border p-3.5 rounded-lg bg-gray-50 space-y-3 text-xs">
                  <div class="flex justify-between items-start gap-4 border-b pb-2">
                    <div>
                      <span class="font-bold text-blue-800">[Akses Kelas: ${q.kelas}]</span>
                      <span class="ml-2 font-bold text-emerald-800">Kunci Jawaban: ${q.kunci_jawaban}</span>
                    </div>
                    <div class="flex gap-2">
                      <button onclick="SoalModule.openEditModal(${qId})" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded text-[10px] flex items-center gap-1 shadow">
                        ✏️ Edit Soal & Gambar (Cukup 1x Edit)
                      </button>
                      <button onclick="SoalModule.deleteSoal(${qId})" class="bg-red-500 hover:bg-red-600 text-white font-bold px-2.5 py-1 rounded text-[10px] shadow">
                        Hapus Soal Ini
                      </button>
                    </div>
                  </div>

                  <div class="font-sans space-y-2">
                    <div class="font-medium text-gray-900">${q.soal_html}</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-1 text-gray-700 font-sans pt-1">
                      <div><strong>A.</strong> ${q.opsi_a}</div>
                      <div><strong>B.</strong> ${q.opsi_b}</div>
                      <div><strong>C.</strong> ${q.opsi_c}</div>
                      <div><strong>D.</strong> ${q.opsi_d}</div>
                      <div class="md:col-span-2"><strong>E.</strong> ${q.opsi_e}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      container.appendChild(groupCard);
    });
  },

  // ==========================================
  // FITUR EDIT SOAL & UPLOAD GAMBAR SUPABASE
  // ==========================================
  openEditModal(qId) {
    const q = State.questions.find(item => (item.id || State.questions.indexOf(item)) == qId);
    if (!q) {
      alert("Data soal tidak ditemukan.");
      return;
    }

    document.getElementById('edit-soal-id').value = qId;
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

  compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const reader = new FileReader();
      reader.onload = (e) => { image.src = e.target.result; };
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], `compressed_${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
          } else reject(new Error("Gagal kompresi."));
        }, 'image/jpeg', quality);
      };
      image.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  async uploadImageToStorage(fileInputId, targetFieldId) {
    const fileInput = document.getElementById(fileInputId);
    const originalFile = fileInput.files[0];

    if (!originalFile) {
      alert("Silakan pilih file gambar dari perangkat Anda terlebih dahulu.");
      return;
    }

    const client = await DB.getClient();
    if (!client) {
      alert("Koneksi Supabase tidak aktif.");
      return;
    }

    try {
      const compressedFile = await this.compressImage(originalFile);
      const targetElem = document.getElementById(targetFieldId);
      const fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;

      const { data: uploadData, error: uploadError } = await client.storage
        .from('soal-images')
        .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = client.storage.from('soal-images').getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      if (targetFieldId === 'edit-soal-html') {
        const imgHtml = `<br><img src="${publicUrl}" alt="Gambar Soal" class="my-2 rounded border max-h-48">`;
        targetElem.value = targetElem.value.includes('<img') ? targetElem.value.replace(/<img[^>]*>/g, imgHtml) : targetElem.value + imgHtml;
      } else {
        const imgHtml = `<br><img src="${publicUrl}" alt="Gambar Opsi" class="inline-block max-h-24 my-1 rounded border">`;
        targetElem.value += imgHtml;
      }

      alert("Gambar berhasil dikompres dan diunggah ke Supabase Bucket ('soal-images')!");
      fileInput.value = '';
    } catch (err) {
      alert(`Gagal mengunggah gambar: ${err.message}`);
    }
  },

  async saveEditedSoal(e) {
    e.preventDefault();
    const qId = document.getElementById('edit-soal-id').value;
    const mapel = document.getElementById('edit-soal-mapel').value;
    const kelas = document.getElementById('edit-soal-kelas').value;
    const soal_html = document.getElementById('edit-soal-html').value;
    const opsi_a = document.getElementById('edit-opsi-a').value;
    const opsi_b = document.getElementById('edit-opsi-b').value;
    const opsi_c = document.getElementById('edit-opsi-c').value;
    const opsi_d = document.getElementById('edit-opsi-d').value;
    const opsi_e = document.getElementById('edit-opsi-e').value;
    const kunci_jawaban = document.getElementById('edit-soal-kunci').value;

    const client = await DB.getClient();
    if (client && qId) {
      try {
        const { error } = await client.from('bank_soal')
          .update({ mapel, kelas, soal_html, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban })
          .eq('id', parseInt(qId));

        if (error) throw error;

        alert("Perubahan teks & gambar soal berhasil diperbarui di Supabase (Otomatis berlaku untuk seluruh kelas target)!");
        await this.loadAndRender();
        this.closeEditModal();
      } catch (err) {
        alert(`Gagal menyimpan perubahan: ${err.message}`);
      }
    }
  },

  async deleteSoalByGroup(mapelName, kelasName) {
    const countGroup = State.questions.filter(q => q.mapel === mapelName && q.kelas === kelasName).length;
    if (!confirm(`HAPUS PAKET NASKAH SOAL?\n\nApakah Anda yakin ingin menghapus SELURUH ${countGroup} butir master soal untuk:\nMata Pelajaran: "${mapelName}"\nKelas Target: "${kelasName}"?`)) return;

    const client = await DB.getClient();
    if (client) {
      try {
        const { error } = await client.from('bank_soal')
          .delete()
          .eq('mapel', mapelName)
          .eq('kelas', kelasName);
          
        if (error) throw error;
        alert(`Berhasil menghapus seluruh paket naskah soal "${mapelName}" dari Supabase.`);
        await this.loadAndRender();
      } catch (err) {
        alert(`Gagal menghapus soal: ${err.message}`);
      }
    }
  },

  async deleteSoal(id) {
    if (confirm("Hapus soal ini dari bank soal?")) {
      const client = await DB.getClient();
      if (client && typeof id === 'number') {
        await client.from('bank_soal').delete().eq('id', id);
        await this.loadAndRender();
      }
    }
  },

  printNaskahSoalArsip() {
    const filterKelas = document.getElementById('bank-filter-kelas').value;
    const filterMapel = document.getElementById('bank-filter-mapel').value;
    const container = document.getElementById('print-soal-content-container');
    if (!container) return;

    container.innerHTML = '';
    let filtered = State.questions || [];

    if (filterKelas !== 'ALL') {
      filtered = filtered.filter(q => 
        String(q.kelas).toUpperCase().split(',').map(k => k.trim()).includes(filterKelas.toUpperCase())
      );
    }
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
          <div>A. ${q.opsi_a}</div>
          <div>B. ${q.opsi_b}</div>
          <div>C. ${q.opsi_c}</div>
          <div>D. ${q.opsi_d}</div>
          <div>E. ${q.opsi_e}</div>
        </div>
      `;
      container.appendChild(item);
    });

    window.print();
  }
};

window.SoalModule = SoalModule;
