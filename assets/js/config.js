// Konfigurasi web Firebase. Nilai ini memang publik (ikut terkirim ke browser);
// keamanan data dijaga oleh database.rules.json, bukan dengan menyembunyikan key.
// Di Google Cloud Console, batasi API key ke domain situs kamu (HTTP referrer).

// Web client ID untuk "Sign in with Google" (dipakai kalau situs TIDAK di Firebase
// Hosting, mis. GitHub Pages). Ambil dari: Firebase Console -> Authentication ->
// Sign-in method -> Google -> Web SDK configuration -> "Web client ID".
// Bentuknya: 1234567890-xxxxxxxx.apps.googleusercontent.com
export const GOOGLE_CLIENT_ID = "681085064123-qer486qqqntmp0l8l4ji9l3vm16nfcfl.apps.googleusercontent.com";

// true kalau situs dibuka dari Firebase Hosting (domain *.web.app / *.firebaseapp.com).
// Di sana /__/auth/handler tersedia di domain yang sama, jadi login Firebase
// normal (popup/redirect) aman dari pemblokiran storage di browser HP.
// Di GitHub Pages hasilnya false, karena /__/auth/handler tidak ada di sana.
export const HOSTED_ON_FIREBASE = /\.(web\.app|firebaseapp\.com)$/.test(
  location.hostname,
);

const AUTH_DOMAIN = HOSTED_ON_FIREBASE
  ? location.hostname
  : "chat-globall.firebaseapp.com";

export const firebaseConfig = {
  apiKey: "AIzaSyDQYSoIuyWfHJYCMU8B0HAKFOkshiGCrXw",
  authDomain: AUTH_DOMAIN,
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
