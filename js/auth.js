const AuthModule = {
  async login(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();

    // 1. Cek Akun Admin / Proktor
    if (usernameInput === CONFIG.ADMIN_USER && passwordInput === CONFIG.ADMIN_PASS) {
      State.currentUser = { role: 'admin', nama: 'Administrator Proktor' };
      alert("Selamat Datang, Administrator!");
      App.showScreen('admin');
      App.switchAdminTab('monitoring');
      return;
    }

    // 2. Cek Akun Guru
    const listGuru = await DB.fetchGuru();
    const foundGuru = listGuru.find(g => 
      (g.no_hp === usernameInput || g.nip === usernameInput) && g.password === passwordInput
    );

    if (foundGuru) {
      if (foundGuru.status !== 'Aktif') {
        alert("Akun Guru Anda saat ini berstatus Non-Aktif. Silakan hubungi Admin.");
        return;
      }
      State.currentUser = { ...foundGuru, role: 'guru' };
      alert(`Selamat Datang Pak/Ibu Guru: ${foundGuru.nama_guru}`);
      
      // Masuk ke Panel Admin khusus Guru (Hanya Mapel & Kelas Diampu)
      App.showScreen('admin');
      App.switchAdminTab('bank-soal');
      return;
    }

    // 3. Cek Akun Siswa
    const listSiswa = await DB.fetchSiswa();
    const foundSiswa = listSiswa.find(s => 
      (String(s.nisn).trim() === usernameInput || String(s.user).trim() === usernameInput) && 
      String(s.pass).trim() === passwordInput
    );

    if (foundSiswa) {
      State.currentUser = { ...foundSiswa, role: 'siswa' };
      alert(`Selamat Datang, ${foundSiswa.nama} (${foundSiswa.kelas})`);
      ExamModule.startExam();
      return;
    }

    alert("Username/NISN atau Password tidak ditemukan!");
  },

  logout() {
    State.currentUser = null;
    State.examActive = false;
    App.showScreen('login');
  }
};

window.AuthModule = AuthModule;
