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
      return data ? data.map(m => m.nama_mapel || m.mapel || m.NAMA_MAPEL || m.nama || Object.values(m)[1]).filter(Boolean) : [];
    } catch (err) {
      return [];
    }
  },

  async insertMapel(namaMapel) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");

    let { data, error } = await client.from('mapel').insert([{ nama_mapel: namaMapel }]);
    if (error) {
      const res2 = await client.from('mapel').insert([{ mapel: namaMapel }]);
      if (res2.error) {
        const res3 = await client.from('mapel').insert([{ NAMA_MAPEL: namaMapel }]);
        if (res3.error) throw error;
        return res3.data;
      }
      return res2.data;
    }
    return data;
  },

  async deleteMapel(namaMapel) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");

    const { error: err1 } = await client.from('mapel').delete().eq('nama_mapel', namaMapel);
    if (err1) {
      const { error: err2 } = await client.from('mapel').delete().eq('mapel', namaMapel);
      if (err2) {
        await client.from('mapel').delete().eq('NAMA_MAPEL', namaMapel);
      }
    }
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
      if (error) return [];
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
      return [];
    }
  },

  // Mendapatkan Jadwal Aktif yang Sesuai dengan Kelas & Waktu Sekarang
  async fetchActiveScheduleForStudent(kelasSiswa) {
    const schedules = await this.fetchSchedules();
    if (!schedules || schedules.length === 0) return null;

    const now = new Date();
    // Format YYYY-MM-DD lokal
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${year}-${month}-${day}`;

    // Format HH:MM lokal
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    console.log(`[DB Check Jadwal] Kelas: ${kelasSiswa} | Tgl Sekarang: ${currentDateStr} | Jam Sekarang: ${currentTimeStr}`);

    const activeSchedule = schedules.find(j => {
      const matchKelas = String(j.kelas).trim().toUpperCase() === String(kelasSiswa).trim().toUpperCase();
      const matchTanggal = String(j.tanggal).trim() === currentDateStr;
      
      // Sanitasi Waktu Jam Mulai & Jam Selesai
      const jamMulaiClean = String(j.jamMulai).substring(0, 5);
      const jamSelesaiClean = String(j.jamSelesai).substring(0, 5);
      
      const inTimeRange = currentTimeStr >= jamMulaiClean && currentTimeStr <= jamSelesaiClean;

      return matchKelas && matchTanggal && inTimeRange;
    });

    return activeSchedule || null;
  },

  async fetchHasilUjian() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('hasil_ujian').select('*');
      if (error) return [];
      
      return (data || []).map(h => ({
        id: h.id || h.ID,
        ID_SISWA: h.ID_SISWA || h.id_siswa || h.nisn || '-',
        nama_siswa: h.nama_siswa || h.NAMA_SISWA || h.nama || '-',
        kelas: h.kelas || h.KELAS || '-',
        mapel: h.mapel || h.MAPEL || '-',
        nilai: h.nilai !== undefined ? h.nilai : (h.NILAI !== undefined ? h.NILAI : 0),
        jumlah_pelanggaran: h.jumlah_pelanggaran !== undefined ? h.jumlah_pelanggaran : 0,
        status_selesai: h.status_selesai || h.STATUS_SELESAI || 'SELESAI',
        waktu_selesai: h.waktu_selesai || h.WAKTU_SELESAI || new Date().toISOString()
      }));
    } catch (err) {
      return [];
    }
  },

  async insertHasilUjian(payload) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");

    const dataToInsert = {
      ID_SISWA: String(payload.id_siswa),
      id_siswa: String(payload.id_siswa),
      nama_siswa: payload.nama_siswa,
      kelas: payload.kelas,
      mapel: payload.mapel,
      nilai: payload.nilai,
      jumlah_pelanggaran: payload.jumlah_pelanggaran,
      status_selesai: payload.status_selesai,
      waktu_selesai: payload.waktu_selesai
    };

    const { data, error } = await client.from('hasil_ujian').insert([dataToInsert]);
    if (error) {
      const fallbackPayload = {
        ID_SISWA: String(payload.id_siswa),
        mapel: payload.mapel,
        nilai: payload.nilai,
        jumlah_pelanggaran: payload.jumlah_pelanggaran,
        status_selesai: payload.status_selesai
      };
      const { data: dataFb, error: errFb } = await client.from('hasil_ujian').insert([fallbackPayload]);
      if (errFb) throw errFb;
      return dataFb;
    }
    return data;
  }
};

window.DB = DB;
