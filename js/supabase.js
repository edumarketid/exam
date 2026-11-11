const DB = {
  client: null,

  async getClient() {
    if (this.client) return this.client;
    if (window.supabaseClient) {
      this.client = window.supabaseClient;
      return this.client;
    }

    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;

        if (window.supabaseClient) {
          this.client = window.supabaseClient;
          clearInterval(interval);
          resolve(this.client);
          return;
        }

        if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
          const url = CONFIG.SUPABASE_URL;
          const key = CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_ANON_KEY;

          if (url && key) {
            try {
              window.supabaseClient = supabase.createClient(url, key);
              this.client = window.supabaseClient;
              console.log("[DB Helper] Berhasil membuat koneksi Supabase.");
            } catch (e) {
              console.error("[DB Helper] Error koneksi:", e.message);
            }
          }
          clearInterval(interval);
          resolve(this.client);
          return;
        }

        if (attempts >= 25) {
          console.warn("[DB Helper] Timeout koneksi ke Supabase.");
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  },

  async fetchMapel() {
    const client = await this.getClient();
    if (!client) {
      console.warn("[DB Helper] Client Supabase offline / tidak siap.");
      return [];
    }
    try {
      const { data, error } = await client.from('mapel').select('nama_mapel').order('id', { ascending: true });
      if (error) throw error;
      return data ? data.map(m => m.nama_mapel).filter(Boolean) : [];
    } catch (err) {
      console.error("[DB Error] Gagal narik tabel mapel:", err.message);
      return [];
    }
  },

  async insertMapel(namaMapel) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    const { data, error } = await client.from('mapel').insert([{ nama_mapel: namaMapel }]);
    if (error) throw error;
    return data;
  },

  async deleteMapel(namaMapel) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
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
  async fetchSchedules() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('jadwal_ujian').select('*');
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("[DB Error] Gagal ambil jadwal:", err.message);
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
