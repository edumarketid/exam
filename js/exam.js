const ExamModule = {
  setupSecurityListeners() {
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && State.examActive) {
        this.handleViolation("Anda keluar dari mode Fullscreen!");
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && State.examActive) {
        this.handleViolation("Anda membuka tab lain!");
      }
    });
  },

  startExam() {
    App.showScreen('exam');
    State.examActive = true;
    State.violations = 0;
    document.getElementById('exam-mapel-title').textContent = "Ujian Penilaian Sumatif";
    document.getElementById('exam-student-info').textContent = `Peserta: ${State.currentUser.nama} (${State.currentUser.kelas})`;
    this.startTimer(45);
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
        alert("Waktu Ujian Habis!");
        this.finishExam(false);
      }
    }, 1000);
  },

  handleViolation(reason) {
    if (!State.examActive) return;
    State.violations++;
    if (State.violations >= CONFIG.MAX_VIOLATIONS) {
      alert(`PELANGGARAN HUKUMAN! ${reason}`);
      this.finishExam(true);
    } else {
      document.getElementById('warning-text').textContent = `${reason} (Peringatan ${State.violations} dari ${CONFIG.MAX_VIOLATIONS})`;
      document.getElementById('modal-warning').classList.remove('hidden');
    }
  },

  closeWarningModal() {
    document.getElementById('modal-warning').classList.add('hidden');
  },

  finishExam(isDisqualified = false) {
    State.examActive = false;
    clearInterval(State.timerInterval);
    alert(isDisqualified ? "Status: DIDISKUALIFIKASI" : "Ujian Selesai!");
    App.showScreen('login');
  }
};

window.ExamModule = ExamModule;
