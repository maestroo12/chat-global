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

// Warna avatar stabil per pengguna (diturunkan dari uid/nama)
function warna(kunci) {
  let h = 0;
  for (const c of String(kunci || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h % 360;
}

// Avatar bulat: foto kalau ada, kalau gagal dimuat tetap tampil inisial.
// ukuran: "" (40px) | "sm" | "xl"
export function buatAvatar(nama, kunci, { ukuran = "", foto = "" } = {}) {
  const a = el("span", {
    class: ("avatar " + ukuran).trim(),
    "aria-hidden": "true",
    text: inisial(nama),
  });
  a.style.backgroundColor = `hsl(${warna(kunci || nama)} 42% 36%)`;
  if (foto) {
    const img = el("img", { alt: "", src: foto, referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => img.remove());
    a.append(img);
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
