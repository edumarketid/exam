const State = {
  mapelList: [],
  students: [],
  questions: [],
  schedules: [],
  examResults: [],
  kelasOptions: [],
  openAccordionMapel: {},
  currentStudent: null,
  activeExam: null
};

// Pastikan terdaftar di window agar bisa diakses oleh seluruh modul (supabase.js, soal.js, dll)
window.State = State;
