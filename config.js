// config.js - Konfigurasi Utama & Supabase Client ExamSMKN1Wakatobi

const CONFIG = {
  // Supabase Credentials Default
  SUPABASE_URL: "https://nbwpnhshhpfqtmbwewgk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id3BuaHNoaHBmcXRtYndld2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MTQ1ODUsImV4cCI6MjEwNzk5MDU4NX0.2Ah6o8svWPMDEI1O3zOxytNyqBIjED7GXTxowNm1Ai4",
  
  // Informasi Aplikasi
  APP_NAME: "ExamSMKN1Wakatobi",
  SEMESTER: "Penilaian Sumatif Semester Ganjil TA 2026/2027",
  SCHOOL_NAME: "SMK Negeri 1 Wakatobi",
  
  // Batas Kecurangan (Security)
  MAX_VIOLATIONS: 2
};

// Getter URL & Key (mendukung override dari localStorage via menu Admin)
const getSupabaseUrl = () => localStorage.getItem('EXAM_SUPABASE_URL') || CONFIG.SUPABASE_URL;
const getSupabaseKey = () => localStorage.getItem('EXAM_SUPABASE_KEY') || CONFIG.SUPABASE_ANON_KEY;

let dbClient = null;

function initSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  
  if (window.supabase && url && key) {
    try {
      dbClient = window.supabase.createClient(url, key);
      console.log("Supabase Client successfully initialized.");
    } catch (err) {
      console.error("Gagal menginisialisasi Supabase Client:", err);
    }
  }
  return dbClient;
}

// Inisialisasi awal client
const supabaseClient = initSupabaseClient();