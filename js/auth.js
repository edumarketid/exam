const AuthModule = {
  async login(e) {
    e.preventDefault();
    const usernameInput = String(document.getElementById('login-username')?.value || '').trim();
    const passwordInput = String(document.getElementById('login-password')?.value || '').trim();

    if (!usernameInput || !passwordInput) {
      alert("Silakan isi Username/NISN dan Password!");
      return;
    }

    console.log(`[AuthModule] Menguji login untuk input: "${usernameInput}"`);

    // 1. CEK AKUN ADMIN / PROKTOR
    if (typeof CONFIG !== 'undefined' && usernameInput === CONFIG.ADMIN_USER && passwordInput === CONFIG.ADMIN_PASS) {
      State.currentUser = { role: 'admin', nama: 'Administrator Proktor' };
      alert("Selamat Datang, Administrator!");
      App.showScreen('admin');
      App.switchAdminTab('monitoring');
      return;
    }

    // 2. CEK AKUN GURU (NIP / No HP)
    try {
      const listGuru = await DB.fetchGuru();
      const foundGuru = listGuru.find(g => 
        (g.no_hp === usernameInput || g.nip === usernameInput) && g.password === passwordInput
      );

      if (foundGuru) {
        if (String(foundGuru.status).toLowerCase() !== 'aktif') {
          alert("Akun Guru Anda saat ini berstatus Non-Aktif. Silakan hubungi Administrator.");
          return;
        }
        State.currentUser = { ...foundGuru, role: 'guru' };
        alert(`Selamat Datang Pak/Ibu Guru: ${foundGuru.nama_guru}`);
        App.showScreen('admin');
        App.switchAdminTab('bank-soal');
        return;
      }
    } catch (err) {
      console.error("[AuthModule] Error saat verifikasi akun guru:", err.message);
    }

    // 3. CEK AKUN SISWA (NISN / Username)
    try {
      const listSiswa = await DB.fetchSiswa();
      const foundSiswa = listSiswa.find(s => 
        (String(s.nisn).trim() === usernameInput || String(s.user).trim() === usernameInput) && 
        String(s.pass).trim() === passwordInput
      );

      if (foundSiswa) {
        if (String(foundSiswa.status).toLowerCase() !== 'aktif' && foundSiswa.status !== 'Aktif') {
          alert("Status akun Anda Non-Aktif. Silakan hubungi panitia ujian.");
          return;
        }
        State.currentUser = { ...foundSiswa, role: 'siswa' };
        alert(`Selamat Datang, ${foundSiswa.nama} (${foundSiswa.kelas})`);
        await ExamModule.startExam();
        return;
      }
    } catch (err) {
      console.error("[AuthModule] Error saat verifikasi akun siswa:", err.message);
    }

    // GAGAL AUTHENTIKASI
    alert("Login Gagal! Username/NISN atau Password tidak sesuai.");
  },

  logout() {
    console.log("[AuthModule] Keluar dari sesi aplikasi.");
    State.currentUser = null;
    State.examActive = false;
    App.showScreen('login');
  }
};

window.AuthModule = AuthModule;
