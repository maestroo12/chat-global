import { UID_RE, urlFoto, muatFoto, pantauFoto } from "./foto.js";

// Pembantu kecil untuk membangun elemen di panel Beranda & Profil.
// Semua teks lewat textContent (bukan innerHTML), dan tidak ada atribut style di
// markup, supaya tetap aman dengan CSP.

// el("div", { class: "x", text: "isi", "data-a": "b", onclick: fn }, anak1, [anak2, ...])
export function el(tag, props = {}, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const a of anak.flat()) {
    if (a != null && a !== false && a !== "") e.append(a);
  }
  return e;
}

// "Budi Santoso" -> "BS", "budi" -> "B"
export function inisial(nama) {
  const kata = String(nama || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!kata.length) return "?";
  const depan = Array.from(kata[0])[0];
  const belakang = kata.length > 1 ? Array.from(kata[kata.length - 1])[0] : "";
  return (depan + belakang).toUpperCase();
}

// Warna avatar stabil per pengguna (diturunkan dari uid/nama). Palet redup terpilih
// supaya cocok dengan tema dan tidak ramai.
const WARNA_AVATAR = [
  "hsl(212 38% 34%)",
  "hsl(200 22% 36%)",
  "hsl(150 24% 30%)",
  "hsl(28 42% 38%)",
  "hsl(8 40% 40%)",
  "hsl(42 40% 34%)",
  "hsl(174 28% 30%)",
  "hsl(340 26% 38%)",
];

function warna(kunci) {
  let h = 0;
  for (const c of String(kunci || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return WARNA_AVATAR[h % WARNA_AVATAR.length];
}

// Pasang / ganti / buang foto di dalam avatar. Kalau gagal dimuat tetap tampil inisial.
export function setFoto(avatar, url) {
  avatar.querySelector("img")?.remove();
  avatar.classList.toggle("ada-foto", !!url);
  if (!url) return;
  const img = el("img", { alt: "", src: url, referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.remove());
  avatar.append(img);
}

// Foto seseorang berubah (diganti / dihapus / baru dimuat): perbarui semua avatarnya
// yang sedang tampil, di mana pun (chat, beranda, menu, profil).
pantauFoto((uid, url) => {
  document
    .querySelectorAll(`.avatar[data-uid="${uid}"]`)
    .forEach((a) => {
      // Foto bawaan Google milik sendiri tetap jadi cadangan kalau foto khusus dihapus
      if (!url && a.dataset.cadangan) setFoto(a, a.dataset.cadangan);
      else setFoto(a, url);
    });
});

// Avatar bulat. Foto profil (avatars/{uid}) dimuat otomatis kalau `kunci` berupa uid.
// ukuran: "" (40px) | "sm" | "xl"
// foto: foto cadangan (mis. foto Google milik sendiri), dipakai kalau belum ada foto khusus
// buka: avatar bisa diketuk untuk melihat profil orangnya (hanya lihat)
// verified: false = akun tamu (tamu tidak punya foto, jadi tidak perlu dimuat)
export function buatAvatar(
  nama,
  kunci,
  { ukuran = "", foto = "", buka = false, verified } = {},
) {
  const a = el("span", {
    class: ("avatar " + ukuran).trim(),
    "aria-hidden": "true",
    text: inisial(nama),
  });
  a.style.backgroundColor = warna(kunci || nama);

  const uid = UID_RE.test(kunci || "") ? kunci : "";
  if (uid) a.dataset.uid = uid;
  if (foto) {
    a.dataset.cadangan = foto;
    setFoto(a, foto);
  }
  if (buka && uid) {
    a.classList.add("bisa-buka");
    a.dataset.buka = "1";
    a.dataset.nama = nama || "";
    if (verified != null) a.dataset.verified = verified ? "1" : "0";
    a.removeAttribute("aria-hidden");
    a.setAttribute("role", "button");
    a.setAttribute("aria-label", `Lihat profil ${nama || "pengguna"}`);
    a.title = "Lihat profil";
    a.tabIndex = 0;
  }

  if (uid && verified !== false) {
    // Tampilkan dulu yang ada di cache, lalu muat/segarkan (cache punya masa berlaku
    // singkat, jadi foto baru orang lain ikut terlihat tanpa perlu reload).
    const dalamCache = urlFoto(uid);
    if (dalamCache) setFoto(a, dalamCache);
    muatFoto(uid).then((url) => {
      if (url && a.querySelector("img")?.getAttribute("src") !== url) setFoto(a, url);
    });
  }
  return a;
}

// Foto profil akun Google (kosong untuk tamu)
export function fotoAkun(user) {
  if (!user || user.isAnonymous) return "";
  return (
    user.photoURL || user.providerData?.find((p) => p.photoURL)?.photoURL || ""
  );
}

// Jam kalau hari ini, "Kemarin", selain itu tanggal singkat
export function waktuRingkas(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const sekarang = new Date();
  if (d.toDateString() === sekarang.toDateString()) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  const kemarin = new Date();
  kemarin.setDate(kemarin.getDate() - 1);
  if (d.toDateString() === kemarin.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function tanggalPanjang(nilai) {
  const d = new Date(nilai);
  if (!nilai || isNaN(d)) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
