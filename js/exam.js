const ExamModule = {
  activeRecordId: null,
  activeScheduleObj: null,
  storageKey: null,
  remainingSeconds: 0,
  heartbeatInterval: null,

  OFFLINE_PKG_PREFIX: 'cbt_offline_pkg_kelas_',
  PENDING_SYNC_KEY: 'cbt_pending_hasil_ujian_v1',
  LOCAL_COMPLETED_KEY: 'cbt_local_completed_exams_v1',

  normalizeText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  isMapelMatch(mapelA, mapelB) {
    const clean = (s) => String(s || '')
      .toUpperCase()
      .replace(/&/g, ' DAN ')
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const a = clean(mapelA);
    const b = clean(mapelB);
    if (!a || !b) return false;
    if (a === b) return true;
    return (a.length >= 6 && b.includes(a)) || (b.length >= 6 && a.includes(b));
  },

  getDeviceToken() {
    const key = 'cbt_device_token_smkn1wkt';
    let token = localStorage.getItem(key);
    if (!token) {
      token = 'DEV_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(key, token);
    }
    return token;
  },

  getStorageKey(student, mapel) {
    const sId = String(student?.id_siswa || student?.nisn || 'guest').trim();
    const mId = String(mapel || 'mapel').trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return `cbt_autosave_${sId}_${mId}`;
  },

  // =========================================================================
  // MODUL SEMI-ONLINE: PAKET OFFLINE, LOBBY PESERTA & SINKRONISASI ANTREAN
  // =========================================================================
  getOfflinePackageKey(kelas) {
    return this.OFFLINE_PKG_PREFIX + this.normalizeText(kelas).replace(/[^A-Z0-9]/g, '_');
  },

  getOfflinePackage(kelas) {
    try {
      const raw = localStorage.getItem(this.getOfflinePackageKey(kelas));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  getPendingSyncQueue() {
    try {
      const raw = localStorage.getItem(this.PENDING_SYNC_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  savePendingSyncQueue(queue) {
    try {
      localStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(queue || []));
    } catch (e) {}
  },

  enqueueOfflineResult(payloadHasil) {
    const queue = this.getPendingSyncQueue();
    const sId = String(payloadHasil.id_siswa || '').trim();
    const mNorm = this.normalizeText(payloadHasil.mapel);

    const filtered = queue.filter(item =>
      !(String(item.id_siswa || '').trim() === sId && this.normalizeText(item.mapel) === mNorm)
    );
    filtered.push({
      ...payloadHasil,
      queuedAt: Date.now()
    });
    this.savePendingSyncQueue(filtered);
    this.markExamCompletedLocally(payloadHasil);
  },

  markExamCompletedLocally(payloadHasil) {
    try {
      const raw = localStorage.getItem(this.LOCAL_COMPLETED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const sId = String(payloadHasil.id_siswa || '').trim();
      const sNama = this.normalizeText(payloadHasil.nama_siswa || '');
      const mNorm = this.normalizeText(payloadHasil.mapel);

      const filtered = list.filter(item =>
        !(
          (String(item.id_siswa || '').trim() === sId || this.normalizeText(item.nama_siswa) === sNama) &&
          this.normalizeText(item.mapel) === mNorm
        )
      );
      filtered.push({
        id_siswa: sId,
        nama_siswa: payloadHasil.nama_siswa,
        kelas: payloadHasil.kelas,
        mapel: payloadHasil.mapel,
        nilai: payloadHasil.nilai,
        status_selesai: payloadHasil.status_selesai,
        waktu_selesai: payloadHasil.waktu_selesai
      });
      localStorage.setItem(this.LOCAL_COMPLETED_KEY, JSON.stringify(filtered));
    } catch (e) {}
  },

  findLocalCompletedExam(student, mapel) {
    try {
      const raw = localStorage.getItem(this.LOCAL_COMPLETED_KEY);
      if (!raw) return null;
      const list = JSON.parse(raw);
      const sId = String(student.id_siswa || student.nisn || '').trim();
      const sNisn = String(student.nisn || '').trim();
      const sNama = this.normalizeText(student.nama || '');

      return list.find(item => {
        if (!this.isMapelMatch(item.mapel, mapel)) return false;
        const iId = String(item.id_siswa || '').trim();
        const iNama = this.normalizeText(item.nama_siswa || '');
        return (sId && iId === sId) || (sNisn && iId === sNisn) || (sNama && iNama === sNama);
      }) || null;
    } catch (e) {
      return null;
    }
  },

  async syncOfflineResults(manualTrigger = false) {
    const queue = this.getPendingSyncQueue();
    if (queue.length === 0) {
      if (manualTrigger) alert("Semua hasil ujian sudah tersinkronisasi dengan server.");
      return 0;
    }

    if (!navigator.onLine) {
      if (manualTrigger) {
        alert("Perangkat masih OFFLINE.\n\nHubungkan HP ke WiFi sekolah atau hotspot pengawas terlebih dahulu lalu tekan tombol Sinkronkan Sekarang.");
      }
      return 0;
    }

    const client = await DB.getClient();
    if (!client) {
      if (manualTrigger) alert("Gagal terhubung ke server Supabase. Coba beberapa saat lagi.");
      return 0;
    }

    let syncedCount = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        const sId = String(item.id_siswa || '').trim();

        const { data: existingRows } = await client
          .from('hasil_ujian')
          .select('*')
          .eq('mapel', item.mapel);

        const matchedRow = (existingRows || []).find(r => {
          const rId = String(r.ID_SISWA || r.id_siswa || '').trim();
          const rNama = this.normalizeText(r.nama_siswa || r.NAMA_SISWA || '');
          return (sId && rId === sId) || (rNama && rNama === this.normalizeText(item.nama_siswa));
        });

        if (matchedRow) {
          const rowId = matchedRow.id || matchedRow.ID;
          const { error: updErr } = await client
            .from('hasil_ujian')
            .update({
              nilai: item.nilai,
              jumlah_pelanggaran: item.jumlah_pelanggaran,
              status_selesai: item.status_selesai,
              waktu_selesai: item.waktu_selesai
            })
            .eq('id', rowId);
          if (updErr) throw updErr;
        } else {
          await DB.insertHasilUjian({
            id_siswa: item.id_siswa,
            nama_siswa: item.nama_siswa,
            kelas: item.kelas,
            mapel: item.mapel,
            nilai: item.nilai,
            jumlah_pelanggaran: item.jumlah_pelanggaran,
            status_selesai: item.status_selesai,
            waktu_selesai: item.waktu_selesai
          });
        }

        syncedCount++;
      } catch (err) {
        console.warn("[ExamModule] Gagal sync item antrean:", err.message);
        remaining.push(item);
      }
    }

    this.savePendingSyncQueue(remaining);

    if (manualTrigger) {
      if (remaining.length === 0) {
        alert(`SINKRONISASI BERHASIL!\n\n${syncedCount} hasil ujian telah berhasil dikirim ke server pusat.`);
      } else {
        alert(`${syncedCount} hasil terkirim, ${remaining.length} hasil masih menunggu koneksi stabil.`);
      }
    }

    if (State.currentUser && State.currentUser.role === 'siswa') {
      await this.renderStudentLobby();
    }

    return syncedCount;
  },

  async downloadOfflinePackage() {
    const student = State.currentUser;
    if (!student || !student.kelas) return;

    if (!navigator.onLine) {
      alert("Tidak ada koneksi internet!\n\nHubungkan perangkat ke internet/WiFi terlebih dahulu untuk mengunduh paket ujian offline.");
      return;
    }

    const btn = document.getElementById('btn-download-offline-pkg');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Mengunduh Paket Soal & Gambar...</span>`;
    }

    try {
      const sKelasNorm = this.normalizeText(student.kelas);

      // 1. Ambil seluruh jadwal untuk kelas siswa
      const allSchedules = await DB.fetchSchedules();
      const classSchedules = (allSchedules || []).filter(j => {
        const targetList = String(j.kelas).split(',').map(k => this.normalizeText(k));
        return targetList.includes(sKelasNorm);
      });

      // 2. Ambil seluruh bank soal & saring khusus kelas siswa
      const rawBank = await DB.fetchBankSoal();
      const classQuestions = (rawBank || [])
        .map(q => ({
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
        }))
        .filter(q => {
          const targetList = String(q.kelas).split(',').map(k => this.normalizeText(k));
          return targetList.includes(sKelasNorm);
        });

      // 3. Pre-cache semua URL gambar soal & opsi agar tampil saat offline
      const imgUrls = new Set();
      classQuestions.forEach(q => {
        const htmlAll = [q.soal_html, q.opsi_a, q.opsi_b, q.opsi_c, q.opsi_d, q.opsi_e].join(' ');
        const regex = /<img[^>]+src=["']([^"']+)["']/gi;
        let m;
        while ((m = regex.exec(htmlAll)) !== null) {
          if (m[1]) imgUrls.add(m[1]);
        }
      });

      if ('caches' in window && imgUrls.size > 0) {
        try {
          const imgCache = await caches.open('cbt-smkn1wkt-images-v1');
          await Promise.allSettled(
            Array.from(imgUrls).map(url => imgCache.add(url).catch(() => null))
          );
        } catch (e) {}
      }

      // 4. Simpan ke localStorage
      const pkgData = {
        kelas: student.kelas,
        schedules: classSchedules,
        questions: classQuestions,
        imageCount: imgUrls.size,
        downloadedAt: new Date().toISOString()
      };
      localStorage.setItem(this.getOfflinePackageKey(student.kelas), JSON.stringify(pkgData));

      const mapelTersimpan = [...new Set(classQuestions.map(q => q.mapel))];
      alert(
        `PAKET UJIAN OFFLINE SIAP!\n\n` +
        `Kelas : ${student.kelas}\n` +
        `Jadwal Tersimpan : ${classSchedules.length} jadwal\n` +
        `Butir Soal Tersimpan : ${classQuestions.length} soal (${imgUrls.size} gambar)\n` +
        `Mapel Tersedia Offline:\n- ${mapelTersimpan.join('\n- ') || '(Tidak ada)'}\n\n` +
        `Perangkat ini sekarang siap digunakan untuk ujian secara OFFLINE maupun ONLINE.`
      );

      await this.renderStudentLobby();
    } catch (err) {
      alert("Gagal mengunduh paket offline: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  },

  async openStudentLobby() {
    if (navigator.onLine && this.getPendingSyncQueue().length > 0) {
      await this.syncOfflineResults(false);
    }
    await this.renderStudentLobby();
  },

  async renderStudentLobby() {
    const student = State.currentUser;
    if (!student) return;

    const nameEl = document.getElementById('lobby-student-name');
    const nisnEl = document.getElementById('lobby-student-nisn');
    const kelasEl = document.getElementById('lobby-student-kelas');
    const netBadge = document.getElementById('lobby-network-badge');
    const offlineBadge = document.getElementById('lobby-offline-status-badge');
    const lastSyncEl = document.getElementById('lobby-last-sync-text');
    const syncBanner = document.getElementById('lobby-sync-banner');
    const schedulesContainer = document.getElementById('lobby-schedules-container');

    if (nameEl) nameEl.textContent = student.nama || '-';
    if (nisnEl) nisnEl.textContent = student.nisn || '-';
    if (kelasEl) kelasEl.textContent = student.kelas || '-';

    const isOnline = navigator.onLine;
    if (netBadge) {
      netBadge.textContent = isOnline ? 'Online' : 'Offline';
      netBadge.className = isOnline
        ? 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-600 text-white'
        : 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-slate-900';
    }

    const pendingQueue = this.getPendingSyncQueue();
    if (syncBanner) {
      if (pendingQueue.length > 0) {
        syncBanner.classList.remove('hidden');
        const syncTitle = document.getElementById('lobby-sync-title');
        if (syncTitle) {
          syncTitle.textContent = `${pendingQueue.length} Hasil Ujian Menunggu Sinkronisasi Internet`;
        }
      } else {
        syncBanner.classList.add('hidden');
      }
    }

    const offlinePkg = this.getOfflinePackage(student.kelas);
    if (offlineBadge) {
      if (offlinePkg && Array.isArray(offlinePkg.questions) && offlinePkg.questions.length > 0) {
        offlineBadge.textContent = `✅ Siap Ujian Offline (${offlinePkg.questions.length} Soal)`;
        offlineBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
        if (lastSyncEl && offlinePkg.downloadedAt) {
          const dt = new Date(offlinePkg.downloadedAt);
          lastSyncEl.textContent = `Terakhir diperbarui: ${dt.toLocaleDateString('id-ID')} ${dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
        }
      } else {
        offlineBadge.textContent = '⚠️ Paket Offline Belum Diunduh';
        offlineBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300';
        if (lastSyncEl) lastSyncEl.textContent = '';
      }
    }

    if (!schedulesContainer) return;
    schedulesContainer.innerHTML = `<p class="text-xs text-slate-400 italic">Memuat daftar jadwal ujian...</p>`;

    const sKelasNorm = this.normalizeText(student.kelas);
    let schedules = [];
    if (isOnline) {
      try {
        const onlineAll = await DB.fetchSchedules();
        schedules = (onlineAll || []).filter(j => {
          const targetList = String(j.kelas).split(',').map(k => this.normalizeText(k));
          return targetList.includes(sKelasNorm);
        });
      } catch (e) {}
    }
    if (schedules.length === 0 && offlinePkg && Array.isArray(offlinePkg.schedules)) {
      schedules = offlinePkg.schedules;
    }

    let onlineHasil = [];
    if (isOnline) {
      try {
        onlineHasil = await DB.fetchHasilUjian();
      } catch (e) {}
    }

    if (schedules.length === 0) {
      schedulesContainer.innerHTML = `
        <div class="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <p class="font-bold text-slate-700">Belum Ada Jadwal Ujian untuk Kelas ${student.kelas}</p>
          <p class="mt-1 text-slate-500">Silakan tekan "Simpan / Perbarui Paket Offline" jika jadwal baru saja diaktifkan oleh proktor.</p>
        </div>`;
      return;
    }

    const now = new Date();
    const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const sId = String(student.id_siswa || student.nisn || '').trim();
    const sNisn = String(student.nisn || '').trim();
    const sNama = this.normalizeText(student.nama || '');

    schedulesContainer.innerHTML = '';

    schedules.forEach(j => {
      const jamMulaiClean = String(j.jamMulai).substring(0, 5);
      const jamSelesaiClean = String(j.jamSelesai).substring(0, 5);
      const isToday = String(j.tanggal).trim() === currentDateStr;
      const isInWindow = isToday && currentTimeStr >= jamMulaiClean && currentTimeStr <= jamSelesaiClean;

      const localDone = this.findLocalCompletedExam(student, j.mapel);
      const serverDone = (onlineHasil || []).find(h => {
        if (!this.isMapelMatch(h.mapel, j.mapel)) return false;
        const st = this.normalizeText(h.status_selesai);
        if (st !== 'SELESAI' && st !== 'DIDISKUALIFIKASI') return false;
        const hId = String(h.ID_SISWA || '').trim();
        const hNama = this.normalizeText(h.nama_siswa || '');
        return (sId && hId === sId) || (sNisn && hId === sNisn) || (sNama && hNama === sNama);
      });

      const doneRecord = serverDone || localDone;
      const hasOfflineSoal = offlinePkg && Array.isArray(offlinePkg.questions) &&
        offlinePkg.questions.some(q => this.isMapelMatch(q.mapel, j.mapel));

      let actionHtml = '';
      let cardBorder = 'border-slate-200 bg-white';

      if (doneRecord) {
        const nilaiTampil = doneRecord.nilai !== undefined ? doneRecord.nilai : 0;
        const statusTampil = this.normalizeText(doneRecord.status_selesai || 'SELESAI');
        cardBorder = 'border-emerald-200 bg-emerald-50/40';
        actionHtml = `
          <div class="text-right">
            <span class="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ✅ ${statusTampil} • Nilai: ${nilaiTampil}
            </span>
          </div>`;
      } else if (isInWindow) {
        cardBorder = 'border-ocean-500 bg-ocean-50/50 ring-2 ring-ocean-500/20';
        const btnDisabled = !isOnline && !hasOfflineSoal;
        actionHtml = `
          <button ${btnDisabled ? 'disabled' : ''}
            onclick='ExamModule.startExam(${JSON.stringify(j).replace(/'/g, "&#39;")})'
            class="${btnDisabled ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'} font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2">
            <i class="fa-solid fa-play"></i>
            <span>${btnDisabled ? 'Paket Offline Belum Ada' : 'Mulai Ujian Sekarang'}</span>
          </button>`;
      } else {
        actionHtml = `
          <span class="inline-block px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            ⏳ Belum Waktu Ujian
          </span>`;
      }

      const card = document.createElement('div');
      card.className = `p-4 rounded-2xl border ${cardBorder} flex flex-wrap items-center justify-between gap-3`;
      card.innerHTML = `
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="font-extrabold text-sm text-slate-800">${j.mapel}</h4>
            ${hasOfflineSoal
              ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">Tersedia Offline</span>`
              : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">Online Only</span>`
            }
          </div>
          <p class="text-xs text-slate-600">
            <i class="fa-regular fa-calendar mr-1 text-ocean-700"></i> ${j.tanggal} &bull;
            <i class="fa-regular fa-clock ml-1 mr-1 text-ocean-700"></i> ${jamMulaiClean} - ${jamSelesaiClean} (${j.durasi} Menit)
          </p>
        </div>
        <div>${actionHtml}</div>
      `;
      schedulesContainer.appendChild(card);
    });
  },

  // =========================================================================
  // AUTO-SAVE PROGRES JAWABAN LOKAL
  // =========================================================================
  saveProgressToLocal() {
    if (!this.storageKey || !State.examActive) return;
    try {
      const answersByQuestionId = {};
      (State.questions || []).forEach((q, idx) => {
        if (State.answers[idx]) {
          answersByQuestionId[String(q.id)] = State.answers[idx];
        }
      });

      const snapshot = {
        answersByQuestionId,
        currentQuestionIdx: State.currentQuestionIdx,
        remainingSeconds: this.remainingSeconds,
        violations: State.violations,
        updatedAt: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(snapshot));
    } catch (e) {
      console.warn("[ExamModule] Gagal auto-save ke localStorage:", e.message);
    }
  },

  restoreProgressFromLocal(questions) {
    if (!this.storageKey) return null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.answersByQuestionId) return null;

      if (Date.now() - (parsed.updatedAt || 0) > 12 * 60 * 60 * 1000) {
        localStorage.removeItem(this.storageKey);
        return null;
      }

      const restoredAnswers = {};
      questions.forEach((q, idx) => {
        const savedChoice = parsed.answersByQuestionId[String(q.id)];
        if (savedChoice) {
          restoredAnswers[idx] = savedChoice;
        }
      });

      return {
        answers: restoredAnswers,
        currentQuestionIdx: Math.min(parsed.currentQuestionIdx || 0, Math.max(0, questions.length - 1)),
        remainingSeconds: parsed.remainingSeconds > 5 ? parsed.remainingSeconds : null,
        violations: parsed.violations || 0
      };
    } catch (e) {
      return null;
    }
  },

  clearProgressLocal() {
    if (!this.storageKey) return;
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {}
  },

  startSessionHeartbeat() {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(async () => {
      if (!State.examActive || !this.activeRecordId || !navigator.onLine) return;
      try {
        const client = await DB.getClient();
        if (!client) return;

        const { data: rows } = await client
          .from('hasil_ujian')
          .select('id, status_selesai')
          .eq('id', this.activeRecordId);

        if (!rows || rows.length === 0) {
          State.examActive = false;
          clearInterval(State.timerInterval);
          clearInterval(this.heartbeatInterval);
          this.clearProgressLocal();
          alert("Sesi ujian Anda telah direset oleh Pengawas/Admin. Silakan login ulang.");
          AuthModule.logout();
          return;
        }

        await client
          .from('hasil_ujian')
          .update({ waktu_selesai: new Date().toISOString() })
          .eq('id', this.activeRecordId);
      } catch (e) {
        console.warn("[ExamModule] Heartbeat dilewati:", e.message);
      }
    }, 20000);
  },

  setScreenShield(obscure) {
    const examScreen = document.getElementById('screen-exam');
    if (!examScreen) return;
    if (obscure) {
      examScreen.style.filter = 'blur(18px)';
      examScreen.style.userSelect = 'none';
    } else {
      examScreen.style.filter = '';
    }
  },

  setupSecurityListeners() {
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && State.examActive) {
        this.handleViolation("Anda keluar dari mode Fullscreen!");
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && State.examActive) {
        this.setScreenShield(true);
        this.handleViolation("Anda membuka tab lain / meninggalkan layar ujian!");
      } else if (State.examActive) {
        this.setScreenShield(false);
      }
    });

    window.addEventListener('blur', () => {
      if (State.examActive) {
        this.setScreenShield(true);
      }
    });

    window.addEventListener('focus', () => {
      if (State.examActive) {
        this.setScreenShield(false);
      }
    });

    document.addEventListener('contextmenu', (e) => {
      if (State.examActive) {
        e.preventDefault();
      }
    });

    ['copy', 'cut', 'paste'].forEach(evtName => {
      document.addEventListener(evtName, (e) => {
        if (State.examActive) {
          e.preventDefault();
        }
      });
    });

    document.addEventListener('keyup', (e) => {
      if (!State.examActive) return;
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        this.setScreenShield(true);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(() => {});
        }
        this.handleViolation("Tangkapan layar (Screenshot / PrintScreen) dilarang selama ujian!");
        setTimeout(() => this.setScreenShield(false), 2000);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!State.examActive) return;
      const key = String(e.key || '').toLowerCase();

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['s', '3', '4', '5'].includes(key)) {
        e.preventDefault();
        this.setScreenShield(true);
        this.handleViolation("Tangkapan layar (Screenshot) dilarang selama ujian!");
        setTimeout(() => this.setScreenShield(false), 2000);
        return;
      }

      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 'p', 's', 'u'].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault();
      }
    });
  },

  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  // =========================================================================
  // MULAI UJIAN (MENDUKUNG MODE ONLINE MAUPUN 100% OFFLINE)
  // =========================================================================
  async startExam(selectedSchedule = null) {
    State.examActive = false;
    this.activeRecordId = null;
    clearInterval(this.heartbeatInterval);
    const student = State.currentUser;

    if (!student || !student.kelas) {
      alert("Data profil siswa tidak ditemukan.");
      AuthModule.logout();
      return;
    }

    try {
      const isOnline = navigator.onLine;
      const offlinePkg = this.getOfflinePackage(student.kelas);

      // 1. Tentukan Jadwal Ujian Aktif (Online -> fallback ke Offline Package)
      let activeSchedule = selectedSchedule;
      if (!activeSchedule && isOnline) {
        activeSchedule = await DB.fetchActiveScheduleForStudent(student.kelas);
      }
      if (!activeSchedule && offlinePkg && Array.isArray(offlinePkg.schedules)) {
        const now = new Date();
        const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        activeSchedule = offlinePkg.schedules.find(j => {
          const matchTanggal = String(j.tanggal).trim() === currentDateStr;
          const jm = String(j.jamMulai).substring(0, 5);
          const js = String(j.jamSelesai).substring(0, 5);
          return matchTanggal && currentTimeStr >= jm && currentTimeStr <= js;
        }) || null;
      }

      if (!activeSchedule) {
        alert(`TIDAK ADA JADWAL UJIAN AKTIF!\n\nHai ${student.nama}, saat ini tidak ada jadwal ujian yang aktif untuk kelas ${student.kelas}.`);
        App.showScreen('student-lobby');
        await this.renderStudentLobby();
        return;
      }

      this.activeScheduleObj = activeSchedule;

      const sId = String(student.id_siswa || student.nisn || '').trim();
      const sNisn = String(student.nisn || student.NISN || '').trim();
      const sNama = this.normalizeText(student.nama || '');
      const sKelas = this.normalizeText(student.kelas || '');
      const targetMapel = this.normalizeText(activeSchedule.mapel || '');
      const deviceLockKey = `cbt_lock_${sId || sNama}_${targetMapel}`;

      // 2. Cek apakah sudah selesai secara lokal
      const localFinished = this.findLocalCompletedExam(student, activeSchedule.mapel);
      if (localFinished) {
        alert(`AKSES UJIAN DITOLAK!\n\nHalo ${student.nama}, Anda tercatat SUDAH MENYELESAIKAN ujian "${activeSchedule.mapel}" di perangkat ini (Nilai: ${localFinished.nilai}).`);
        App.showScreen('student-lobby');
        await this.renderStudentLobby();
        return;
      }

      // 3. Jika ONLINE, cek riwayat di Supabase & cegah login ganda perangkat lain
      let client = null;
      if (isOnline) {
        client = await DB.getClient();
        if (client) {
          const existingHasil = typeof DB.fetchAllRows === 'function'
            ? await DB.fetchAllRows('hasil_ujian', 'id', true)
            : (await client.from('hasil_ujian').select('*')).data;

          if (existingHasil) {
            const studentRecords = existingHasil.filter(h => {
              if (!this.isMapelMatch(h.mapel || h.MAPEL || '', activeSchedule.mapel)) return false;

              const hId = String(h.id_siswa || h.ID_SISWA || '').trim();
              const hNama = this.normalizeText(h.nama_siswa || h.NAMA_SISWA || '');
              const hKelas = this.normalizeText(h.kelas || h.KELAS || '');

              const matchId = (sId !== '' && hId === sId) || (sNisn !== '' && hId === sNisn);
              const matchNamaKelas = (sNama !== '' && hNama === sNama && hKelas === sKelas);
              return matchId || matchNamaKelas;
            });

            const finishedRec = studentRecords.find(h => {
              const st = this.normalizeText(h.status_selesai || h.STATUS_SELESAI || '');
              return st === 'SELESAI' || st === 'DIDISKUALIFIKASI';
            });

            if (finishedRec) {
              const stLabel = this.normalizeText(finishedRec.status_selesai || 'SELESAI');
              const nilaiPrev = finishedRec.nilai !== undefined ? finishedRec.nilai : (finishedRec.NILAI || 0);
              this.markExamCompletedLocally({
                id_siswa: sId,
                nama_siswa: student.nama,
                kelas: student.kelas,
                mapel: activeSchedule.mapel,
                nilai: nilaiPrev,
                status_selesai: stLabel,
                waktu_selesai: finishedRec.waktu_selesai || new Date().toISOString()
              });
              alert(
                `AKSES UJIAN DITOLAK!\n\n` +
                `Halo ${student.nama}, Anda tercatat SUDAH MENYELESAIKAN ujian mata pelajaran "${activeSchedule.mapel}".\n` +
                `Status: ${stLabel} | Nilai: ${nilaiPrev}`
              );
              App.showScreen('student-lobby');
              await this.renderStudentLobby();
              return;
            }

            const ongoingRec = studentRecords.find(h => {
              const st = this.normalizeText(h.status_selesai || h.STATUS_SELESAI || '');
              return st === 'MENGERJAKAN';
            });

            if (ongoingRec) {
              const recIdStr = String(ongoingRec.id || ongoingRec.ID || '');
              const isSameDevice = localStorage.getItem(deviceLockKey) === recIdStr;
              const lastBeat = new Date(ongoingRec.waktu_selesai || ongoingRec.WAKTU_SELESAI || 0).getTime();
              const isSessionStillFresh = (Date.now() - lastBeat) < 90 * 1000;

              if (!isSameDevice && isSessionStillFresh) {
                alert(
                  `LOGIN GANDA TERDETEKSI!\n\n` +
                  `Akun atas nama "${student.nama}" saat ini SEDANG AKTIF mengerjakan ujian "${activeSchedule.mapel}" di perangkat/browser lain!`
                );
                App.showScreen('student-lobby');
                await this.renderStudentLobby();
                return;
              }

              this.activeRecordId = ongoingRec.id || ongoingRec.ID;
              if (this.activeRecordId) {
                localStorage.setItem(deviceLockKey, String(this.activeRecordId));
              }
            }
          }
        }
      }

      // 4. Ambil Bank Soal (Online dari Supabase -> fallback ke Offline Package)
      let rawQuestions = [];
      if (isOnline && client) {
        try {
          rawQuestions = typeof DB.fetchBankSoal === 'function'
            ? await DB.fetchBankSoal()
            : ((await client.from('bank_soal').select('*')).data || []);
        } catch (e) {}
      }

      if ((!rawQuestions || rawQuestions.length === 0) && offlinePkg && Array.isArray(offlinePkg.questions)) {
        rawQuestions = offlinePkg.questions;
      }

      const allQuestions = (rawQuestions || []).map(q => ({
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

      const filtered = allQuestions.filter(q => {
        const matchMapel = this.isMapelMatch(q.mapel, activeSchedule.mapel);
        const listOfKelasTarget = String(q.kelas).split(',').map(k => this.normalizeText(k));
        const matchKelas = listOfKelasTarget.includes(sKelas);
        return matchMapel && matchKelas;
      });

      if (filtered.length === 0) {
        alert(`Naskah soal untuk "${activeSchedule.mapel}" tidak ditemukan (baik di server maupun di paket offline perangkat ini).\n\nSilakan hubungi pengawas.`);
        App.showScreen('student-lobby');
        await this.renderStudentLobby();
        return;
      }

      // 5. Jika ONLINE, catat status "MENGERJAKAN" agar muncul di Dashboard Real-Time
      if (isOnline && client) {
        if (!this.activeRecordId) {
          try {
            const insertedData = await DB.insertHasilUjian({
              id_siswa: sId,
              nama_siswa: student.nama,
              kelas: student.kelas,
              mapel: activeSchedule.mapel,
              nilai: 0,
              jumlah_pelanggaran: 0,
              status_selesai: 'MENGERJAKAN',
              waktu_selesai: new Date().toISOString()
            });

            if (insertedData && insertedData.length > 0) {
              this.activeRecordId = insertedData[0].id || insertedData[0].ID;
              localStorage.setItem(deviceLockKey, String(this.activeRecordId));
            }
          } catch (e) {
            console.warn("[ExamModule] Log status mengerjakan dilewati:", e.message);
          }
        } else {
          try {
            await client.from('hasil_ujian').update({
              waktu_selesai: new Date().toISOString()
            }).eq('id', this.activeRecordId);
          } catch (e) {}
        }
      }

      // 6. Tampilkan Layar Ujian & Acak Soal per Siswa
      App.showScreen('exam');
      const examScreen = document.getElementById('screen-exam');
      if (examScreen) {
        examScreen.classList.add('select-none');
      }

      State.examActive = true;
      State.violations = 0;
      State.currentQuestionIdx = 0;
      State.answers = {};

      const modeTag = navigator.onLine ? 'ONLINE' : 'OFFLINE';
      document.getElementById('exam-student-info').textContent = `Peserta: ${student.nama} (${student.kelas}) • Mode ${modeTag}`;
      document.getElementById('exam-mapel-title').textContent = `Ujian Sumatif: ${activeSchedule.mapel}`;

      State.questions = this.shuffleArray(filtered);

      // 7. Cek & Pulihkan Progres Auto-Save jika sebelumnya terputus di perangkat ini
      this.storageKey = this.getStorageKey(student, activeSchedule.mapel);
      const restored = this.restoreProgressFromLocal(State.questions);
      const durasiUjian = parseInt(activeSchedule.durasi) || 45;
      let initialSeconds = durasiUjian * 60;

      if (restored && Object.keys(restored.answers).length > 0) {
        State.answers = restored.answers;
        State.currentQuestionIdx = restored.currentQuestionIdx;
        State.violations = restored.violations;
        if (restored.remainingSeconds) {
          initialSeconds = restored.remainingSeconds;
        }
        setTimeout(() => {
          alert(`AUTO-SAVE DIPULIHKAN!\n\nSistem memulihkan ${Object.keys(restored.answers).length} jawaban Anda yang tersimpan sebelumnya.`);
        }, 400);
      }

      this.renderQuestionNav();
      this.renderCurrentQuestion();
      this.startSessionHeartbeat();

      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (e) {}

      this.startTimer(initialSeconds, true);

    } catch (err) {
      alert("Gagal memuat ujian: " + err.message);
      App.showScreen('student-lobby');
      await this.renderStudentLobby();
    }
  },

  renderQuestionNav() {
    const container = document.getElementById('exam-nav-numbers');
    if (!container) return;
    container.innerHTML = '';

    State.questions.forEach((q, idx) => {
      const isAnswered = !!State.answers[idx];
      const isCurrent = idx === State.currentQuestionIdx;

      let btnClass = "w-9 h-9 font-bold text-xs rounded-lg border transition flex items-center justify-center ";
      if (isCurrent) {
        btnClass += "bg-ocean-600 text-white border-ocean-700 ring-2 ring-ocean-400";
      } else if (isAnswered) {
        btnClass += "bg-emerald-600 text-white border-emerald-700";
      } else {
        btnClass += "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200";
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = btnClass;
      btn.textContent = idx + 1;
      btn.onclick = () => this.jumpToQuestion(idx);
      container.appendChild(btn);
    });
  },

  renderCurrentQuestion() {
    const q = State.questions[State.currentQuestionIdx];
    if (!q) return;

    document.getElementById('exam-question-number').textContent = `Soal No. ${State.currentQuestionIdx + 1} dari ${State.questions.length}`;
    document.getElementById('exam-question-body').innerHTML = q.soal_html;

    const selectedAns = State.answers[State.currentQuestionIdx] || '';

    const containerOpsi = document.getElementById('exam-options-container');
    containerOpsi.innerHTML = '';

    const listOpsi = [
      { key: 'A', text: q.opsi_a },
      { key: 'B', text: q.opsi_b },
      { key: 'C', text: q.opsi_c },
      { key: 'D', text: q.opsi_d },
      { key: 'E', text: q.opsi_e }
    ];

    listOpsi.forEach(opsi => {
      if (!opsi.text) return;

      const isSelected = selectedAns === opsi.key;
      const label = document.createElement('label');
      label.className = `flex items-start p-3 border-2 rounded-xl cursor-pointer transition ${
        isSelected ? 'border-ocean-600 bg-ocean-50 text-ocean-900 font-semibold ring-2 ring-ocean-600/20' : 'border-slate-200 hover:bg-slate-50 text-slate-800'
      }`;

      label.innerHTML = `
        <input type="radio" name="option-choice" value="${opsi.key}" ${isSelected ? 'checked' : ''} 
               onchange="ExamModule.saveAnswer('${opsi.key}')" class="mt-0.5 text-ocean-600 focus:ring-ocean-500">
        <div class="ml-3 text-xs">
          <strong class="mr-1">${opsi.key}.</strong> ${opsi.text}
        </div>
      `;
      containerOpsi.appendChild(label);
    });

    const btnPrev = document.getElementById('btn-prev-soal');
    const btnNext = document.getElementById('btn-next-soal');
    
    if (btnPrev) btnPrev.disabled = State.currentQuestionIdx === 0;
    if (btnNext) {
      if (State.currentQuestionIdx === State.questions.length - 1) {
        btnNext.textContent = "Selesai & Kirim Ujian";
        btnNext.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow";
      } else {
        btnNext.textContent = "Soal Berikutnya ►";
        btnNext.className = "bg-ocean-700 hover:bg-ocean-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow";
      }
    }
  },

  saveAnswer(choice) {
    State.answers[State.currentQuestionIdx] = choice;
    this.saveProgressToLocal();
    this.renderQuestionNav();
  },

  jumpToQuestion(idx) {
    State.currentQuestionIdx = idx;
    this.saveProgressToLocal();
    this.renderQuestionNav();
    this.renderCurrentQuestion();
  },

  prevQuestion() {
    if (State.currentQuestionIdx > 0) {
      this.jumpToQuestion(State.currentQuestionIdx - 1);
    }
  },

  nextQuestion() {
    if (State.currentQuestionIdx < State.questions.length - 1) {
      this.jumpToQuestion(State.currentQuestionIdx + 1);
    } else {
      this.confirmFinishExam();
    }
  },

  startTimer(durationValue, isSeconds = false) {
    let timer = isSeconds ? durationValue : durationValue * 60;
    this.remainingSeconds = timer;
    const timerDisplay = document.getElementById('exam-timer');
    clearInterval(State.timerInterval);

    State.timerInterval = setInterval(() => {
      this.remainingSeconds = timer;
      const minutes = Math.floor(timer / 60);
      const seconds = timer % 60;
      if (timerDisplay) {
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      if (timer > 0 && timer % 5 === 0) {
        this.saveProgressToLocal();
      }
      if (--timer < 0) {
        clearInterval(State.timerInterval);
        alert("Waktu Ujian Habis! Jawaban Anda akan dikirim secara otomatis.");
        this.submitExamResults(false);
      }
    }, 1000);
  },

  handleViolation(reason) {
    if (!State.examActive) return;
    State.violations++;
    this.saveProgressToLocal();
    
    if (State.violations >= CONFIG.MAX_VIOLATIONS) {
      alert(`PELANGGARAN HUKUMAN! ${reason}\n\nAnda telah didiskualifikasi dari ujian.`);
      this.submitExamResults(true);
    } else {
      const warnText = document.getElementById('warning-text');
      if (warnText) warnText.textContent = `${reason} (Peringatan ${State.violations} dari ${CONFIG.MAX_VIOLATIONS})`;
      const modalWarn = document.getElementById('modal-warning');
      if (modalWarn) modalWarn.classList.remove('hidden');
    }
  },

  closeWarningModal() {
    this.setScreenShield(false);
    const modalWarn = document.getElementById('modal-warning');
    if (modalWarn) modalWarn.classList.add('hidden');
  },

  confirmFinishExam() {
    const totalSoal = State.questions.length;
    const dijawab = Object.keys(State.answers).length;
    const belumDijawab = [];
    for (let i = 0; i < totalSoal; i++) {
      if (!State.answers[i]) belumDijawab.push(i + 1);
    }

    let infoKosong = "";
    if (belumDijawab.length > 0) {
      infoKosong = `\n⚠️ Belum Dijawab (${belumDijawab.length} soal): No. ${belumDijawab.join(', ')}\n`;
    }

    if (confirm(`Apakah Anda yakin ingin menyelesaikan ujian?\n\nSoal Terjawab: ${dijawab} dari ${totalSoal} butir.${infoKosong}`)) {
      this.submitExamResults(false);
    }
  },

  async submitExamResults(isDisqualified = false) {
    State.examActive = false;
    this.setScreenShield(false);
    clearInterval(State.timerInterval);
    clearInterval(this.heartbeatInterval);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(e => {});
    }

    let skorBenar = 0;
    State.questions.forEach((q, idx) => {
      const userChoice = State.answers[idx];
      if (userChoice && String(userChoice).trim().toUpperCase() === String(q.kunci_jawaban).trim().toUpperCase()) {
        skorBenar++;
      }
    });

    const totalSoal = State.questions.length;
    const nilaiAkhir = totalSoal > 0 ? Math.round((skorBenar / totalSoal) * 100) : 0;
    const student = State.currentUser;
    const mapelName = this.activeScheduleObj?.mapel || State.questions[0]?.mapel || 'Mata Pelajaran';
    const sId = String(student.id_siswa || student.nisn || '').trim();

    const payloadHasil = {
      id_siswa: sId,
      nama_siswa: student.nama,
      kelas: student.kelas,
      mapel: mapelName,
      nilai: isDisqualified ? 0 : nilaiAkhir,
      jumlah_pelanggaran: State.violations,
      status_selesai: isDisqualified ? 'DIDISKUALIFIKASI' : 'SELESAI',
      waktu_selesai: new Date().toISOString()
    };

    let savedDirectlyOnline = false;
    if (navigator.onLine) {
      try {
        const client = await DB.getClient();
        if (this.activeRecordId && client) {
          const { error: updErr } = await client.from('hasil_ujian').update({
            nilai: payloadHasil.nilai,
            jumlah_pelanggaran: payloadHasil.jumlah_pelanggaran,
            status_selesai: payloadHasil.status_selesai,
            waktu_selesai: payloadHasil.waktu_selesai
          }).eq('id', this.activeRecordId);
          if (updErr) throw updErr;
        } else {
          await DB.insertHasilUjian(payloadHasil);
        }
        savedDirectlyOnline = true;
      } catch (err) {
        console.warn("[ExamModule] Gagal kirim langsung, dialihkan ke antrean offline:", err.message);
      }
    }

    this.markExamCompletedLocally(payloadHasil);
    this.clearProgressLocal();
    const sNama = this.normalizeText(student.nama || '');
    localStorage.removeItem(`cbt_lock_${sId || sNama}_${this.normalizeText(mapelName)}`);

    if (!savedDirectlyOnline) {
      this.enqueueOfflineResult(payloadHasil);
      alert(
        (isDisqualified ? "Status Ujian: DIDISKUALIFIKASI\n\n" : `Ujian Selesai!\nNilai Akhir Anda: ${nilaiAkhir}\n\n`) +
        `Mode Offline: Hasil ujian Anda telah tersimpan aman di perangkat ini.\n` +
        `Silakan hubungkan HP ke WiFi sekolah/hotspot pengawas agar nilai otomatis terkirim ke server.`
      );
    } else {
      alert(isDisqualified ? "Status Ujian: DIDISKUALIFIKASI" : `Ujian Selesai!\nNilai Akhir Anda: ${nilaiAkhir}\n\nHasil ujian berhasil dikirim ke server.`);
    }

    App.showScreen('student-lobby');
    await this.renderStudentLobby();
  }
};

window.ExamModule = ExamModule;
