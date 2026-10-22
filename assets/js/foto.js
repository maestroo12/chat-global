import {
  ref,
  get,
  set,
  remove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

// Foto profil. Disimpan sebagai gambar JPEG kecil (data URL) di avatars/{uid}.
// - Dibaca siapa pun yang sudah masuk (termasuk tamu), supaya foto bisa dilihat semua orang.
// - Ditulis oleh pemilik akun Google, atau admin untuk akun siapa pun (Panel admin).
// Tamu tidak punya foto. Batas ukuran di sini harus sama dengan database.rules.json.
export const UID_RE = /^[A-Za-z0-9]{20,40}$/;
const SISI = 192; // px, hasil potong persegi
const MAKS_ASAL_BYTES = 12 * 1024 * 1024; // foto asli yang boleh dipilih
export const MAKS_DATA_CHAR = 40000; // panjang data URL maksimal (Rules)

let db = null;
const cache = new Map(); // uid -> url ("" = tidak punya foto)
const menunggu = new Map(); // uid -> Promise yang sedang berjalan
const pendengar = new Set();

export function initFoto(database) {
  db = database;
}

// Dipanggil tiap kali foto seseorang berubah / baru dimuat: (uid, url) => void
export function pantauFoto(fn) {
  pendengar.add(fn);
}

function kabari(uid, url) {
  for (const fn of pendengar) {
    try {
      fn(uid, url);
    } catch (err) {
      console.error(err);
    }
  }
}

// undefined = belum dimuat, "" = tidak ada foto, selain itu URL gambar
export function urlFoto(uid) {
  return cache.get(uid);
}

export function muatFoto(uid, { segar = false } = {}) {
  if (!db || !UID_RE.test(uid || "")) return Promise.resolve("");
  if (!segar && cache.has(uid)) return Promise.resolve(cache.get(uid));
  if (menunggu.has(uid)) return menunggu.get(uid);
  const p = get(ref(db, `avatars/${uid}`))
    .then((snap) => {
      const data = snap.val()?.data;
      const url = typeof data === "string" ? data : "";
      const beda = cache.get(uid) !== url;
      cache.set(uid, url);
      if (beda) kabari(uid, url);
      return url;
    })
    .catch(() => cache.get(uid) ?? "") // gagal baca: jangan disimpan, boleh dicoba lagi
    .finally(() => menunggu.delete(uid));
  menunggu.set(uid, p);
  return p;
}

// Ganti akun / keluar: buang cache supaya tidak ada sisa dari sesi sebelumnya
export function kosongkanFoto() {
  cache.clear();
  menunggu.clear();
}

export async function simpanFoto(uid, dataUrl, olehUid) {
  if (!db || !UID_RE.test(uid || "")) throw new Error("ID tidak valid.");
  await set(ref(db, `avatars/${uid}`), {
    data: dataUrl,
    at: serverTimestamp(),
    by: olehUid,
  });
  cache.set(uid, dataUrl);
  kabari(uid, dataUrl);
}

export async function hapusFoto(uid) {
  if (!db || !UID_RE.test(uid || "")) throw new Error("ID tidak valid.");
  await remove(ref(db, `avatars/${uid}`));
  cache.set(uid, "");
  kabari(uid, "");
}

async function bacaGambar(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Cadangan untuk browser lama
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Gambar tidak bisa dibaca."));
      };
      img.src = url;
    });
  }
}

// File gambar -> JPEG persegi SISIxSISI (dipotong dari tengah) sebagai data URL
export async function kecilkanFoto(file) {
  if (!file) throw new Error("Tidak ada file.");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Pilih foto berformat JPG, PNG, atau WebP.");
  }
  if (file.size > MAKS_ASAL_BYTES) {
    throw new Error("Foto terlalu besar (maksimal 12 MB).");
  }
  const gambar = await bacaGambar(file);
  const w = gambar.width;
  const h = gambar.height;
  const sisi = Math.min(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = SISI;
  canvas.height = SISI;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; // latar untuk PNG transparan
  g.fillRect(0, 0, SISI, SISI);
  g.imageSmoothingQuality = "high";
  g.drawImage(gambar, (w - sisi) / 2, (h - sisi) / 2, sisi, sisi, 0, 0, SISI, SISI);
  gambar.close?.();

  for (let q = 0.86; q >= 0.4; q -= 0.12) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAKS_DATA_CHAR) return url;
  }
  throw new Error("Foto terlalu detail untuk dikecilkan. Coba foto lain.");
}
