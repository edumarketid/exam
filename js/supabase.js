const DB = {
  async getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.supabaseClient || typeof supabase !== 'undefined') {
          if (!window.supabaseClient && typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
            window.supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
          }
          clearInterval(interval);
          resolve(window.supabaseClient);
        }
        if (attempts > 20) {
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
};
