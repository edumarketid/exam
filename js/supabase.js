const DB = {
  client: null,

  async getClient() {
    if (this.client) return this.client;
    if (window.supabaseClient) {
      this.client = window.supabaseClient;
      return this.client;
    }

    // Polling aman untuk memastikan Supabase SDK dan CONFIG siap
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // Maksimal 3 detik menunggu SDK

      const interval = setInterval(() => {
        attempts++;

        // 1. Cek apakah supabaseClient sudah diinisialisasi global
        if (window.supabaseClient) {
          this.client = window.supabaseClient;
          clearInterval(interval);
          resolve(this.client);
          return;
        }

        // 2. Cek apakah SDK Supabase dan CONFIG sudah siap
        if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL) {
          if (CONFIG.SUPABASE_URL !== "HTTPS_SUPABASE_URL_ANDA") {
            try {
              window.supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
              this.client = window.supabaseClient;
              console.log("[Supabase] Inisialisasi Klien Berhasil.");
            } catch (e) {
              console.error("[Supabase] Error pembuatan client:", e.message);
            }
          }
          clearInterval(interval);
          resolve(this.client);
          return;
        }

        if (attempts >= maxAttempts) {
          console.warn("[Supabase] Gagal terhubung: Timeout / Config belum diisi.");
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  },

  async fetchMapel() {
    const client = await this.getClient();
    if (!client) {
      console.warn("[Supabase] client offline, mengambil data lokal jika ada.");
      return [];
    }
    try {
      const { data, error } = await client.from('mapel').select('nama_mapel').order('id', { ascending: true });
      if (error) throw error;
      return data ? data.map(m => m.nama_mapel).filter(Boolean) : [];
    } catch (err) {
      console.error("[DB Error] Gagal ambil mapel:", err.message);
      return [];
    }
  },

  async insertMapel(namaMapel) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung. Periksa config.js");
    const { data, error } = await client.from('mapel').insert([{ nama_mapel: namaMapel }]);
    if (error) throw error;
    return data;
  },

  async deleteMapel(namaMapel) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung. Periksa config.js");
    const { error } = await client.from('mapel').delete().eq('nama_mapel', namaMapel);
    if (error) throw error;
    return true;
  },

  async fetchSiswa() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data: dataSiswa, error: errSiswa } = await client.from('siswa').select('*');
      if (errSiswa) throw errSiswa;
      const { data: dataAkun } = await client.from('akun_siswa').select('*');
      
      return dataSiswa.map(s => {
        const akun = dataAkun?.find(a => a.ID_SISWA === s.ID_SISWA);
        return {
          id_siswa: s.ID_SISWA,
          nisn: s.NISN,
          nama: s.NAMA_SISWA,
          kelas: s.KELAS,
          status: s.STATUS,
          ttl: s.TTL || '-',
          user: akun ? akun.username : s.NISN,
          pass: akun ? akun.password : 'smk123'
        };
      });
    } catch (err) {
      console.error("[DB Error] Gagal ambil siswa:", err.message);
      return [];
    }
  },

  async fetchBankSoal() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('bank_soal').select('*').order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("[DB Error] Gagal ambil bank soal:", err.message);
      return [];
    }
  },

  async fetchHasilUjian() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('hasil_ujian').select('*').order('waktu_selesai', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("[DB Error] Gagal ambil hasil ujian:", err.message);
      return [];
    }
  }
};
