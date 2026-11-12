const ExamModule = {
  activeRecordId: null,

  setupSecurityListeners() {
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && State.examActive) {
        this.handleViolation("Anda keluar dari mode Fullscreen!");
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && State.examActive) {
        this.handleViolation("Anda membuka tab lain / meninggalkan layar ujian!");
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

  async startExam() {
    State.examActive = false;
    this.activeRecordId = null;
    const student = State.currentUser;

    if (!student || !student.kelas) {
      alert("Data profil siswa tidak ditemukan.");
      AuthModule.logout();
      return;
    }

    try {
      // 1. Memeriksa Jadwal Ujian Aktif di Supabase
      const activeSchedule = await DB.fetchActiveScheduleForStudent(student.kelas);

      if (!activeSchedule) {
        alert(`TIDAK ADA JADWAL UJIAN AKTIF!\n\nHai ${student.nama}, saat ini tidak ada jadwal ujian yang aktif untuk kelas ${student.kelas}.\n\nPastikan tanggal, jam pelaksanaan, dan status jadwal sudah diatur oleh proktor/guru.`);
        AuthModule.logout();
        return;
      }

      // 2. Ambil Bank Soal Khusus untuk Mapel Terjadwal & Kelas Siswa
      const client = await DB.getClient();
      if (!client) throw new Error("Koneksi database Supabase tidak tersedia.");

      const { data, error } = await client.from('bank_soal').select('*');
      if (error) throw error;

      const allQuestions = (data || []).map(q => ({
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
        const matchMapel = String(q.mapel).trim().toUpperCase() === String(activeSchedule.mapel).trim().toUpperCase();
        const listOfKelasTarget = String(q.kelas).toUpperCase().split(',').map(k => k.trim());
        const matchKelas = listOfKelasTarget.includes(String(student.kelas).trim().toUpperCase());
        return matchMapel && matchKelas;
      });

      if (filtered.length === 0) {
        alert(`Jadwal Ujian "${activeSchedule.mapel}" terdeteksi AKTIF, namun berkas naskah soal belum diunggah oleh guru mapel.\n\nSilakan hubungi pengawas.`);
        AuthModule.logout();
        return;
      }

      // 3. Catat status "MENGERJAKAN" agar muncul di Dashboard Real-Time
      try {
        const { data: insertedData } = await client.from('hasil_ujian').insert([{
          ID_SISWA: String(student.id_siswa),
          id_siswa: String(student.id_siswa),
          nama_siswa: student.nama,
          kelas: student.kelas,
          mapel: activeSchedule.mapel,
          nilai: 0,
          jumlah_pelanggaran: 0,
          status_selesai: 'MENGERJAKAN',
          waktu_selesai: new Date().toISOString()
        }]).select();

        if (insertedData && insertedData.length > 0) {
          this.activeRecordId = insertedData[0].id || insertedData[0].ID;
        }
      } catch (e) {
        console.warn("[ExamModule] Log status mengerjakan dilewati:", e.message);
      }

      // 4. Tampilkan Layar Ujian & Acak Soal per Siswa
      App.showScreen('exam');
      State.examActive = true;
      State.violations = 0;
      State.currentQuestionIdx = 0;
      State.answers = {};

      document.getElementById('exam-student-info').textContent = `Peserta: ${student.nama} (${student.kelas})`;
      document.getElementById('exam-mapel-title').textContent = `Ujian Sumatif: ${activeSchedule.mapel}`;

      State.questions = this.shuffleArray(filtered);

      this.renderQuestionNav();
      this.renderCurrentQuestion();

      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (e) {}

      const durasiUjian = parseInt(activeSchedule.durasi) || 45;
      this.startTimer(durasiUjian);

    } catch (err) {
      alert("Gagal memuat ujian: " + err.message);
      AuthModule.logout();
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
    this.renderQuestionNav();
  },

  jumpToQuestion(idx) {
    State.currentQuestionIdx = idx;
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

  startTimer(durationMinutes) {
    let timer = durationMinutes * 60;
    const timerDisplay = document.getElementById('exam-timer');
    clearInterval(State.timerInterval);

    State.timerInterval = setInterval(() => {
      const minutes = Math.floor(timer / 60);
      const seconds = timer % 60;
      if (timerDisplay) {
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
    const modalWarn = document.getElementById('modal-warning');
    if (modalWarn) modalWarn.classList.add('hidden');
  },

  confirmFinishExam() {
    const totalSoal = State.questions.length;
    const dijawab = Object.keys(State.answers).length;

    if (confirm(`Apakah Anda yakin ingin menyelesaikan ujian?\n\nSoal Terjawab: ${dijawab} dari ${totalSoal} butir.`)) {
      this.submitExamResults(false);
    }
  },

  async submitExamResults(isDisqualified = false) {
    State.examActive = false;
    clearInterval(State.timerInterval);

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

    const payloadHasil = {
      id_siswa: student.id_siswa,
      nama_siswa: student.nama,
      kelas: student.kelas,
      mapel: State.questions[0]?.mapel || 'Mata Pelajaran',
      nilai: isDisqualified ? 0 : nilaiAkhir,
      jumlah_pelanggaran: State.violations,
      status_selesai: isDisqualified ? 'DIDISKUALIFIKASI' : 'SELESAI',
      waktu_selesai: new Date().toISOString()
    };

    try {
      const client = await DB.getClient();
      if (this.activeRecordId && client) {
        await client.from('hasil_ujian').update({
          nilai: payloadHasil.nilai,
          jumlah_pelanggaran: payloadHasil.jumlah_pelanggaran,
          status_selesai: payloadHasil.status_selesai,
          waktu_selesai: payloadHasil.waktu_selesai
        }).eq('id', this.activeRecordId);
      } else {
        await DB.insertHasilUjian(payloadHasil);
      }
    } catch (err) {
      console.error("[ExamModule] Gagal menyimpan nilai ujian:", err.message);
      alert("Peringatan: Gagal menyimpan hasil ke database: " + err.message);
    }

    alert(isDisqualified ? "Status Ujian: DIDISKUALIFIKASI" : `Ujian Selesai!\nNilai Akhir Anda: ${nilaiAkhir}`);
    AuthModule.logout();
  }
};

window.ExamModule = ExamModule;
