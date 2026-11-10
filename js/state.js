const State = {
  currentUser: null,
  mapelList: [],
  kelasOptions: [],
  students: [],
  questions: [],
  hasilUjianList: [],
  jadwalList: JSON.parse(localStorage.getItem('EXAM_JADWAL_LIST')) || [],
  openAccordionMapel: {},
  violations: 0,
  examActive: false,
  currentQuestionIdx: 0,
  answers: {}
};
