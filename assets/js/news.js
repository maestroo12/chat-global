import { LIMITS } from "./config.js";
import { formatUkuran } from "./utils.js";

// Tambah pembaruan baru di PALING ATAS daftar. `id` harus unik: kalau id teratas
// berubah, titik merah muncul lagi di tombol lonceng untuk semua orang.
export const NEWS = [
  {
    id: "2026-10-22-foto-profil",
    date: "22 Okt 2026",
    title: "Foto profil",
    points: [
      "Akun Google (User dan Admin) bisa ganti atau hapus foto profil lewat menu Profil. Tamu tidak bisa.",
      "Foto tampil di samping pesan, di Beranda, dan di daftar online. Siapa pun, termasuk tamu, bisa ketuk foto orang untuk melihat profilnya.",
      "Profil orang lain hanya bisa dilihat. Admin yang mau ganti atau hapus foto seseorang lewat Panel admin, bagian Cek & atur pengguna.",
    ],
  },
  {
    id: "2026-10-22-admin-pengguna",
    date: "22 Okt 2026",
    title: "Admin: cek profil & atur pengguna",
    points: [
      "Admin bisa cek profil siapa pun lewat ID atau nama di Panel admin, atau lewat menu pesan.",
      "Admin bisa mengatur batas pesan per 24 jam, batas ganti nama, panjang maksimal pesan, dan izin kirim file untuk tiap pengguna.",
    ],
  },
  {
    id: "2026-10-21-panel",
    date: "21 Okt 2026",
    title: "Beranda & Profil",
    points: [
      "Sekarang ada menu Beranda, Chat, dan Profil. Di laptop menunya di samping, di HP di bawah.",
      "Beranda nunjukin obrolan terbaru, siapa yang lagi online, dan pembaruan. Pesan yang belum dibaca muncul sebagai angka di menu Chat.",
      "Di Profil lu bisa ubah nama tampilan dan bio (akun Google), lihat info akun, dan ganti mode gelap.",
      "Tampilan di laptop/PC dibuat lebih lebar.",
    ],
  },
  {
    id: "2026-10-20-tema",
    date: "20 Okt 2026",
    title: "Mode gelap & menu pembaruan",
    points: [
      "Kalau mau ganti mode, klik tombol bulan/matahari, nanti berubah",
      "Tema default lu bakal ngikutin tema setelan pabrik device lu",
      "Cek apa yang diupdate melalui tombol Notifikasi",
    ],
  },
  {
    id: "2026-10-20-reply",
    date: "20 Okt 2026",
    title: "Balas pesan lebih rapi",
    points: [
      "Kutipan balasan tampil rapi di dalam gelembung pesan.",
      "Ketuk kutipan untuk lompat ke pesan aslinya.",
      "Pesan lama yang dibalas ikut dimuat, walau di luar riwayat yang terbuka.",
    ],
  },
  {
    id: "fitur-dasar",
    title: "Fitur yang sudah ada",
    points: [
      "Ketuk pesan untuk membalas atau menghapus (untuk saya / untuk semua orang).",
      `Login Google: nama otomatis, centang terverifikasi, dan bisa kirim foto atau file (maks ${formatUkuran(LIMITS.MAX_FILE_BYTES)}).`,
      `Tamu bisa kirim ${LIMITS.MAX_ANON} pesan per 24 jam. Login Google untuk tanpa batas.`,
      `Tombol "Muat pesan lama" membuka sampai ${LIMITS.MAX_RIWAYAT} pesan terakhir.`,
      "Jumlah orang yang sedang online tampil di bawah judul.",
    ],
  },
];
