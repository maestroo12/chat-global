// Konfigurasi web Firebase. Nilai ini memang publik (ikut terkirim ke browser);
// keamanan data dijaga oleh database.rules.json, bukan dengan menyembunyikan key.
// Di Google Cloud Console, batasi API key ke domain situs kamu (HTTP referrer).
export const firebaseConfig = {
  apiKey: "AIzaSyDQYSoIuyWfHJYCMU8B0HAKFOkshiGCrXw",
  // Harus SAMA dengan domain tempat situs dibuka. Kalau beda, browser HP
  // (Brave, Safari, Chrome terbaru) memblokir storage lintas-domain dan login
  // gagal dengan "missing initial state". Firebase Hosting otomatis menyediakan
  // /__/auth/handler di setiap domainnya. Di localhost pakai domain bawaan.
  authDomain: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "chat-globall.firebaseapp.com"
    : location.hostname,
  databaseURL:
    "https://chat-globall-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-globall",
  storageBucket: "chat-globall.firebasestorage.app",
  messagingSenderId: "681085064123",
  appId: "1:681085064123:web:45edafbf44945ef5762a9e",
  measurementId: "G-KES6SEN37K",
};

// Batas aplikasi. Angka yang berkaitan dengan Rules harus ikut disamakan
// di database.rules.json (500 teks, 512000 byte file, 100 pesan/hari tamu).
export const LIMITS = {
  MAX_ANON: 30, // batas pesan tamu per 24 jam
  MAX_ANON_NAME_CHANGES: 5, // batas perubahan nama tamu per 24 jam
  DAY_MS: 24 * 60 * 60 * 1000,
  MAX_RIWAYAT: 1000, // jumlah pesan terbaru yang bisa dibuka
  HALAMAN: 100, // jumlah pesan per muatan (tiap 100 harus tekan "Muat pesan lama")
  MAX_TEKS: 500,
  MAX_IMG_BYTES: 350 * 1024, // foto dikecilkan otomatis sampai di bawah ini
  MAX_FILE_BYTES: 500 * 1024, // batas file biasa
};
