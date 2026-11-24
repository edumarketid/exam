const DB = {
  client: null,
  _cachedKopUrl: null,
  _cachedKepsek: null,
  _cachedGuruList: null,

  initImmediate() {
    if (this.client) return this.client;
    if (window.supabaseClient) {
      this.client = window.supabaseClient;
      return this.client;
    }

    const cfg = window.CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : null);
    const sbLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);

    if (sbLib && sbLib.createClient && cfg && cfg.SUPABASE_URL && cfg.SUPABASE_KEY) {
      try {
        window.supabaseClient = sbLib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
        this.client = window.supabaseClient;
        console.log("[DB] Berhasil terhubung ke Supabase:", cfg.SUPABASE_URL);
        return this.client;
      } catch (e) {
        console.error("[DB] Gagal membuat client Supabase:", e.message);
      }
    }
    return null;
  },

  async getClient() {
    const immediate = this.initImmediate();
    if (immediate) return immediate;

    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const client = this.initImmediate();
        if (client) {
          clearInterval(interval);
          resolve(client);
          return;
        }
        if (attempts >= 30) {
          clearInterval(interval);
          console.error("[DB] Timeout: Library Supabase atau config.js tidak ditemukan/key kosong.");
          resolve(null);
        }
      }, 100);
    });
  },

  getKopSekolahUrl() {
    if (this._cachedKopUrl) return this._cachedKopUrl;

    try {
      const saved = sessionStorage.getItem('exam_cached_kop_url');
      if (saved) {
        this._cachedKopUrl = saved;
        return saved;
      }
    } catch (e) {}

    const cfg = window.CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : null);
    const baseUrl = (cfg && cfg.SUPABASE_URL)
      ? String(cfg.SUPABASE_URL).replace(/\/+$/, '')
      : 'https://nbwpnhshhpfqtmbwewgk.supabase.co';

    const resolvedUrl = (cfg && cfg.KOP_SEKOLAH_URL)
      ? String(cfg.KOP_SEKOLAH_URL).trim()
      : `${baseUrl}/storage/v1/object/public/media-sekolah/kop_sekolah.png`;

    this._cachedKopUrl = resolvedUrl;
    try {
      sessionStorage.setItem('exam_cached_kop_url', resolvedUrl);
    } catch (e) {}

    return resolvedUrl;
  },

  extractKepsekFromList(guruList) {
    const list = Array.isArray(guruList) ? guruList : [];
    if (list.length === 0) return null;
    const firstRow = list[0];
    const nama = String(firstRow.nama_guru || firstRow.nama || '').trim();
    if (!nama) return null;
    const rawNip = String(firstRow.nip || '').trim();
    const nip = (rawNip && rawNip !== '-') ? rawNip : '............................................';
    return { nama, nip };
  },

  async getKepalaSekolah() {
    if (this._cachedKepsek && this._cachedKepsek.nama) {
      return this._cachedKepsek;
    }

    const existingList = (typeof GuruModule !== 'undefined' && Array.isArray(GuruModule.guruList) && GuruModule.guruList.length > 0)
      ? GuruModule.guruList
      : (Array.isArray(this._cachedGuruList) && this._cachedGuruList.length > 0 ? this._cachedGuruList : null);

    if (existingList) {
      const parsed = this.extractKepsekFromList(existingList);
      if (parsed) {
        this._cachedKepsek = parsed;
        return parsed;
      }
    }

    const client = await this.getClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('guru')
          .select('nama_guru, nip')
          .order('id_guru', { ascending: true })
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const parsed = this.extractKepsekFromList(data);
          if (parsed) {
            this._cachedKepsek = parsed;
            return parsed;
          }
        }
      } catch (e) {}
    }

    return {
      nama: '..................................................',
      nip: '............................................'
    };
  },

  async fetchAllRows(tableName, orderCol = 'id', ascending = true) {
    const client = await this.getClient();
    if (!client) return [];

    let allRows = [];
    let from = 0;
    const step = 1000;

    while (true) {
      let query = client.from(tableName).select('*');
      if (orderCol) {
        query = query.order(orderCol, { ascending });
      }
      const { data, error } = await query.range(from, from + step - 1);

      if (error) {
        if (from === 0 && orderCol) {
          const fallbackRes = await client.from(tableName).select('*').range(0, step - 1);
          if (!fallbackRes.error && fallbackRes.data) {
            return fallbackRes.data;
          }
        }
        console.warn(`[DB Helper] Gagal fetch tabel ${tableName}:`, error.message);
        break;
      }

      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < step) break;
      from += step;
    }

    return allRows;
  },

  async fetchAdmin() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('admin').select('*').order('id_admin', { ascending: true });
      if (error) return [];
      return (data || []).map(a => ({
        id_admin: a.id_admin || a.ID_ADMIN || a.id,
        username: String(a.username || a.USERNAME || 'admin').trim(),
        password: String(a.password || a.PASSWORD || 'admin123').trim(),
        nama_admin: a.nama_admin || a.NAMA_ADMIN || 'Administrator Proktor',
        no_hp: String(a.no_hp || a.NO_HP || '-').trim(),
        status: a.status || a.STATUS || 'Aktif'
      }));
    } catch (err) {
      return [];
    }
  },

  async insertAdmin(payload) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    const { data, error } = await client.from('admin').insert([payload]);
    if (error) throw error;
    return data;
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
    if (error && error.code === '23505') {
      const { data: allMapel } = await client.from('mapel').select('id').order('id', { ascending: false }).limit(1);
      const maxId = (allMapel && allMapel.length > 0) ? (parseInt(allMapel[0].id) || 0) + 1 : 1;

      const resManual = await client.from('mapel').insert([{ id: maxId, nama_mapel: namaMapel }]);
      if (resManual.error) {
        const resManual2 = await client.from('mapel').insert([{ id: maxId, mapel: namaMapel }]);
        if (resManual2.error) throw resManual2.error;
        return resManual2.data;
      }
      return resManual.data;
    }

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

  async fetchGuru() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const { data, error } = await client.from('guru').select('*').order('id_guru', { ascending: true });
      if (error) return [];
      const mapped = (data || []).map(g => ({
        id_guru: g.id_guru || g.ID_GURU || g.id,
        nama_guru: g.nama_guru || g.NAMA_GURU || g.nama || '-',
        nip: String(g.nip || g.NIP || '-').trim(),
        no_hp: String(g.no_hp || g.NO_HP || g.telepon || '').trim(),
        password: String(g.password || g.PASSWORD || 'guru123').trim(),
        jabatan: g.jabatan || g.JABATAN || 'Guru Mata Pelajaran',
        mapel_diampu: g.mapel_diampu || g.MAPEL_DIAMPU || '-',
        kelas_diampu: g.kelas_diampu || g.KELAS_DIAMPU || '-',
        status_kepegawaian: g.status_kepegawaian || g.STATUS_KEPEGAWAIAN || 'PNS',
        status: g.status || g.STATUS || 'Aktif'
      }));

      this._cachedGuruList = mapped;
      const parsedKepsek = this.extractKepsekFromList(mapped);
      if (parsedKepsek) this._cachedKepsek = parsedKepsek;

      return mapped;
    } catch (err) {
      return [];
    }
  },

  async insertGuru(payload) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    const { data, error } = await client.from('guru').insert([payload]);
    if (error) throw error;
    this._cachedGuruList = null;
    this._cachedKepsek = null;
    return data;
  },

  async updateGuru(id_guru, payload) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    const { data, error } = await client.from('guru').update(payload).eq('id_guru', id_guru);
    this._cachedGuruList = null;
    this._cachedKepsek = null;
    if (error) {
      const resCap = await client.from('guru').update(payload).eq('ID_GURU', id_guru);
      if (resCap.error) {
        const resId = await client.from('guru').update(payload).eq('id', id_guru);
        if (resId.error) throw error;
        return resId.data;
      }
      return resCap.data;
    }
    return data;
  },

  async deleteGuru(id_guru) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    const { error } = await client.from('guru').delete().eq('id_guru', id_guru);
    this._cachedGuruList = null;
    this._cachedKepsek = null;
    if (error) {
      const resCap = await client.from('guru').delete().eq('ID_GURU', id_guru);
      if (resCap.error) {
        const resId = await client.from('guru').delete().eq('id', id_guru);
        if (resId.error) throw error;
      }
    }
    return true;
  },

  async fetchSiswa() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      const dataSiswa = await this.fetchAllRows('siswa', null, true);
      let dataAkun = [];
      try {
        dataAkun = await this.fetchAllRows('akun_siswa', null, true);
      } catch (e) {}

      return (dataSiswa || []).map(s => {
        const akun = dataAkun.find(a =>
          String(a.ID_SISWA || a.id_siswa || '').trim() === String(s.ID_SISWA || s.id_siswa || '').trim()
        );
        return {
          id_siswa: s.ID_SISWA || s.id_siswa || s.id,
          nisn: String(s.NISN || s.nisn || '-').trim(),
          nama: s.NAMA_SISWA || s.nama_siswa || s.nama || '-',
          kelas: s.KELAS || s.kelas || '-',
          status: s.STATUS || s.status || 'Aktif',
          ttl: s.TTL || s.ttl || '-',
          user: String(akun ? (akun.username || akun.USERNAME) : (s.NISN || s.nisn || 'user')).trim(),
          pass: String(akun ? (akun.password || akun.PASSWORD) : 'smk123').trim()
        };
      });
    } catch (err) {
      return [];
    }
  },

  async bulkUpdatePasswordSiswa(updates = []) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    if (!Array.isArray(updates) || updates.length === 0) return 0;

    let existingAkun = [];
    try {
      existingAkun = await this.fetchAllRows('akun_siswa', null, true);
    } catch (e) {}

    const existingMap = {};
    existingAkun.forEach(a => {
      const key = String(a.ID_SISWA || a.id_siswa || '').trim();
      if (key) existingMap[key] = a;
    });

    const batchSize = 25;
    let successCount = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      await Promise.all(chunk.map(async (item) => {
        const idStr = String(item.id_siswa || '').trim();
        const usernameVal = String(item.username || item.nisn || '').trim();
        const newPass = String(item.password || '').trim();
        if (!idStr || !newPass) return;

        if (existingMap[idStr]) {
          const { error: errUp1 } = await client
            .from('akun_siswa')
            .update({ password: newPass })
            .eq('id_siswa', idStr);

          if (errUp1) {
            await client
              .from('akun_siswa')
              .update({ PASSWORD: newPass })
              .eq('ID_SISWA', idStr);
          }
        } else {
          const { error: errIns1 } = await client
            .from('akun_siswa')
            .insert([{ id_siswa: idStr, username: usernameVal, password: newPass }]);

          if (errIns1) {
            await client
              .from('akun_siswa')
              .insert([{ ID_SISWA: idStr, USERNAME: usernameVal, PASSWORD: newPass }]);
          }
        }
        successCount++;
      }));
    }

    return successCount;
  },

  async fetchBankSoal() {
    const client = await this.getClient();
    if (!client) return [];
    try {
      return await this.fetchAllRows('bank_soal', 'id', true);
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

  async fetchActiveScheduleForStudent(kelasSiswa) {
    const schedules = await this.fetchSchedules();
    if (!schedules || schedules.length === 0) return null;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${year}-${month}-${day}`;

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    const activeSchedule = schedules.find(j => {
      const listOfKelasTarget = String(j.kelas).toUpperCase().split(',').map(k => k.trim());
      const matchKelas = listOfKelasTarget.includes(String(kelasSiswa).trim().toUpperCase());
      const matchTanggal = String(j.tanggal).trim() === currentDateStr;
      
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
      const data = await this.fetchAllRows('hasil_ujian', 'id', true);
      
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

  // --- ANTI-DUPLIKASI: CEK EXISTING RECORD (id_siswa + mapel) SEBELUM INSERT ---
  async insertHasilUjian(payload) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");

    const rawId = String(payload.id_siswa || '').trim();
    const numericId = /^\d+$/.test(rawId) ? Number(rawId) : null;
    const normStr = (v) => String(v || '').replace(/\s+/g, ' ').trim().toUpperCase();
    const targetMapel = normStr(payload.mapel);
    const targetNama = normStr(payload.nama_siswa);

    try {
      const { data: existingList } = await client.from('hasil_ujian').select('*');
      const matches = (existingList || []).filter(r => {
        if (normStr(r.mapel || r.MAPEL) !== targetMapel) return false;
        const rId = String(r.ID_SISWA || r.id_siswa || '').trim();
        const rNama = normStr(r.nama_siswa || r.NAMA_SISWA);
        return (rawId && rId === rawId) || (targetNama && rNama === targetNama);
      });

      if (matches.length > 0) {
        matches.sort((a, b) => Number(a.id || a.ID || 0) - Number(b.id || b.ID || 0));
        const primary = matches[0];
        const primaryId = primary.id || primary.ID;
        const incomingStatus = normStr(payload.status_selesai);
        const existingStatus = normStr(primary.status_selesai || primary.STATUS_SELESAI);

        // Hapus baris ganda berlebih jika sempat terbentuk
        if (matches.length > 1) {
          const extraIds = matches.slice(1).map(x => x.id || x.ID).filter(Boolean);
          if (extraIds.length > 0) {
            await client.from('hasil_ujian').delete().in('id', extraIds);
          }
        }

        // Jangan timpa record SELESAI/DIDISKUALIFIKASI dengan status MENGERJAKAN
        if ((existingStatus === 'SELESAI' || existingStatus === 'DIDISKUALIFIKASI') && incomingStatus === 'MENGERJAKAN') {
          return [primary];
        }

        const { data: updatedData, error: updErr } = await client
          .from('hasil_ujian')
          .update({
            nilai: payload.nilai,
            jumlah_pelanggaran: payload.jumlah_pelanggaran,
            status_selesai: payload.status_selesai,
            waktu_selesai: payload.waktu_selesai || new Date().toISOString()
          })
          .eq('id', primaryId)
          .select();

        if (!updErr) return updatedData || [primary];
      }
    } catch (e) {
      console.warn("[DB] Cek duplikasi dilewati:", e.message);
    }

    const attempts = [
      ...(numericId !== null ? [{
        ID_SISWA: numericId,
        nama_siswa: payload.nama_siswa,
        kelas: payload.kelas,
        mapel: payload.mapel,
        nilai: payload.nilai,
        jumlah_pelanggaran: payload.jumlah_pelanggaran,
        status_selesai: payload.status_selesai,
        waktu_selesai: payload.waktu_selesai
      }] : []),
      {
        ID_SISWA: rawId,
        nama_siswa: payload.nama_siswa,
        kelas: payload.kelas,
        mapel: payload.mapel,
        nilai: payload.nilai,
        jumlah_pelanggaran: payload.jumlah_pelanggaran,
        status_selesai: payload.status_selesai,
        waktu_selesai: payload.waktu_selesai
      },
      {
        id_siswa: numericId !== null ? numericId : rawId,
        nama_siswa: payload.nama_siswa,
        kelas: payload.kelas,
        mapel: payload.mapel,
        nilai: payload.nilai,
        jumlah_pelanggaran: payload.jumlah_pelanggaran,
        status_selesai: payload.status_selesai,
        waktu_selesai: payload.waktu_selesai
      },
      {
        ID_SISWA: numericId !== null ? numericId : rawId,
        mapel: payload.mapel,
        nilai: payload.nilai,
        jumlah_pelanggaran: payload.jumlah_pelanggaran,
        status_selesai: payload.status_selesai
      }
    ];

    let lastError = null;
    for (const candidate of attempts) {
      const { data, error } = await client.from('hasil_ujian').insert([candidate]).select();
      if (!error) return data;
      lastError = error;
    }

    throw lastError || new Error("Gagal insert ke tabel hasil_ujian");
  },

  // --- AUTO-TUTUP SESI MENGERJAKAN YANG JADWALNYA SUDAH LEWAT ---
  async closeExpiredMengerjakanSessions() {
    const client = await this.getClient();
    if (!client) return 0;

    try {
      const [schedules, hasilList] = await Promise.all([
        this.fetchSchedules(),
        this.fetchHasilUjian()
      ]);

      const ongoingList = (hasilList || []).filter(h =>
        String(h.status_selesai || '').trim().toUpperCase() === 'MENGERJAKAN'
      );
      if (ongoingList.length === 0) return 0;

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      const normStr = (v) => String(v || '').replace(/\s+/g, ' ').trim().toUpperCase();
      const expiredIds = [];

      ongoingList.forEach(rec => {
        const recMapel = normStr(rec.mapel);
        const recKelas = normStr(rec.kelas);

        const matchedSchedules = (schedules || []).filter(j => {
          const mMatch = normStr(j.mapel) === recMapel;
          const kList = String(j.kelas || '').split(',').map(k => normStr(k));
          return mMatch && kList.includes(recKelas);
        });

        if (matchedSchedules.length === 0) {
          const lastBeat = new Date(rec.waktu_selesai || 0).getTime();
          if (Date.now() - lastBeat > 2 * 60 * 60 * 1000) {
            expiredIds.push(rec.id);
          }
          return;
        }

        const isAnyActiveNow = matchedSchedules.some(j => {
          const tgl = String(j.tanggal || '').trim();
          if (tgl !== todayStr) return false;
          const parts = String(j.jamSelesai || '23:59').substring(0, 5).split(':');
          const endMin = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0) + 10;
          return nowMinutes <= endMin;
        });

        const hasPastSchedule = matchedSchedules.some(j => {
          const tgl = String(j.tanggal || '').trim();
          if (tgl < todayStr) return true;
          if (tgl === todayStr) {
            const parts = String(j.jamSelesai || '23:59').substring(0, 5).split(':');
            const endMin = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0) + 10;
            return nowMinutes > endMin;
          }
          return false;
        });

        if (!isAnyActiveNow && hasPastSchedule && rec.id) {
          expiredIds.push(rec.id);
        }
      });

      if (expiredIds.length > 0) {
        await client
          .from('hasil_ujian')
          .update({ status_selesai: 'SELESAI' })
          .in('id', expiredIds);
      }

      return expiredIds.length;
    } catch (e) {
      console.warn("[DB] Auto-close sesi kedaluwarsa dilewati:", e.message);
      return 0;
    }
  },

  async deleteHasilUjian(id) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");
    const { error } = await client.from('hasil_ujian').delete().eq('id', id);
    if (error) {
      const { error: errCap } = await client.from('hasil_ujian').delete().eq('ID', id);
      if (errCap) throw errCap;
    }
    return true;
  },

  async deleteHasilUjianMassal(ids = []) {
    const client = await this.getClient();
    if (!client) throw new Error("Database tidak terhubung.");

    const validIds = (ids || []).filter(id => id !== null && id !== undefined && id !== '');
    if (validIds.length === 0) return 0;

    const { error } = await client.from('hasil_ujian').delete().in('id', validIds);
    if (error) {
      const { error: errCap } = await client.from('hasil_ujian').delete().in('ID', validIds);
      if (errCap) throw errCap;
    }
    return validIds.length;
  }
};

window.DB = DB;
DB.initImmediate();
