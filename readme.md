# FitChat (Fitnah Chat)

Link website: https://maestroo12.github.io/chat-global/

Aplikasi **chat global realtime** berbasis web. Siapa pun bisa langsung ngobrol sebagai **tamu** tanpa daftar, atau **login dengan Google** untuk mendapat centang terverifikasi, kirim foto/file, dan kirim pesan tanpa batas.

Dibangun dengan HTML, CSS, dan JavaScript murni (tanpa framework dan tanpa proses build), dengan **Firebase** (Authentication, Realtime Database, Hosting) sebagai backend.

![Tampilan utama](docs/screenshots/01-tampilan-utama.png)

## Fitur

- **Chat realtime** untuk semua pengguna dalam satu ruang global.
- **Masuk sebagai tamu** (Firebase Anonymous Auth), cukup isi nama. Batas ganti nama 5x per hari.
- **Login Google**: nama otomatis, centang terverifikasi, kirim foto/file, tanpa batas pesan.
- **Status badge**: menampilkan status pengguna (Admin/User/Anon) di samping nama.
- **Balas pesan** dengan kutipan di dalam gelembung. Ketuk kutipan untuk lompat ke pesan aslinya.
- **Hapus pesan**: "Hapus untuk saya" (hanya hilang di layarmu) atau "Hapus untuk semua orang" (isi pesan dihapus, tersisa keterangan "Pesan ini telah dihapus").
- **Kirim foto dan file** (khusus akun Google). Foto dikecilkan otomatis di browser sebelum dikirim, dan bisa dibuka dalam tampilan penuh (lightbox).
- **Riwayat pesan**: tombol "Muat pesan lama" membuka hingga 100 pesan terakhir.
- **Indikator online**: jumlah orang yang sedang online tampil di bawah judul.
- **Mode terang/gelap**: mengikuti setelan perangkat dan bisa diganti manual.
- **Menu "Yang baru"**: daftar pembaruan dengan titik merah pada tombol lonceng saat ada info baru.
- **Batas pesan tamu** per 24 jam, dijaga di sisi klien dan di Database Rules.

## Cuplikan layar

|                                                       |                                                   |                                                     |
| ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| ![Mode gelap](docs/screenshots/02-mode-gelap.png)     | ![Menu pesan](docs/screenshots/03-menu-pesan.png) | ![Balas pesan](docs/screenshots/04-balas-pesan.png) |
| Mode gelap                                            | Menu pesan                                        | Balas pesan                                         |
| ![Login Google](docs/screenshots/05-login-google.png) | ![Kirim foto](docs/screenshots/06-kirim-foto.png) | ![Yang baru](docs/screenshots/07-yang-baru.png)     |
| Login Google                                          | Kirim foto                                        | Menu "Yang baru"                                    |
| ![Foto penuh](docs/screenshots/08-foto-penuh.png)     | ![Batas tamu](docs/screenshots/09-batas-tamu.png) | ![Desktop](docs/screenshots/10-desktop.png)         |
| Foto tampilan penuh                                   | Batas pesan tamu                                  | Tampilan desktop                                    |

## Tamu vs Login Google

|                       | Tamu                              | Login Google              |
| --------------------- | --------------------------------- | ------------------------- |
| Kirim pesan teks      | Ya, dibatasi per 24 jam           | Ya, tanpa batas           |
| Kirim foto/file       | Tidak                             | Ya                        |
| Centang terverifikasi | Tidak                             | Ya                        |
| Nama                  | Diisi sendiri (maks. 24 karakter, ganti max 5x/hari) | Otomatis dari akun Google |
| Status badge          | Anon                              | User                      |

## Batas aplikasi

Semua batas ada di `assets/js/config.js` (objek `LIMITS`).

| Batas                             | Nilai             |
| --------------------------------- | ----------------- |
| Panjang pesan teks                | 500 karakter      |
| Pesan tamu per 24 jam             | 30 pesan          |
| Ganti nama tamu per 24 jam        | 5 kali            |
| Ukuran foto (dikecilkan otomatis) | di bawah 350 KB   |
| Ukuran file biasa                 | 500 KB            |
| Riwayat pesan yang bisa dibuka    | 100 pesan terbaru |
| Pesan per muatan                  | 50 pesan          |

> **Catatan:** `database.rules.json` memakai plafon yang lebih longgar sebagai pengaman terakhir (maks. 30 pesan tamu per 24 jam, 5 ganti nama tamu per 24 jam, file 512000 byte). Jika mengubah angka di `config.js`, sesuaikan juga aturan terkait di `database.rules.json`.

## Teknologi

- **Frontend**: HTML, CSS, dan JavaScript (ES Modules), tanpa build tool.
- **Firebase JS SDK 13.0.0** dimuat dari `gstatic.com`.
- **Firebase Authentication**: Anonymous dan Google Sign-In.
- **Firebase Realtime Database**: pesan, status online, dan batas tamu.
- **Firebase Hosting**: dengan header keamanan (CSP, HSTS, dan lainnya).

## Struktur proyek

```
.
├── index.html               # Halaman utama
├── 404.html                 # Halaman tidak ditemukan
├── favicon.svg
├── firebase.json            # Konfigurasi Hosting + Database + header keamanan
├── database.rules.json      # Aturan keamanan Realtime Database
├── assets/
│   ├── css/
│   │   ├── style.css        # Gaya utama (terang/gelap)
│   │   └── 404.css
│   └── js/
│       ├── main.js          # Logika utama: auth, chat, reply, hapus, upload, presence
│       ├── config.js        # Konfigurasi Firebase dan LIMITS
│       ├── news.js          # Daftar pembaruan untuk menu "Yang baru"
│       ├── utils.js         # Fungsi bantu (format ukuran, wrapper localStorage)
│       └── theme-init.js    # Menerapkan tema sebelum halaman tampil (anti-berkedip)
├── scripts/
│   └── check.mjs            # Pemeriksaan ringan sebelum deploy
└── docs/
    └── screenshots/         # Gambar untuk README
```

## Struktur data (Realtime Database)

| Path                       | Isi                                                                                     | Akses                                          |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `chat/{messageId}`         | Pesan: `uid`, `name`, `timestamp`, `text` atau `file`, `verified`, `replyTo`, `deleted` | Baca: pengguna login. Tulis: pemilik pesan     |
| `files/{fileId}`           | Data file sebagai data URL base64 (maks. 512000 byte)                                   | Baca: pengguna login. Tulis: hanya akun Google |
| `users/{uid}`              | Status online: `name`, `online`, `lastSeen`                                             | Baca: pengguna login. Tulis: pemilik           |
| `hidden/{uid}/{messageId}` | Pesan yang disembunyikan ("Hapus untuk saya")                                           | Hanya pemilik                                  |
| `anonDevice/{uid}`         | Pemetaan akun tamu ke ID perangkat                                                      | Hanya pemilik                                  |
| `deviceLimit/{deviceId}`   | Penghitung pesan tamu (`count`, `start`)                                                | Hanya perangkat terkait                        |
| `deviceNameLimit/{deviceId}` | Penghitung ganti nama tamu (`count`, `start`)                                           | Hanya perangkat terkait                        |

Aturan di `database.rules.json` memvalidasi tipe dan panjang setiap field, memastikan `uid` sesuai pengirim, hanya mengizinkan pesan dihapus oleh pengirimnya sendiri, dan mencegah tamu mengirim file atau mengklaim status terverifikasi.

## Menjalankan secara lokal

Karena memakai ES Modules, halaman harus dibuka lewat server lokal (bukan klik dua kali pada `index.html`).

```bash
# Opsi 1: Firebase Emulator / Hosting lokal
npm install -g firebase-tools
firebase serve --only hosting

# Opsi 2: server statis apa saja
npx serve .
# atau
python -m http.server 8080
```

Lalu buka `http://localhost:5000` (Firebase) atau `http://localhost:8080` (Python).

> Agar login Google berjalan di `localhost`, pastikan `localhost` ada di **Authentication → Settings → Authorized domains** pada Firebase Console.

## Setup Firebase (jika memakai proyek sendiri)

1. Buat proyek di [Firebase Console](https://console.firebase.google.com/).
2. Aktifkan **Authentication** dan nyalakan provider **Anonymous** dan **Google**.
3. Buat **Realtime Database** (disarankan region terdekat, mis. `asia-southeast1`).
4. Daftarkan aplikasi web, lalu salin konfigurasinya ke `firebaseConfig` di `assets/js/config.js`.
5. Pasang CLI dan hubungkan proyek:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```
6. Perbarui domain Firebase di header `Content-Security-Policy` pada `firebase.json` (bagian `frame-src` masih menunjuk ke `chat-globall.firebaseapp.com`) agar sesuai dengan proyekmu.

## Deploy

```bash
# Pemeriksaan sebelum deploy (opsional)
node scripts/check.mjs

# Deploy aturan database + hosting
firebase deploy

# Atau terpisah
firebase deploy --only database
firebase deploy --only hosting
```

`scripts/check.mjs` memeriksa bahwa file JSON valid, semua file di `assets/js` bebas error sintaks, dan semua file yang dirujuk `index.html` ada. Skrip ini juga membaca `.firebaserc` dan `package.json`, jadi pastikan keduanya ada di root proyek.

## Menambah pengumuman "Yang baru"

Tambahkan entri baru di **paling atas** array `NEWS` pada `assets/js/news.js`:

```js
{
  id: "2026-10-21-fitur-baru",   // harus unik
  date: "21 Okt 2026",
  title: "Judul pembaruan",
  points: ["Poin pertama", "Poin kedua"],
},
```

Jika `id` teratas berubah, titik merah pada tombol lonceng muncul lagi untuk semua pengguna.

## Keamanan

- **Nilai di `config.js` memang publik.** API key Firebase untuk web bukan rahasia dan terkirim ke browser. Keamanan data dijaga oleh `database.rules.json`. Sebaiknya batasi API key ke domain situsmu lewat Google Cloud Console (HTTP referrer).
- **Content Security Policy** ketat diterapkan lewat `firebase.json` (tanpa `unsafe-inline`, sehingga inisialisasi tema dibuat sebagai file terpisah).
- Header tambahan: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, dan `Permissions-Policy`.
- Batas pesan tamu dihitung per perangkat di database, bukan hanya di sisi klien.
- File `.env` dan `.vscode/` sudah masuk `.gitignore`.

## Kontribusi

Pull request dan saran sangat diterima. Untuk perubahan besar, silakan buka issue terlebih dahulu.

## Lisensi

Belum ditentukan. Tambahkan file `LICENSE` jika ingin menentukan lisensi proyek ini.
