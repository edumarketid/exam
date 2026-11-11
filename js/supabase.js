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
          if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY) {
            try {
              window.supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
              this.client = window.supabaseClient;
            } catch (e) {
              console.error("[DB] Error Client:", e.message);
            }
          }
          clearInterval(interval);
          resolve(this.client);
          return;
        }
        if (attempts >= 20) {
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
      if (error) return [];
      return data ? data.map(m => m.nama_mapel || m.mapel || m.nama || Object.values(m)[1]).filter(Boolean) : [];
    } catch (err) {
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
      const { data: dataSiswa } = await client.from('siswa').select('*');
      let dataAkun = [];
      try {
        const { data: dataA } = await client.from('akun_siswa').select('*');
        dataAkun = dataA || [];
      } catch (e) {}

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
      return [];
    }
  },

  async fetchBankSoal() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('bank_soal').select('*').order('id', { ascending: true });
      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  },

  async fetchSchedules() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('jadwal_ujian').select('*').order('id', { ascending: false });
      if (error) {
        console.warn("[DB Helper] Gagal fetch jadwal_ujian:", error.message);
        return [];
      }
      return (data || []).map(j => ({
        id: j.id || j.ID,
        mapel: j.mapel || j.MAPEL || j.nama_mapel || j.NAMA_MAPEL || '-',
        kelas: j.kelas || j.KELAS || '-',
        tanggal: j.tanggal || j.TANGGAL || '-',
        durasi: j.durasi || j.DURASI || 45,
        jamMulai: j.jam_mulai || j.JAM_MULAI || j.jamMulai || '07:30',
        jamSelesai: j.jam_selesai || j.JAM_SELESAI || j.jamSelesai || '09:00'
      }));
    } catch (err) {
      console.error("[DB Helper] Error fetchSchedules:", err.message);
      return [];
    }
  },

  async fetchHasilUjian() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('hasil_ujian').select('*').order('waktu_selesai', { ascending: false });
      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }
};

window.DB = DB;
