const CONFIG = {
  SUPABASE_URL: "https://nbwpnhshhpfqtmbwewgk.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id3BuaHNoaHBmcXRtYndld2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MTQ1ODUsImV4cCI6MjEwNzk5MDU4NX0.2Ah6o8svWPMDEI1O3zOxytNyqBIjED7GXTxowNm1Ai4",
  MAX_VIOLATIONS: 2
};

// Inisialisasi Supabase Klien Global
if (typeof supabase !== 'undefined' && CONFIG.SUPABASE_URL) {
  try {
    window.supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    console.log("[Config] Supabase Client terinisialisasi.");
  } catch (err) {
    console.error("[Config] Gagal inisialisasi Supabase:", err.message);
  }
}
