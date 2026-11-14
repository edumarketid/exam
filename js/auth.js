const AuthModule = {
  SAVED_STUDENTS_KEY: 'cbt_saved_students_smkn1wkt_v1',

  saveStudentProfileLocally(student) {
    if (!student) return;
    try {
      const raw = localStorage.getItem(this.SAVED_STUDENTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(item =>
        String(item.nisn || '').trim() !== String(student.nisn || '').trim() &&
        String(item.user || '').trim() !== String(student.user || '').trim()
      );
      filtered.push({
        id_siswa: student.id_siswa,
        nisn: student.nisn,
        nama: student.nama,
        kelas: student.kelas,
        status: student.status,
        ttl: student.ttl,
        user: student.user,
        pass: student.pass,
        savedAt: Date.now()
      });
      localStorage.setItem(this.SAVED_STUDENTS_KEY, JSON.stringify(filtered));
    } catch (e) {}
  },

  findLocalStudent(usernameInput, passwordInput) {
    try {
      const raw = localStorage.getItem(this.SAVED_STUDENTS_KEY);
      if (!raw) return null;
      const list = JSON.parse(raw);
      return list.find(s =>
        (String(s.nisn || '').trim() === usernameInput || String(s.user || '').trim() === usernameInput) &&
        String(s.pass || '').trim() === passwordInput
      ) || null;
    } catch (e) {
      return null;
    }
  },

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
      if (typeof DB !== 'undefined' && DB.fetchAdmin && navigator.onLine) {
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
      if (typeof DB !== 'undefined' && DB.fetchGuru && navigator.onLine) {
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

    // 4. CEK AKUN SISWA (ONLINE DULU, FALLBACK KE CACHE LOKAL JIKA OFFLINE)
    let foundSiswa = null;
    try {
      if (typeof DB !== 'undefined' && DB.fetchSiswa && navigator.onLine) {
        const listSiswa = await DB.fetchSiswa();
        foundSiswa = listSiswa.find(s => 
          (String(s.nisn).trim() === usernameInput || String(s.user).trim() === usernameInput) && 
          String(s.pass).trim() === passwordInput
        ) || null;
      }
    } catch (err) {}

    if (!foundSiswa) {
      foundSiswa = this.findLocalStudent(usernameInput, passwordInput);
    }

    if (foundSiswa) {
      if (String(foundSiswa.status).toLowerCase() !== 'aktif') {
        alert("Status akun Anda Non-Aktif. Hubungi panitia ujian.");
        return;
      }
      this.saveStudentProfileLocally(foundSiswa);
      State.currentUser = { ...foundSiswa, role: 'siswa' };

      App.showScreen('student-lobby');
      if (typeof ExamModule !== 'undefined' && ExamModule.openStudentLobby) {
        await ExamModule.openStudentLobby();
      }
      return;
    }

    if (!navigator.onLine) {
      alert("Login Offline Gagal!\n\nPerangkat sedang offline dan akun Anda belum pernah login di perangkat ini. Silakan hubungkan ke internet terlebih dahulu.");
    } else {
      alert("Login Gagal! Periksa kembali Username/NISN/No. HP dan Password Anda.");
    }
  },

  logout() {
    State.currentUser = null;
    State.examActive = false;
    App.showScreen('login');
  }
};

window.AuthModule = AuthModule;
