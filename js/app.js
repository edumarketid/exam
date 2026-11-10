document.addEventListener('DOMContentLoaded', async () => {
  console.log("ExamSMKN1Wakatobi Modular App Ready");
  
  // Cek Status Database
  const client = await DB.getClient();
  const badge = document.getElementById('db-status-badge');
  if (badge) {
    if (client) {
      badge.textContent = "Database Connected";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-emerald-600 text-white font-medium";
    } else {
      badge.textContent = "Offline / Config Error";
      badge.className = "px-2.5 py-1 text-xs rounded-full bg-red-600 text-white font-medium";
    }
  }

  // Muat Data Mapel Langsung
  await MapelModule.loadAndRender();
});

// Bridge fungsi global untuk HTML Event Handlers
window.app = {
  switchAdminTab(tabName) {
    ['monitoring', 'jadwal', 'rekap-nilai', 'upload-soal', 'siswa', 'bank-soal', 'mapel'].forEach(t => {
      document.getElementById(`tab-${t}`)?.classList.add('hidden');
    });
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
    if (tabName === 'mapel') MapelModule.loadAndRender();
  },
  logout() {
    location.reload();
  }
};
