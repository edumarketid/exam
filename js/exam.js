const ExamModule = {
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
    const student = State.currentUser;

    if (!student || !student.kelas) {
      alert("Data siswa tidak valid.");
      AuthModule.logout();
      return;
    }

    try {
      // 1. Periksa Jadwal Ujian Aktif di Supabase
      const activeSchedule = await DB.fetchActiveScheduleForStudent(student.kelas);

      if (!activeSchedule) {
        alert(`TIDAK ADA JADWAL UJIAN AKTIF!\n\nHai ${student.nama}, saat ini tidak ada jadwal ujian yang aktif untuk kelas ${student.kelas}.\n\nPastikan tanggal, jam pelaksanaan, dan status jadwal sudah diatur oleh panitia/guru.`);
        AuthModule.logout();
        return;
      }

      console.log("[ExamModule] Jadwal Ujian Aktif Ditemukan:", activeSchedule);

      // 2. Ambil Bank Soal Khusus untuk Mapel & Kelas Terjadwal
      const client = await DB.getClient();
      if (!client) throw new Error("Koneksi database tidak tersedia.");

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

      // Check ketersediaan kelas siswa di dalam daftar kelas master soal
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

      // 3. Set Up Layar Ujian & Acak Soal per Siswa
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
      } catch (e) {
        console.warn("Fullscreen tidak dapat diaktifkan otomatis.");
      }

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

      let btnClass = "w-9 h-9 font-bold text-xs rounded border transition flex items-center justify-center ";
      if (isCurrent) {
        btnClass += "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-400";
      } else if (isAnswered) {
        btnClass += "bg-emerald-600 text-white border-emerald-700";
      } else {
        btnClass += "bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200";
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
      label.className = `flex items-start p-3 border-2 rounded-lg cursor-pointer transition ${
        isSelected ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold' : 'border-gray-200 hover:bg-gray-50 text-gray-800'
      }`;

      label.innerHTML = `
        <input type="radio" name="option-choice" value="${opsi.key}" ${isSelected ? 'checked' : ''} 
               onchange="ExamModule.saveAnswer('${opsi.key}')" class="mt-0.5 text-blue-600 focus:ring-blue-500">
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
        btnNext.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 rounded shadow";
      } else {
        btnNext.textContent = "Soal Berikutnya ►";
        btnNext.className = "bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2 rounded shadow";
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
      console.log("[ExamModule] Mengirim nilai ujian ke Supabase...", payloadHasil);
      await DB.insertHasilUjian(payloadHasil);
      console.log("[ExamModule] Nilai ujian berhasil tersimpan di Supabase.");
    } catch (err) {
      console.error("[ExamModule] Gagal menyimpan nilai ujian:", err.message);
      alert("Peringatan: Gagal menyimpan hasil ke database: " + err.message);
    }

    alert(isDisqualified ? "Status Ujian: DIDISKUALIFIKASI" : `Ujian Selesai!\nNilai Akhir Anda: ${nilaiAkhir}`);
    AuthModule.logout();
  }
};

window.ExamModule = ExamModule;
