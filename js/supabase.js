const DB = {
  async getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    
    // Tunggu hingga Supabase SDK siap
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
  }
};
