const SoalModule = {
  // --- HELPER: NORMALISASI TEKS (SPASI GANDA & HURUF BESAR) ---
  normalizeText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  // --- HELPER: CEK PASANGAN (MAPEL + KELAS) MILIK GURU ---
  getGuruPairs() {
    if (!State.currentUser || State.currentUser.role !== 'guru') return [];
    if (typeof GuruModule !== 'undefined' && typeof GuruModule.getGuruPairs === 'function') {
      return GuruModule.getGuruPairs(State.currentUser);
    }

    const rawMapel = String(State.currentUser.mapel_diampu || '').trim();
    const rawKelas = String(State.currentUser.kelas_diampu || '').trim();
    if (!rawMapel || rawMapel === '-') return [];

    const pairs = [];
    const legacyKelasList = (!rawKelas || rawKelas === '-' || rawKelas.toUpperCase() === 'ALL')
      ? []
      : rawKelas.split(',').map(k => k.trim()).filter(Boolean);

    rawMapel.split(',').map(s => s.trim()).filter(Boolean).forEach(token => {
      const match = token.match(/^(.+?)\s*\(([^()]+)\)$/);
      if (match) {
        pairs.push({ mapel: match[1].trim(), kelas: match[2].trim() });
      } else if (legacyKelasList.length > 0) {
        legacyKelasList.forEach(k => pairs.push({ mapel: token, kelas: k }));
      } else {
        pairs.push({ mapel: token, kelas: '*' });
      }
    });
    return pairs;
  },

  isPairAllowed(targetMapel, targetKelas = null) {
    if (!State.currentUser || State.currentUser.role !== 'guru') return true;
    const pairs = this.getGuruPairs();
    if (pairs.length === 0) return false;

    const mUpper = this.normalizeText(targetMapel);
    if (!targetKelas) {
      return pairs.some(p => this.normalizeText(p.mapel) === mUpper);
    }

    const targetKelasList = String(targetKelas).split(',').map(k => this.normalizeText(k)).filter(Boolean);
    return pairs.some(p => {
      const matchM = this.normalizeText(p.mapel) === mUpper;
      const matchK = p.kelas === '*' || targetKelasList.includes(this.normalizeText(p.kelas));
      return matchM && matchK;
    });
  },

  // --- HELPER: EKSTRAK & HAPUS FILE GAMBAR DARI BUCKET 'soal-images' ---
  extractStoragePathsFromQuestions(questionItems) {
    const paths = new Set();
    const regex = /\/storage\/v1\/object\/public\/soal-images\/([^"'\s<>)]+)/gi;

    (questionItems || []).forEach(q => {
      const combinedHtml = [
        q.soal_html, q.opsi_a, q.opsi_b, q.opsi_c, q.opsi_d, q.opsi_e
      ].filter(Boolean).join(' ');

      let match;
      while ((match = regex.exec(combinedHtml)) !== null) {
        if (match[1]) {
          paths.add(decodeURIComponent(match[1]));
        }
      }
    });

    return Array.from(paths);
  },

  async cleanupUnusedStorageImages(deletedQuestions, remainingQuestions) {
    try {
      const candidatePaths = this.extractStoragePathsFromQuestions(deletedQuestions);
      if (candidatePaths.length === 0) return 0;

      // Pastikan gambar tidak sedang dipakai oleh soal lain yang masih tersisa
      const stillUsedPaths = new Set(this.extractStoragePathsFromQuestions(remainingQuestions));
      const safeToDelete = candidatePaths.filter(p => !stillUsedPaths.has(p));

      if (safeToDelete.length === 0) return 0;

      const client = await DB.getClient();
      if (!client) return 0;

      const { error } = await client.storage.from('soal-images').remove(safeToDelete);
      if (error) {
        console.warn("[SoalModule] Gagal menghapus file dari bucket soal-images:", error.message);
        return 0;
      }
      console.log("[SoalModule] Berhasil membersihkan gambar dari Storage:", safeToDelete);
      return safeToDelete.length;
    } catch (e) {
      console.warn("[SoalModule] Cleanup storage dilewati:", e.message);
      return 0;
    }
  },

  async loadAndRender() {
    try {
      console.log("[SoalModule] Menarik seluruh data Bank Soal dari Supabase...");
      
      if (!State.mapelList || State.mapelList.length === 0) {
        State.mapelList = await DB.fetchMapel();
      }
      if (!State.siswaList || State.siswaList.length === 0) {
        State.siswaList = await DB.fetchSiswa();
      }

      const rawBank = await DB.fetchBankSoal();
      
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
      
      this.populateUploadMapelDropdown();
      this.renderUploadKelasCheckboxes();
      this.populateFilterDropdowns();
      this.renderBankSoalList();
    } catch (err) {
      console.error("[SoalModule] Error load bank soal:", err.message);
    }
  },

  // --- POPULATE FORM UNGGAH SOAL HTML ---
  populateUploadMapelDropdown() {
    const selectUploadMapel = document.getElementById('select-upload-mapel');
    if (!selectUploadMapel) return;

    let html = `<option value="">-- Pilih Mata Pelajaran --</option>`;

    if (State.currentUser && State.currentUser.role === 'guru') {
      const pairs = this.getGuruPairs();
      const uniqueMapels = [...new Set(pairs.map(p => p.mapel))];
      uniqueMapels.forEach(m => {
        html += `<option value="${m}">${m}</option>`;
      });
      selectUploadMapel.onchange = () => this.renderUploadKelasCheckboxes();
    } else {
      const mapelSet = new Set(State.mapelList || []);
      if (State.questions) {
        State.questions.forEach(q => { if (q.mapel) mapelSet.add(q.mapel); });
      }
      Array.from(mapelSet).sort().forEach(m => {
        html += `<option value="${m}">${m}</option>`;
      });
    }

    selectUploadMapel.innerHTML = html;
  },

  renderUploadKelasCheckboxes() {
    const container = document.getElementById('container-upload-kelas-checkboxes');
    if (!container) return;

    const selectedMapel = this.normalizeText(document.getElementById('select-upload-mapel')?.value || '');
    const kelasSet = new Set();

    if (State.currentUser && State.currentUser.role === 'guru') {
      const pairs = this.getGuruPairs();
      const relevantPairs = selectedMapel
        ? pairs.filter(p => this.normalizeText(p.mapel) === selectedMapel)
        : pairs;

      relevantPairs.forEach(p => {
        if (p.kelas === '*') {
          (State.siswaList || []).forEach(s => { if (s.kelas && s.kelas !== '-') kelasSet.add(String(s.kelas).trim()); });
        } else {
          kelasSet.add(p.kelas);
        }
      });
    } else {
      if (State.siswaList && State.siswaList.length > 0) {
        State.siswaList.forEach(s => {
          if (s.kelas && s.kelas !== '-') kelasSet.add(String(s.kelas).trim());
        });
      }
      if (State.questions && State.questions.length > 0) {
        State.questions.forEach(q => {
          if (q.kelas && q.kelas !== '-') {
            String(q.kelas).split(',').forEach(k => kelasSet.add(k.trim()));
          }
        });
      }
    }

    const sortedKelas = Array.from(kelasSet).filter(Boolean).sort();

    if (sortedKelas.length === 0) {
      container.innerHTML = `
        <div class="col-span-4 p-2 text-center text-xs text-amber-700 bg-amber-50 rounded">
          Pilih Mata Pelajaran terlebih dahulu untuk melihat kelas target Anda.
        </div>`;
      return;
    }

    let html = '';
    sortedKelas.forEach(k => {
      html += `
        <label class="flex items-center space-x-2 p-2 rounded hover:bg-blue-100/60 cursor-pointer text-xs font-semibold text-blue-950 border border-blue-100 bg-white">
          <input type="checkbox" value="${k}" class="chk-upload-kelas rounded text-blue-600 focus:ring-blue-500">
          <span>${k}</span>
        </label>
      `;
    });

    container.innerHTML = html;
  },

  toggleSelectAllKelas(checked) {
    const checkboxes = document.querySelectorAll('.chk-upload-kelas');
    checkboxes.forEach(cb => cb.checked = checked);
  },

  // --- POPULATE FILTER DROPDOWN Halaman Bank Soal ---
  populateFilterDropdowns() {
    const filterMapel = document.getElementById('bank-filter-mapel');
    const filterKelas = document.getElementById('bank-filter-kelas');

    const prevMapel = filterMapel ? filterMapel.value : 'ALL';
    const prevKelas = filterKelas ? filterKelas.value : 'ALL';

    const accessibleQuestions = (State.questions || []).filter(q => this.isPairAllowed(q.mapel, q.kelas));

    if (filterMapel) {
      const listMapel = [...new Set(accessibleQuestions.map(q => q.mapel))].filter(Boolean);
      let optHtml = `<option value="ALL">-- Semua Mapel --</option>`;
      listMapel.forEach(m => {
        optHtml += `<option value="${m}">${m}</option>`;
      });
      filterMapel.innerHTML = optHtml;
      if (listMapel.includes(prevMapel)) filterMapel.value = prevMapel;
    }

    if (filterKelas) {
      const listKelasRaw = accessibleQuestions.map(q => q.kelas).join(',').split(',');
      const listKelas = [...new Set(listKelasRaw.map(k => k.trim()))]
        .filter(Boolean)
        .filter(k => {
          if (!State.currentUser || State.currentUser.role !== 'guru') return true;
          const pairs = this.getGuruPairs();
          return pairs.some(p => p.kelas === '*' || this.normalizeText(p.kelas) === this.normalizeText(k));
        });
      let optHtml = `<option value="ALL">-- Semua Kelas --</option>`;
      listKelas.forEach(k => {
        optHtml += `<option value="${k}">${k}</option>`;
      });
      filterKelas.innerHTML = optHtml;
      if (listKelas.includes(prevKelas)) filterKelas.value = prevKelas;
    }
  },

  renderBankSoalList() {
    const container = document.getElementById('bank-soal-list');
    if (!container) return;

    const filterKelas = this.normalizeText(document.getElementById('bank-filter-kelas')?.value || 'ALL');
    const filterMapel = this.normalizeText(document.getElementById('bank-filter-mapel')?.value || 'ALL');

    container.innerHTML = '';
    let filtered = State.questions || [];

    if (State.currentUser && State.currentUser.role === 'guru') {
      filtered = filtered.filter(q => this.isPairAllowed(q.mapel, q.kelas));
    }

    if (filterKelas !== 'ALL') {
      filtered = filtered.filter(q => {
        const kList = String(q.kelas).split(',').map(k => this.normalizeText(k));
        return kList.includes(filterKelas);
      });
    }

    if (filterMapel !== 'ALL') {
      filtered = filtered.filter(q => this.normalizeText(q.mapel) === filterMapel);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
          <p class="font-bold">Tidak ada naskah soal yang ditemukan untuk pasangan Mapel & Kelas Anda.</p>
          <p class="mt-1 text-slate-500">Pastikan soal sudah diunggah atau sesuaikan filter Mapel & Kelas di atas.</p>
        </div>`;
      return;
    }

    const groupedByMapelKelas = {};
    filtered.forEach(q => {
      const mapelName = q.mapel || 'Tanpa Mapel';
      const kelasName = q.kelas || 'Semua Kelas';
      const groupKey = `${mapelName}___${kelasName}`;
      
      if (!groupedByMapelKelas[groupKey]) {
        groupedByMapelKelas[groupKey] = {
          mapel: mapelName,
          kelas: kelasName,
          soalList: []
        };
      }
      groupedByMapelKelas[groupKey].soalList.push(q);
    });

    let groupIdx = 0;

    Object.keys(groupedByMapelKelas).forEach(key => {
      groupIdx++;
      const groupData = groupedByMapelKelas[key];
      const listSoalGroup = groupData.soalList;
      const safeGroupId = `group-mk-${groupIdx}`;

      const groupBox = document.createElement('div');
      groupBox.className = "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4 transition hover:border-ocean-300";

      let innerSoalHtml = '';

      listSoalGroup.forEach((q, idx) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = q.soal_html;
        const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim();
        const snippetText = plainText.length > 55 ? plainText.substring(0, 55) + '...' : plainText;

        innerSoalHtml += `
          <div class="border border-slate-200 rounded-xl overflow-hidden bg-white mb-2">
            <div class="p-3 bg-slate-50 flex flex-wrap justify-between items-center gap-2 cursor-pointer border-b border-slate-100" onclick="SoalModule.toggleSoalDetail(${q.id})">
              <div class="flex items-center space-x-2 flex-1 min-w-0">
                <span class="bg-ocean-700 text-white font-extrabold text-[11px] px-2 py-0.5 rounded">Soal #${idx + 1}</span>
                <span class="text-xs text-slate-700 font-medium truncate ml-1">${snippetText}</span>
              </div>
              
              <div class="flex items-center space-x-1.5 flex-shrink-0" onclick="event.stopPropagation()">
                <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Kunci: ${q.kunci_jawaban}</span>
                
                <button id="btn-toggle-${q.id}" onclick="SoalModule.toggleSoalDetail(${q.id})" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] px-2.5 py-1 rounded border border-blue-200 transition">
                  👁️ Buka
                </button>
                
                <button onclick="SoalModule.openEditModal(${q.id})" class="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] px-2.5 py-1 rounded border border-amber-300 transition">
                  ✏️ Edit
                </button>

                <button onclick="SoalModule.deleteSoal(${q.id}, ${idx + 1})" class="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] px-2.5 py-1 rounded border border-rose-300 transition">
                  🗑️ Hapus
                </button>
              </div>
            </div>

            <div id="detail-soal-${q.id}" class="hidden p-4 space-y-3 bg-white text-xs border-t border-slate-100">
              <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">${q.soal_html}</div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                <div class="p-2 rounded-lg border ${q.kunci_jawaban === 'A' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200'}"><strong>A.</strong> ${q.opsi_a}</div>
                <div class="p-2 rounded-lg border ${q.kunci_jawaban === 'B' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200'}"><strong>B.</strong> ${q.opsi_b}</div>
                <div class="p-2 rounded-lg border ${q.kunci_jawaban === 'C' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200'}"><strong>C.</strong> ${q.opsi_c}</div>
                <div class="p-2 rounded-lg border ${q.kunci_jawaban === 'D' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200'}"><strong>D.</strong> ${q.opsi_d}</div>
                <div class="p-2 rounded-lg border ${q.kunci_jawaban === 'E' ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-400' : 'bg-slate-50 border-slate-200'} md:col-span-2"><strong>E.</strong> ${q.opsi_e}</div>
              </div>
            </div>
          </div>
        `;
      });

      groupBox.innerHTML = `
        <div class="p-4 bg-ocean-900 text-white flex flex-wrap justify-between items-center gap-3 cursor-pointer select-none" onclick="SoalModule.toggleMapelGroup('${safeGroupId}')">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-teal-300 flex-shrink-0">
              <i class="fa-solid fa-book-open"></i>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-bold text-sm tracking-wide text-white">${groupData.mapel}</h4>
                <span class="bg-purple-500/30 text-purple-200 text-[10px] px-2 py-0.5 rounded-full font-bold border border-purple-400/40">
                  Kelas: ${groupData.kelas}
                </span>
              </div>
              <p class="text-[11px] text-ocean-200 mt-0.5">Total: ${listSoalGroup.length} Butir Soal Tersebar</p>
            </div>
          </div>

          <div class="flex items-center space-x-2" onclick="event.stopPropagation()">
            <!-- TOMBOL ANALISIS BUTIR SOAL -->
            <button onclick="SoalModule.openAnalisisButirSoal('${encodeURIComponent(groupData.mapel)}', '${encodeURIComponent(groupData.kelas)}')" 
                    title="Lihat Analisis Butir & Kualitas Soal"
                    class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition flex items-center gap-1.5">
              <span>📊 Analisis</span>
            </button>

            <!-- TOMBOL CETAK NASKAH SOAL RESMI -->
            <button onclick="SoalModule.printNaskahSoal('${encodeURIComponent(groupData.mapel)}', '${encodeURIComponent(groupData.kelas)}')" 
                    class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition flex items-center gap-1.5">
              <i class="fa-solid fa-print"></i>
              <span>Cetak Soal</span>
            </button>

            <!-- TOMBOL HAPUS PAKET SOAL PER MAPEL & KELAS + GAMBAR STORAGE -->
            <button onclick="SoalModule.deleteGroupSoal('${encodeURIComponent(groupData.mapel)}', '${encodeURIComponent(groupData.kelas)}', ${listSoalGroup.length})" 
                    title="Hapus Seluruh Soal & Gambar Storage pada Mapel & Kelas Ini"
                    class="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition flex items-center gap-1.5">
              <i class="fa-solid fa-trash-can"></i>
              <span class="hidden md:inline">Hapus Paket</span>
            </button>

            <span class="bg-teal-500/20 text-teal-300 text-xs px-3 py-1.5 rounded-full font-bold border border-teal-500/30 hidden sm:inline-block">
              ${listSoalGroup.length} Soal
            </span>

            <button id="btn-mapel-icon-${safeGroupId}" onclick="SoalModule.toggleMapelGroup('${safeGroupId}')" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
              <i class="fa-solid fa-chevron-down text-xs"></i>
            </button>
          </div>
        </div>

        <div id="${safeGroupId}" class="hidden p-4 bg-slate-100 space-y-2 border-t border-slate-200">
          ${innerSoalHtml}
        </div>
      `;

      container.appendChild(groupBox);
    });
  },

  // --- ANALISIS BUTIR SOAL & KUALITAS PAKET SOAL ---
  async openAnalisisButirSoal(encodedMapel, encodedKelas) {
    const mapel = decodeURIComponent(encodedMapel);
    const kelas = decodeURIComponent(encodedKelas);

    const questionsPkg = (State.questions || []).filter(q => 
      this.normalizeText(q.mapel) === this.normalizeText(mapel) &&
      this.normalizeText(q.kelas) === this.normalizeText(kelas)
    );

    if (questionsPkg.length === 0) {
      alert("Paket soal tidak ditemukan.");
      return;
    }

    // Ambil hasil ujian peserta untuk paket mapel & kelas ini
    let hasilList = [];
    try {
      const normalized = typeof RekapModule !== 'undefined' && RekapModule.fetchAndNormalizeHasil
        ? await RekapModule.fetchAndNormalizeHasil()
        : await DB.fetchHasilUjian();

      const targetKelasArr = kelas.split(',').map(k => this.normalizeText(k));
      hasilList = (normalized || []).filter(h => 
        String(h.status_selesai || '').toUpperCase() !== 'MENGERJAKAN' &&
        this.normalizeText(h.mapel) === this.normalizeText(mapel) &&
        targetKelasArr.includes(this.normalizeText(h.kelas))
      );
    } catch (e) {}

    // Distribusi Kunci Jawaban (Keseimbangan Kunci A-E)
    const keyDist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    questionsPkg.forEach(q => {
      const k = String(q.kunci_jawaban || 'A').trim().toUpperCase();
      if (keyDist[k] !== undefined) keyDist[k]++;
    });

    // Statistik Skor Peserta
    const scores = hasilList.map(h => Number(h.nilai) || 0);
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '0.0';
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const tuntasCount = scores.filter(s => s >= 75).length;

    // Buat/tampilkan modal analisis
    let modalEl = document.getElementById('modal-analisis-butir-soal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'modal-analisis-butir-soal';
      modalEl.className = "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4";
      document.body.appendChild(modalEl);
    }

    let rowsHtml = '';
    questionsPkg.forEach((q, idx) => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = q.soal_html;
      const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim();
      const hasImage = /<img\s/i.test(q.soal_html);
      const wordCount = plainText.split(/\s+/).filter(Boolean).length;
      const opsiCount = [q.opsi_a, q.opsi_b, q.opsi_c, q.opsi_d, q.opsi_e].filter(o => String(o || '').trim() !== '').length;

      let kategori = 'Sedang';
      let badgeCls = 'bg-amber-100 text-amber-800';
      if (hasImage || wordCount > 35 || (scores.length > 0 && Number(avgScore) < 60)) {
        kategori = 'Sukar (HOTS)';
        badgeCls = 'bg-rose-100 text-rose-800';
      } else if (wordCount <= 15 && !hasImage && (scores.length === 0 || Number(avgScore) >= 80)) {
        kategori = 'Mudah (LOTS)';
        badgeCls = 'bg-emerald-100 text-emerald-800';
      }

      const statusValid = opsiCount >= 4 && ['A','B','C','D','E'].includes(q.kunci_jawaban)
        ? `<span class="text-emerald-700 font-bold">✓ Valid (${opsiCount} Opsi)</span>`
        : `<span class="text-rose-700 font-bold">⚠️ Opsi Kurang</span>`;

      rowsHtml += `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
          <td class="p-2.5 text-center font-bold text-slate-600">${idx + 1}</td>
          <td class="p-2.5 text-slate-700">
            <div class="line-clamp-2 font-medium">${plainText || '(Soal Berbasis Gambar)'}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">${wordCount} kata ${hasImage ? '• 🖼️ Dilengkapi Gambar' : ''}</div>
          </td>
          <td class="p-2.5 text-center font-extrabold text-ocean-800">${q.kunci_jawaban}</td>
          <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}">${kategori}</span></td>
          <td class="p-2.5 text-center text-[11px]">${statusValid}</td>
        </tr>
      `;
    });

    modalEl.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div class="p-4 bg-indigo-900 text-white flex justify-between items-center">
          <div>
            <h3 class="font-bold text-sm">📊 Analisis Butir Soal & Sebaran Kunci Jawaban</h3>
            <p class="text-[11px] text-indigo-200 mt-0.5">${mapel} • Kelas: ${kelas} (${questionsPkg.length} Butir)</p>
          </div>
          <button onclick="document.getElementById('modal-analisis-butir-soal').classList.add('hidden')" class="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold">✕ Tutup</button>
        </div>

        <div class="p-4 overflow-y-auto space-y-4 text-xs">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="p-3 rounded-xl bg-slate-50 border">
              <div class="text-[10px] font-bold text-slate-400 uppercase">Peserta Selesai</div>
              <div class="text-lg font-black text-slate-800 mt-0.5">${scores.length} Siswa</div>
              <div class="text-[10px] text-emerald-600 font-semibold">Tuntas (≥75): ${tuntasCount} siswa</div>
            </div>
            <div class="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div class="text-[10px] font-bold text-blue-600 uppercase">Rata-Rata Nilai</div>
              <div class="text-lg font-black text-blue-900 mt-0.5">${avgScore}</div>
              <div class="text-[10px] text-blue-700">Min: ${minScore} • Max: ${maxScore}</div>
            </div>
            <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200 col-span-2">
              <div class="text-[10px] font-bold text-indigo-700 uppercase mb-1">Sebaran Kunci Jawaban (A – E)</div>
              <div class="flex flex-wrap gap-2">
                ${['A','B','C','D','E'].map(k => `
                  <span class="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 font-bold text-indigo-900">
                    ${k}: ${keyDist[k]} (${Math.round((keyDist[k] / questionsPkg.length) * 100)}%)
                  </span>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                  <th class="p-2.5 text-center w-12">No</th>
                  <th class="p-2.5">Cuplikan Stimulus Butir Soal</th>
                  <th class="p-2.5 text-center w-16">Kunci</th>
                  <th class="p-2.5 text-center w-32">Tingkat Kesukaran</th>
                  <th class="p-2.5 text-center w-28">Status Opsi</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    modalEl.classList.remove('hidden');
  },

  // --- HAPUS BUTIR SOAL SATUAN + BERSIHKAN GAMBAR STORAGE ---
  async deleteSoal(id, nomorUrut) {
    if (!id) return;

    const konfirmasi = confirm(
      `KONFIRMASI HAPUS BUTIR SOAL\n\n` +
      `Apakah Anda yakin ingin menghapus Soal #${nomorUrut} beserta file gambarnya dari Storage secara permanen?\n` +
      `Tindakan ini tidak dapat dibatalkan.`
    );

    if (!konfirmasi) return;

    try {
      const targetSoal = (State.questions || []).filter(q => q.id === id);
      const remainingSoal = (State.questions || []).filter(q => q.id !== id);

      const client = await DB.getClient();
      const { error } = await client.from('bank_soal').delete().eq('id', id);
      if (error) {
        const { error: errCap } = await client.from('bank_soal').delete().eq('ID', id);
        if (errCap) throw errCap;
      }

      const deletedImgCount = await this.cleanupUnusedStorageImages(targetSoal, remainingSoal);
      const msgImg = deletedImgCount > 0 ? ` (${deletedImgCount} file gambar ikut dibersihkan dari Storage)` : '';

      alert(`Soal #${nomorUrut} berhasil dihapus dari Bank Soal${msgImg}.`);
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal menghapus soal: " + err.message);
    }
  },

  // --- HAPUS SELURUH PAKET SOAL PER MAPEL & KELAS + BERSIHKAN GAMBAR STORAGE ---
  async deleteGroupSoal(encodedMapel, encodedKelas, jumlahSoal) {
    const mapel = decodeURIComponent(encodedMapel);
    const kelas = decodeURIComponent(encodedKelas);

    const konfirmasi = confirm(
      `PERINGATAN PENGHAPUSAN MASSAL!\n\n` +
      `Mata Pelajaran : ${mapel}\n` +
      `Kelas Target   : ${kelas}\n` +
      `Jumlah Butir   : ${jumlahSoal} Soal\n\n` +
      `Seluruh ${jumlahSoal} soal dan file gambar terkait pada paket ini akan DIHAPUS PERMANEN.\n` +
      `Apakah Anda yakin ingin melanjutkan?`
    );

    if (!konfirmasi) return;

    try {
      const client = await DB.getClient();
      const questionsToDelete = (State.questions || []).filter(q => 
        this.normalizeText(q.mapel) === this.normalizeText(mapel) &&
        this.normalizeText(q.kelas) === this.normalizeText(kelas)
      );
      const idsToDelete = questionsToDelete.map(q => q.id);
      const remainingQuestions = (State.questions || []).filter(q => !idsToDelete.includes(q.id));

      if (idsToDelete.length === 0) return;

      const { error } = await client.from('bank_soal').delete().in('id', idsToDelete);
      if (error) throw error;

      const deletedImgCount = await this.cleanupUnusedStorageImages(questionsToDelete, remainingQuestions);
      const msgImg = deletedImgCount > 0 ? `\n🧹 ${deletedImgCount} file gambar di bucket Storage otomatis dihapus.` : '';

      alert(`Berhasil menghapus seluruh ${idsToDelete.length} butir soal pada paket "${mapel} (${kelas})".${msgImg}`);
      await this.loadAndRender();
    } catch (err) {
      alert("Gagal menghapus paket soal: " + err.message);
    }
  },

  async printNaskahSoal(encodedMapel, encodedKelas) {
    const mapel = decodeURIComponent(encodedMapel);
    const kelas = decodeURIComponent(encodedKelas);

    const questionsToPrint = (State.questions || []).filter(q => 
      this.normalizeText(q.mapel) === this.normalizeText(mapel) &&
      this.normalizeText(q.kelas) === this.normalizeText(kelas)
    );

    if (questionsToPrint.length === 0) {
      alert("Tidak ada butir soal yang ditemukan untuk dicetak.");
      return;
    }

    const kopUrl = "https://nbwpnhshhpfqtmbwewgk.supabase.co/storage/v1/object/public/media-sekolah/kop_sekolah.png";
    const printWindow = window.open('', '_blank');

    let printHtml = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>NASKAH SOAL UJIAN - ${mapel} (${kelas})</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Inter', sans-serif; color: #0f172a; font-size: 11pt; }
          .soal-block { page-break-inside: avoid; }
        </style>
      </head>
      <body class="p-4 bg-white" onload="window.print()">
        
        <div class="mb-4 border-b-4 border-double border-slate-900 pb-2 text-center">
          <img src="${kopUrl}" alt="Kop Surat SMKN 1 Wakatobi" class="w-full max-h-32 object-contain mx-auto" 
               onerror="this.style.display='none'; document.getElementById('fallback-header').style.display='block';">
          
          <div id="fallback-header" class="hidden text-center">
            <h1 class="font-extrabold text-sm uppercase text-slate-900">PEMERINTAH PROVINSI SULAWESI TENGGARA</h1>
            <h2 class="font-bold text-base uppercase text-slate-900">DINAS PENDIDIKAN DAN KEBUDAYAAN</h2>
            <h3 class="font-black text-lg uppercase text-blue-900">SMK NEGERI 1 WAKATOBI</h3>
            <p class="text-[10px] text-slate-600 italic">Desa Numana, Kec. Wangi-Wangi Selatan, Kab. Wakatobi, Sulawesi Tenggara</p>
          </div>
        </div>

        <div class="border border-slate-800 rounded-lg p-3 mb-6 bg-slate-50 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div><strong>Mata Pelajaran:</strong> ${mapel}</div>
            <div><strong>Satuan Pendidikan:</strong> SMKN 1 Wakatobi</div>
            <div><strong>Kelas Target:</strong> ${kelas}</div>
            <div><strong>Bentuk Soal:</strong> Pilihan Ganda</div>
            <div><strong>Jumlah Soal:</strong> ${questionsToPrint.length} Butir</div>
            <div><strong>Tahun Ajaran:</strong> 2026/2027</div>
          </div>
        </div>

        <h4 class="font-bold text-center text-sm uppercase mb-4 tracking-wide border-b pb-1">NASKAH BUTIR SOAL UJIAN SUMATIF</h4>

        <div class="space-y-5">
    `;

    questionsToPrint.forEach((q, idx) => {
      printHtml += `
        <div class="soal-block space-y-2 border-b border-slate-200 pb-3">
          <div class="flex items-start gap-2">
            <span class="font-bold">${idx + 1}.</span>
            <div class="flex-1 leading-relaxed text-justify">${q.soal_html}</div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6 text-xs mt-2">
            <div><strong>A.</strong> ${q.opsi_a}</div>
            <div><strong>B.</strong> ${q.opsi_b}</div>
            <div><strong>C.</strong> ${q.opsi_c}</div>
            <div><strong>D.</strong> ${q.opsi_d}</div>
            <div class="sm:col-span-2"><strong>E.</strong> ${q.opsi_e}</div>
          </div>
        </div>
      `;
    });

    printHtml += `
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printHtml);
    printWindow.document.close();
  },

  toggleMapelGroup(groupId) {
    const groupEl = document.getElementById(groupId);
    const iconBtn = document.getElementById(`btn-mapel-icon-${groupId}`);

    if (!groupEl) return;

    if (groupEl.classList.contains('hidden')) {
      groupEl.classList.remove('hidden');
      if (iconBtn) iconBtn.innerHTML = `<i class="fa-solid fa-chevron-up text-xs text-amber-300"></i>`;
    } else {
      groupEl.classList.add('hidden');
      if (iconBtn) iconBtn.innerHTML = `<i class="fa-solid fa-chevron-down text-xs"></i>`;
    }
  },

  toggleSoalDetail(id) {
    const detailEl = document.getElementById(`detail-soal-${id}`);
    const btnEl = document.getElementById(`btn-toggle-${id}`);

    if (!detailEl || !btnEl) return;

    if (detailEl.classList.contains('hidden')) {
      detailEl.classList.remove('hidden');
      btnEl.innerHTML = `🙈 Tutup`;
      btnEl.className = "bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] px-2.5 py-1 rounded border border-slate-300 transition";
    } else {
      detailEl.classList.add('hidden');
      btnEl.innerHTML = `👁️ Buka`;
      btnEl.className = "bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] px-2.5 py-1 rounded border border-blue-200 transition";
    }
  },

  async processHTMLUpload(e) {
    e.preventDefault();
    const mapelSelect = document.getElementById('select-upload-mapel').value;
    const selectedKelasNodes = document.querySelectorAll('.chk-upload-kelas:checked');
    const selectedKelas = Array.from(selectedKelasNodes).map(cb => cb.value);

    if (!mapelSelect) {
      alert("Silakan pilih Mata Pelajaran!");
      return;
    }

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
        fileInput.value = '';
        await this.loadAndRender();

        const fMapel = document.getElementById('bank-filter-mapel');
        const fKelas = document.getElementById('bank-filter-kelas');
        if (fMapel) fMapel.value = 'ALL';
        if (fKelas) fKelas.value = 'ALL';
        this.renderBankSoalList();

        App.switchAdminTab('bank-soal');
      } catch (err) {
        alert("Gagal menyimpan soal ke database: " + err.message);
      }
    };

    reader.readAsText(file);
  },

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
