const AuthModule = {
  handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value.trim();

    if (u === 'admin' && p === 'admin122333') {
      State.currentUser = { role: 'admin', username: 'admin' };
      App.showScreen('admin');
      RekapModule.refreshMonitoringData();
      RekapModule.renderRekapNilai();
    } else {
      const matchStudent = (State.students || []).find(s => s.user === u && s.pass === p);
      if (matchStudent) {
        State.currentUser = { role: 'siswa', ...matchStudent };
        ExamModule.startExam();
      } else {
        alert("Username atau Password Salah!");
      }
    }

    if (State.currentUser) {
      document.getElementById('user-info').classList.remove('hidden');
      document.getElementById('user-display').textContent = State.currentUser.username;
    }
  },

  logout() {
    State.currentUser = null;
    State.examActive = false;
    clearInterval(State.timerInterval);
    document.getElementById('user-info').classList.add('hidden');
    App.showScreen('login');
  }
};

window.AuthModule = AuthModule;
