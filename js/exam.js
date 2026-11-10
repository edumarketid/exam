const ExamModule = {
  setupSecurityListeners() {
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && State.examActive) {
        this.handleViolation("Anda keluar dari mode Fullscreen!");
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && State.examActive) {
        this.handleViolation("Anda membuka tab atau aplikasi lain!");
      }
    });

    window.addEventListener('keydown', (e) => {
      State.pressedKeys[e.key.toLowerCase()] = true;
      if (State.examActive && e.ctrlKey && State.pressedKeys['c'] && State.pressedKeys['b']) {
        e.preventDefault();
        if (confirm("Kombinasi Pengawas Ditekan (Ctrl+C+B).\nApakah Anda yakin ingin keluar dari mode ujian?")) {
          this.forceExitExam();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      delete State.pressedKeys[e.key.toLowerCase()];
    });
  },

  startExam() {
    const targetMapel = State.currentUser.jadwalActive?.mapel;
    let studentQuestions = State.questions;

    if (targetMapel) {
      studentQuestions = State.questions.filter(q => q.mapel === targetMapel && q.kelas === State.currentUser.kelas);
    }

    App.showScreen('exam');
    State.examActive = true;
    State.violations = 0;
    document.getElementById('exam-mapel-title').textContent = targetMapel || "Ujian Penilaian Sumatif";
    document.getElementById('exam-student-info').textContent = `Peserta: ${State.currentUser.nama} (${State.currentUser.kelas})`;
    
    this.startTimer(State.currentUser.jadwalActive?.durasi || 45);
    this.enterFullscreen();
    this.renderQuestion();
    this.renderGrid();
  },

  startTimer(durationMinutes) {
    let timer = durationMinutes * 60;
    const timerDisplay = document.getElementById('exam-timer');
    clearInterval(State.timerInterval);

    State.timerInterval = setInterval(() => {
      const minutes = Math.floor(timer / 60);
      const seconds = timer % 60;
      timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (--timer < 0) {
        clearInterval(State.timerInterval);
        alert("WAKTU UJIAN HABIS! Jawaban Anda akan otomatis dikirim.");
        this.finishExam(false);
      }
    }, 1000);
  },

  enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.warn(err));
  },

  forceExitExam() {
    State.examActive = false;
    clearInterval(State.timerInterval);
    if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn(err));
    alert("Aplikasi dikeluarkan oleh pengawas.");
    App.showScreen('login');
  },

  handleViolation(reason) {
    if (!State.examActive) return;
    State.violations++;
    const max = typeof CONFIG !== 'undefined' ? CONFIG.MAX_VIOLATIONS : 2;

    if (State.violations >= max) {
      alert(`PELANGGARAN HUKUMAN! ${reason}\n\nUjian Anda dihentikan secara otomatis.`);
      this.finishExam(true);
    } else {
      document.getElementById('warning-text').textContent = `${reason} (Peringatan ${State.violations} dari ${max})`;
      document.getElementById('modal-warning').classList.remove('hidden');
    }
  },

  closeWarningModal() {
    document.getElementById('modal-warning').classList.add('hidden');
    this.enterFullscreen();
  },

  renderQuestion() {
    const q = State.questions[State.currentQuestionIdx];
    if (!q) {
      document.getElementById('question-render-area').innerHTML = `<p class="text-gray-500 italic">Belum ada soal tersedia.</p>`;
      return;
    }

    document.getElementById('current-question-num').textContent = State.currentQuestionIdx + 1;
    document.getElementById('question-render-area').innerHTML = q.soal_html;

    const options = ['a', 'b', 'c', 'd', 'e'];
    let html = '';
    options.forEach(opt => {
      const isSelected = State.answers[q.id || State.currentQuestionIdx] === opt.toUpperCase();
      html += `
        <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition ${isSelected ? 'border-blue-600 bg-blue-50' : ''}">
          <input type="radio" name="opt" value="${opt.toUpperCase()}" ${isSelected ? 'checked' : ''} onchange="ExamModule.selectAnswer('${q.id || State.currentQuestionIdx}', '${opt.toUpperCase()}')" class="mt-1">
          <span class="font-bold text-xs uppercase">${opt}.</span>
          <div class="text-xs">${q['opsi_' + opt]}</div>
        </label>
      `;
    });
    document.getElementById('options-render-area').innerHTML = html;
  },

  renderGrid() {
    const grid = document.getElementById('question-grid');
    grid.innerHTML = '';
    State.questions.forEach((q, idx) => {
      const qId = q.id || idx;
      const isAnswered = !!State.answers[qId];
      const isCurrent = idx === State.currentQuestionIdx;
      const btn = document.createElement('button');
      btn.textContent = idx + 1;
      btn.className = `p-2 rounded border text-center transition ${isCurrent ? 'ring-2 ring-blue-600 font-bold' : ''} ${isAnswered ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`;
      btn.onclick = () => {
        State.currentQuestionIdx = idx;
        this.renderQuestion();
        this.renderGrid();
      };
      grid.appendChild(btn);
    });
  },

  selectAnswer(qId, val) {
    State.answers[qId] = val;
    this.renderGrid();
  },

  prevQuestion() {
    if (State.currentQuestionIdx > 0) {
      State.currentQuestionIdx--;
      this.renderQuestion();
      this.renderGrid();
    }
  },

  nextQuestion() {
    if (State.currentQuestionIdx < State.questions.length - 1) {
      State.currentQuestionIdx++;
      this.renderQuestion();
      this.renderGrid();
    }
  },

  finishExamConfirm() {
    if (confirm("Apakah Anda yakin ingin menyelesaikan ujian dan mengirimkan jawaban?")) {
      this.finishExam(false);
    }
  },

  async finishExam(isDisqualified = false) {
    State.examActive = false;
    clearInterval(State.timerInterval);
    if (document.exitFullscreen) document.exitFullscreen().catch(err => console.warn(err));

    let totalBenar = 0;
    State.questions.forEach((q) => {
      const qId = q.id || State.questions.indexOf(q);
      if (State.answers[qId] === q.kunci_jawaban) totalBenar++;
    });
    const nilaiAkhir = (State.questions.length > 0) ? ((totalBenar / State.questions.length) * 100).toFixed(2) : 0;

    const client = await DB.getClient();
    if (client && State.currentUser) {
      try {
        await client.from('hasil_ujian').insert([{
          ID_SISWA: State.currentUser.id_siswa,
          mapel: document.getElementById('exam-mapel-title')?.textContent || 'Ujian Sumatif',
          jawaban_json: State.answers,
          nilai: nilaiAkhir,
          status_selesai: isDisqualified ? 'DIDISKUALIFIKASI' : 'SELESAI',
          jumlah_pelanggaran: State.violations
        }]);
        await RekapModule.refreshMonitoringData();
      } catch (err) {
        console.error("Gagal menyimpan hasil ujian:", err.message);
      }
    }

    alert(isDisqualified ? "Status: DIDISKUALIFIKASI." : `Ujian Selesai!\nNilai Akhir Anda: ${nilaiAkhir}`);
    App.showScreen('login');
  }
};
