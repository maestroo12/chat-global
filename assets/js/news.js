import { LIMITS } from "./config.js";
import { formatUkuran } from "./utils.js";

// Tambah pembaruan baru di PALING ATAS daftar. `id` harus unik: kalau id teratas
// berubah, titik merah muncul lagi di tombol lonceng untuk semua orang.
export const NEWS = [
  {
    id: "2026-10-23-warna",
    date: "23 Okt 2026",
    title: "Warna baru",
    points: [
      "Tampilan diganti ke warna biru tinta dan abu-abu netral yang lebih kalem. Tidak lagi hijau ala WhatsApp.",
      "Mode terang dan gelap tetap ada, diatur lewat saklar di Profil → Pengaturan.",
      "Warna avatar yang tanpa foto juga dirapikan jadi palet yang lebih redup.",
    ],
  },
  {
    id: "2026-10-23-ringkas",
    date: "23 Okt 2026",
    title: "Tampilan lebih ringkas",
    points: [
      "Label status di samping nama pesan sekarang hanya untuk Admin. Akun Google ditandai centang, tamu tanpa centang.",
      "Beranda, Profil, dan menu samping dirapikan. Info yang dobel (status, email, tombol login, jumlah online) dihapus supaya tidak makan tempat.",
      "Profil orang lain (ketuk foto) dibuat lebih singkat: label Admin atau Tamu, status online, dan bio kalau ada.",
      "Beranda dan Profil tidak digambar ulang terus-menerus, jadi terasa lebih ringan.",
    ],
  },
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
      "Beranda menampilkan obrolan terbaru, siapa yang sedang online, dan pembaruan. Pesan yang belum dibaca muncul sebagai angka di menu Chat.",
      "Di Profil kamu bisa ubah nama tampilan dan bio (akun Google), lihat info akun, dan ganti mode gelap.",
      "Tampilan di laptop/PC dibuat lebih lebar.",
    ],
  },
  {
    id: "2026-10-20-tema",
    date: "20 Okt 2026",
    title: "Mode gelap & menu pembaruan",
    points: [
      "Mode gelap diatur lewat saklar di Profil, bagian Pengaturan.",
      "Kalau belum dipilih, tema mengikuti setelan perangkatmu.",
      "Pembaruan bisa dilihat lewat tombol lonceng di Beranda. Titik merah muncul kalau ada yang baru.",
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
      `Tamu bisa kirim ${LIMITS.MAX_ANON} pesan per 24 jam dan ganti nama ${LIMITS.MAX_ANON_NAME_CHANGES} kali per hari. Login Google untuk tanpa batas.`,
      "Centang di pesanmu: ✓ terkirim, ✓✓ abu-abu ada yang online, ✓✓ biru sudah dibaca.",
      `Tombol "Muat pesan lama" membuka sampai ${LIMITS.MAX_RIWAYAT} pesan terakhir.`,
      "Jumlah orang yang sedang online tampil di bawah judul chat.",
    ],
  },
];
