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
              console.log("[DB Helper] Klien Supabase Siap.");
            } catch (e) {
              console.error("[DB Helper] Inisialisasi Klien Gagal:", e.message);
            }
          }
          clearInterval(interval);
          resolve(this.client);
          return;
        }

        if (attempts >= 20) {
          console.warn("[DB Helper] Timeout menunggu SDK Supabase / CONFIG.");
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  },

  async fetchMapel() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('mapel').select('*').order('id', { ascending: true });
      if (error) {
        console.warn("[DB Warn] Tabel mapel error/kosong:", error.message);
        return [];
      }
      return data ? data.map(m => m.nama_mapel || m.mapel || m.nama || Object.values(m)[1]).filter(Boolean) : [];
    } catch (err) {
      console.error("[DB Error] fetchMapel:", err.message);
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
      if (errSiswa) {
        console.warn("[DB Warn] Tabel siswa error/kosong:", errSiswa.message);
        return [];
      }
      
      let dataAkun = [];
      try {
        const { data } = await client.from('akun_siswa').select('*');
        dataAkun = data || [];
      } catch (e) {
        console.warn("[DB Warn] Tabel akun_siswa belum ada/akses dibatasi.");
      }

      return (dataSiswa || []).map(s => {
        const akun = dataAkun.find(a => a.ID_SISWA === (s.ID_SISWA || s.id_siswa));
        return {
          id_siswa: s.ID_SISWA || s.id_siswa || s.id,
          nisn: s.NISN || s.nisn || '-',
          nama: s.NAMA_SISWA || s.nama_siswa || s.nama || '-',
          kelas: s.KELAS || s.kelas || '-',
          status: s.STATUS || s.status || 'Aktif',
          ttl: s.TTL || s.ttl || '-',
          user: akun ? akun.username : (s.NISN || s.nisn || 'user'),
          pass: akun ? akun.password : 'smk123'
        };
      });
    } catch (err) {
      console.error("[DB Error] fetchSiswa:", err.message);
      return [];
    }
  },

  async fetchBankSoal() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('bank_soal').select('*').order('id', { ascending: true });
      if (error) {
        console.warn("[DB Warn] Tabel bank_soal error/kosong:", error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error("[DB Error] fetchBankSoal:", err.message);
      return [];
    }
  },

  async fetchSchedules() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('jadwal_ujian').select('*');
      if (error) {
        console.warn("[DB Warn] Tabel jadwal_ujian error/kosong:", error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error("[DB Error] fetchSchedules:", err.message);
      return [];
    }
  },

  async fetchHasilUjian() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('hasil_ujian').select('*').order('waktu_selesai', { ascending: false });
      if (error) {
        console.warn("[DB Warn] Tabel hasil_ujian error/kosong:", error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error("[DB Error] fetchHasilUjian:", err.message);
      return [];
    }
  }
};
