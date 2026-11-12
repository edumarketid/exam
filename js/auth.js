const AuthModule = {
  async login(e) {
    if (e && e.preventDefault) e.preventDefault();

    const usernameInput = String(document.getElementById('login-username')?.value || '').trim();
    const passwordInput = String(document.getElementById('login-password')?.value || '').trim();

    if (!usernameInput || !passwordInput) {
      alert("Silakan isi Username / NISN / No. HP dan Password!");
      return;
    }

    // 1. CEK AKUN ADMIN DI SUPABASE
    try {
      if (typeof DB !== 'undefined' && DB.fetchAdmin) {
        const listAdmin = await DB.fetchAdmin();
        const foundAdmin = listAdmin.find(a => a.username === usernameInput && a.password === passwordInput);
        if (foundAdmin) {
          if (String(foundAdmin.status).toLowerCase() !== 'aktif') {
            alert("Akun Admin ini berstatus Non-Aktif.");
            return;
          }
          State.currentUser = { ...foundAdmin, role: 'admin', nama: foundAdmin.nama_admin };
          alert(`Selamat Datang Administrator: ${foundAdmin.nama_admin}`);
          App.showScreen('admin');
          App.switchAdminTab('monitoring');
          return;
        }
      }
    } catch (err) {}

    // 2. FALLBACK CONFIG.JS ADMIN (admin / admin123)
    const cfg = window.CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : null);
    if (cfg && usernameInput === String(cfg.ADMIN_USER) && passwordInput === String(cfg.ADMIN_PASS)) {
      State.currentUser = { role: 'admin', nama: 'Proktor Utama' };
      alert("Selamat Datang, Administrator Proktor!");
      App.showScreen('admin');
      App.switchAdminTab('monitoring');
      return;
    }

    // 3. CEK AKUN GURU DI SUPABASE
    try {
      if (typeof DB !== 'undefined' && DB.fetchGuru) {
        const listGuru = await DB.fetchGuru();
        const foundGuru = listGuru.find(g => 
          (g.no_hp === usernameInput || g.nip === usernameInput) && g.password === passwordInput
        );
        if (foundGuru) {
          if (String(foundGuru.status).toLowerCase() !== 'aktif') {
            alert("Akun Guru Anda berstatus Non-Aktif.");
            return;
          }
          State.currentUser = { ...foundGuru, role: 'guru' };
          alert(`Selamat Datang Pak/Ibu Guru: ${foundGuru.nama_guru}`);
          App.showScreen('admin');
          App.switchAdminTab('bank-soal');
          return;
        }
      }
    } catch (err) {}

    // 4. CEK AKUN SISWA DI SUPABASE
    try {
      if (typeof DB !== 'undefined' && DB.fetchSiswa) {
        const listSiswa = await DB.fetchSiswa();
        const foundSiswa = listSiswa.find(s => 
          (String(s.nisn).trim() === usernameInput || String(s.user).trim() === usernameInput) && 
          String(s.pass).trim() === passwordInput
        );
        if (foundSiswa) {
          if (String(foundSiswa.status).toLowerCase() !== 'aktif') {
            alert("Status akun Anda Non-Aktif. Hubungi panitia ujian.");
            return;
          }
          State.currentUser = { ...foundSiswa, role: 'siswa' };
          alert(`Selamat Datang, ${foundSiswa.nama} (${foundSiswa.kelas})`);
          await ExamModule.startExam();
          return;
        }
      }
    } catch (err) {}

    alert("Login Gagal! Periksa kembali Username/NISN/No. HP dan Password Anda.");
  },

  logout() {
    State.currentUser = null;
    State.examActive = false;
    App.showScreen('login');
  }
};

window.AuthModule = AuthModule;
