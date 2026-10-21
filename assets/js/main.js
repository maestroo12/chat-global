import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  get,
  set,
  serverTimestamp,
  onValue,
  onChildAdded,
  onChildChanged,
  query,
  orderByKey,
  orderByChild,
  limitToLast,
  startAt,
  endAt,
  endBefore,
  remove,
  update,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

import { firebaseConfig, LIMITS } from "./config.js";
import { formatUkuran, simpan } from "./utils.js";
import { NEWS } from "./news.js";
import { initAdmin } from "./admin.js";
import { initNav } from "./nav.js";
import { initBeranda } from "./beranda.js";
import { initProfil } from "./profil.js";
import { fotoAkun } from "./ui.js";

// ===== INIT =====
// Di Firebase Hosting (web.app / firebaseapp.com), pakai domain situs sendiri
// sebagai authDomain supaya login redirect tidak diblokir browser HP
// (Safari/Chrome memblokir penyimpanan lintas-domain, hasilnya layar putih).
const hostFirebase = /\.(web\.app|firebaseapp\.com)$/.test(location.hostname);
const app = initializeApp({
  ...firebaseConfig,
  authDomain: hostFirebase ? location.hostname : firebaseConfig.authDomain,
});
const db = getDatabase(app);
const chatRef = ref(db, "chat");
const usersRef = ref(db, "users");
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ===== DOM =====
const messagesDiv = document.getElementById("messages");
const input = document.getElementById("message-input");
const nameInput = document.getElementById("user-name");
const sendBtn = document.getElementById("send-btn");
const onlineStatus = document.getElementById("online-status");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachPreview = document.getElementById("attach-preview");
const sheet = document.getElementById("sheet");
const sheetPreview = document.getElementById("sheet-preview");
const sheetHapusSaya = document.getElementById("sheet-hapus-saya");
const sheetHapusSemua = document.getElementById("sheet-hapus-semua");
const sheetBatal = document.getElementById("sheet-batal");
const sheetReply = document.getElementById("sheet-reply");
const sheetAdminHapus = document.getElementById("sheet-admin-hapus");
const sheetAdminBlokir = document.getElementById("sheet-admin-blokir");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const replyPreview = document.getElementById("reply-preview");
const replyPreviewName = document.getElementById("reply-preview-name");
const replyPreviewText = document.getElementById("reply-preview-text");
const replyCancel = document.getElementById("reply-cancel");

// ===== TEMA (terang / gelap) =====
const themeMeta = document.querySelector('meta[name="theme-color"]');
const THEME_KEY = "chatTheme";
const gelapQuery = window.matchMedia("(prefers-color-scheme: dark)");

function temaTersimpan() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

function terapkanTema(tema) {
  const gelap = tema === "dark";
  document.documentElement.dataset.theme = tema;
  if (themeMeta) themeMeta.content = gelap ? "#0b3f3a" : "#0f766e";

}

function gantiTema() {
  const baru =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, baru);
  } catch { }
  terapkanTema(baru);
}

// Kalau belum pernah memilih, ikuti setelan perangkat (termasuk saat berubah)
gelapQuery.addEventListener("change", (e) => {
  if (!temaTersimpan()) terapkanTema(e.matches ? "dark" : "light");
});

terapkanTema(temaTersimpan() || (gelapQuery.matches ? "dark" : "light"));

// Wadah daftar pesan + tombol "muat pesan lama"
const listDiv = document.createElement("div");
listDiv.id = "list";
const olderBtn = document.createElement("button");
olderBtn.id = "older-btn";
olderBtn.type = "button";
olderBtn.textContent = "Muat pesan lama";
olderBtn.hidden = true;
messagesDiv.replaceChildren(olderBtn, listDiv);

// ===== KONSTANTA =====
const {
  MAX_ANON,
  MAX_ANON_NAME_CHANGES,
  DAY_MS,
  MAX_RIWAYAT,
  HALAMAN,
  MAX_TEKS,
  MAX_IMG_BYTES,
  MAX_FILE_BYTES,
} = LIMITS;

// ===== STATE =====
let currentUser = null;
let listenerAktif = false;
let heartbeat = null;
let stopPantauSisa = null;
let diblokir = false; // akun ini diblokir admin
let stopHidden = null;
let timerLimit = null;
let limitData = null; // { count, start } milik perangkat ini
let serverOffset = 0;
let sedangKirim = false;
let lampiran = null; // file yang siap dikirim
let replyTarget = null; // key pesan yang sedang dibalas

const pesan = new Map(); // key -> data pesan
let keys = []; // urutan key (lama -> baru)
let hiddenSet = new Set(); // pesan yang disembunyikan "untuk saya"
let hasMore = true;
let loadingOlder = false;
let hariTerakhir = null;
let menuTarget = null;
let panelAktif = null; // panel yang sedang dibuka: beranda | chat | profil
const panelApi = {}; // render semua panel, diisi di bagian PANEL
let panelTimer = null;

// Minta Beranda/Profil/menu digambar ulang (digabung supaya tidak berlebihan)
function segarkanPanel() {
  clearTimeout(panelTimer);
  panelTimer = setTimeout(() => panelApi.render?.(), 120);
}

const isGoogle = (user) => !!user && !user.isAnonymous;

// ===== ADMIN (logikanya ada di admin.js) =====
const admin = initAdmin({
  db,
  onDiblokir(status) {
    diblokir = status;
    segarkanKirim();
  },
  onAdminBerubah: adminBerubah,
  onNamaDaftarBerubah: namaDaftarBerubah,
  // Nama tampilan admin berubah: samakan nama di daftar online
  onNamaAdmin() {
    if (!isGoogle(currentUser)) return;
    update(ref(db, `users/${currentUser.uid}`), {
      name: namaTampil(currentUser),
    }).catch(() => {});
  },
  namaDefault: (user) => namaGoogle(user),
});

// Nama akun Google. Kalau profil tidak punya nama, pakai bagian depan email.
function namaGoogle(user) {
  const dariProvider = user.providerData?.find(
    (p) => p.displayName,
  )?.displayName;
  const email =
    user.email || user.providerData?.find((p) => p.email)?.email || "";
  return (user.displayName || dariProvider || email.split("@")[0] || "").slice(
    0,
    40,
  );
}

// Nama yang dipakai di chat untuk akun Google: nama kustom admin kalau ada, kalau tidak nama Google
function namaKustomAkun(user) {
  return (
    (admin.isAdmin(user.uid)
      ? admin.namaTampil()
      : admin.namaPengguna(user.uid)) || null
  );
}

function namaTampil(user) {
  return (namaKustomAkun(user) || namaGoogle(user) || "Pengguna Google").slice(
    0,
    40,
  );
}

input.maxLength = MAX_TEKS;
simpan.hapus("chatCache"); // cache lama sudah tidak dipakai

// ===== PEMBARUAN ("Yang baru") =====
// Daftar pembaruan ada di news.js
const NEWS_KEY = "chatNewsSeen";
const newsModal = document.getElementById("news");
const newsList = document.getElementById("news-list");
const newsClose = document.getElementById("news-close");

function newsTerbaca() {
  try {
    return localStorage.getItem(NEWS_KEY);
  } catch {
    return null;
  }
}

// Titik merah di semua tombol lonceng (header chat & bilah Beranda)
function perbaruiTitikNews() {
  const baru = newsTerbaca() !== NEWS[0].id;
  document
    .querySelectorAll('[data-aksi="news"]')
    .forEach((b) => b.classList.toggle("has-new", baru));
}

function renderNews(adaYangBaru) {
  const frag = document.createDocumentFragment();

  NEWS.forEach((n, i) => {
    const item = document.createElement("section");
    item.className = "news-item";

    const head = document.createElement("div");
    head.className = "news-head";

    const title = document.createElement("h3");
    title.className = "news-title";
    title.textContent = n.title;
    head.appendChild(title);

    if (i === 0 && adaYangBaru) {
      const tag = document.createElement("span");
      tag.className = "news-new";
      tag.textContent = "Baru";
      head.appendChild(tag);
    }

    if (n.date) {
      const date = document.createElement("span");
      date.className = "news-date";
      date.textContent = n.date;
      head.appendChild(date);
    }

    const ul = document.createElement("ul");
    ul.className = "news-points";
    n.points.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      ul.appendChild(li);
    });

    item.append(head, ul);
    frag.appendChild(item);
  });

  newsList.replaceChildren(frag);
  newsList.scrollTop = 0;
}

let pembukaNews = document.querySelector('[data-aksi="news"]'); // tombol yang membuka daftar, untuk mengembalikan fokus

function bukaNews(pembuka = pembukaNews) {
  pembukaNews = pembuka;
  renderNews(newsTerbaca() !== NEWS[0].id);
  newsModal.hidden = false;
  try {
    localStorage.setItem(NEWS_KEY, NEWS[0].id);
  } catch { }
  perbaruiTitikNews();
  newsClose.focus();
}

function tutupNews() {
  newsModal.hidden = true;
  pembukaNews.focus();
}

document
  .querySelectorAll('[data-aksi="news"]')
  .forEach((b) => b.addEventListener("click", () => bukaNews(b)));
newsClose.addEventListener("click", tutupNews);
newsModal.addEventListener("click", (e) => {
  if (e.target.dataset.tutupNews !== undefined) tutupNews();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !newsModal.hidden) tutupNews();
});

perbaruiTitikNews();

// ===== ID PERANGKAT =====
function buatId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

let deviceId = simpan.baca("chatDeviceId");
if (!deviceId) {
  deviceId = buatId();
  simpan.tulis("chatDeviceId", deviceId);
}

// ===== IP (batas ganti nama berlaku lintas browser/perangkat di jaringan yang sama) =====
// Alamat IP publik diambil dari layanan ipify lalu di-hash (SHA-256); yang disimpan di
// database hanya hash-nya. Catatan: ini dilaporkan oleh browser, jadi cukup untuk
// mencegah ganti-ganti browser/perangkat di jaringan yang sama, tapi bukan keamanan
// penuh (butuh server untuk itu).
function normalisasiIp(ip) {
  ip = String(ip).trim().toLowerCase();
  if (!ip.includes(":")) return ip; // IPv4
  const v4 = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/); // ::ffff:1.2.3.4
  if (v4) return v4[1];
  // IPv6: pakai prefix /64, karena 64 bit terakhir (alamat sementara) berganti-ganti
  const [kiri, kanan] = ip.split("::");
  const a = kiri ? kiri.split(":") : [];
  const b = kanan !== undefined && kanan ? kanan.split(":") : [];
  const tengah = kanan === undefined ? [] : Array(8 - a.length - b.length).fill("0");
  const penuh = [...a, ...tengah, ...b].slice(0, 8);
  return "v6:" + penuh.slice(0, 4).map((g) => g.padStart(4, "0")).join(":");
}

async function ambilIpMentah() {
  for (const url of [
    "https://api.ipify.org?format=json", // IPv4 dulu: paling stabil antar browser
    "https://api64.ipify.org?format=json",
  ]) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j?.ip) return j.ip;
    } catch {
      /* coba alamat berikutnya */
    }
  }
  return null;
}

let ipIdPromise = null;
function ambilIpId() {
  if (!ipIdPromise) {
    ipIdPromise = (async () => {
      const ip = await ambilIpMentah();
      if (!ip || !crypto?.subtle) return null;
      const bytes = new TextEncoder().encode("fitchat-ganti-nama:" + normalisasiIp(ip));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, "0")).join("");
    })().then((id) => {
      if (!id) ipIdPromise = null; // gagal: boleh dicoba lagi nanti
      return id;
    });
  }
  return ipIdPromise;
}

// Selisih jam server, supaya hitungan 24 jam tidak bergantung jam HP/laptop
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
  serverOffset = snap.val() || 0;
});

// ===== UTIL =====
function labelHari(ts) {
  const d = new Date(ts);
  const sama = (a, b) => a.toDateString() === b.toDateString();
  const hariIni = new Date();
  if (sama(d, hariIni)) return "Hari ini";
  const kemarin = new Date();
  kemarin.setDate(kemarin.getDate() - 1);
  if (sama(d, kemarin)) return "Kemarin";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dekatBawah() {
  return (
    messagesDiv.scrollHeight -
    messagesDiv.scrollTop -
    messagesDiv.clientHeight <
    160
  );
}

function scrollBawah() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ===== FILE (disimpan di Realtime Database, dimuat saat dibutuhkan) =====
const fileCache = new Map();

async function ambilFile(id) {
  if (fileCache.has(id)) return fileCache.get(id);
  const snap = await get(ref(db, `files/${id}/data`));
  const data = snap.val();
  if (data) fileCache.set(id, data);
  return data;
}

// Gambar baru diunduh saat mendekati layar, supaya hemat kuota
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      muatGambar(en.target);
    });
  },
  { root: messagesDiv, rootMargin: "300px" },
);

async function muatGambar(img) {
  try {
    const data = await ambilFile(img.dataset.fid);
    if (data) {
      img.src = data;
      img.classList.add("loaded");
    } else {
      img.alt = "Gambar tidak tersedia";
    }
  } catch (err) {
    console.error("Gagal memuat gambar:", err);
    img.alt = "Gambar gagal dimuat";
  }
}

async function unduhFile(f) {
  try {
    const data = await ambilFile(f.id);
    if (!data) return alert("File tidak ditemukan.");
    const blob = await (await fetch(data)).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    alert("Gagal mengunduh file: " + (err.code || err.message));
  }
}

function bukaLightbox(src) {
  if (!src) return;
  lightboxImg.src = src;
  lightbox.hidden = false;
}

lightbox.addEventListener("click", () => {
  lightbox.hidden = true;
  lightboxImg.removeAttribute("src");
});

// ===== BALAS PESAN =====
// Pesan yang dikutip tapi di luar riwayat yang dimuat.
// key -> data pesan (undefined = sedang diambil, null = tidak ada)
const kutipanLuar = new Map();

function namaPengirim(data) {
  return data.uid === currentUser?.uid
    ? "Kamu"
    : admin.namaUntuk(data.uid, data.name) || "Pengguna";
}

function ringkasanPesan(data) {
  if (data === undefined) return "Memuat pesan...";
  if (!data) return "Pesan asli tidak ditemukan.";
  if (data.deleted) return "Pesan ini telah dihapus.";

  if (data.text) {
    return data.text.length > 120 ? data.text.slice(0, 120) + "..." : data.text;
  }
  if (data.file) {
    const jenis = data.file.type?.startsWith("image/") ? "Foto" : "File";
    return `${jenis}: ${data.file.name}`;
  }
  return "Pesan tanpa teks.";
}

// Pesan hanya bisa dibalas kalau sudah dimuat, belum dihapus, dan tidak disembunyikan
function bisaDibalas(key) {
  const data = pesan.get(key);
  return !!data && !data.deleted && !hiddenSet.has(key);
}

function tampilkanReplyPreview() {
  if (replyTarget && !bisaDibalas(replyTarget)) replyTarget = null;

  replyPreview.hidden = !replyTarget;
  if (!replyTarget) {
    replyPreviewName.textContent = "";
    replyPreviewText.textContent = "";
    return;
  }

  const data = pesan.get(replyTarget);
  replyPreviewName.textContent = namaPengirim(data);
  replyPreviewText.textContent = ringkasanPesan(data);
}

function mulaiReply(key) {
  if (!currentUser || !bisaDibalas(key)) return;
  replyTarget = key;
  tampilkanReplyPreview();
  input.focus();
}

function batalkanReply() {
  replyTarget = null;
  tampilkanReplyPreview();
}

replyCancel.addEventListener("click", batalkanReply);

sheetReply.addEventListener("click", () => {
  const key = menuTarget;
  tutupMenu();
  if (key) mulaiReply(key);
});

// Ambil sekali dari database untuk pesan yang dikutip tapi tidak ikut dimuat
async function ambilKutipanLuar(key) {
  if (kutipanLuar.has(key)) return;
  kutipanLuar.set(key, undefined);

  try {
    const snap = await get(ref(db, `chat/${key}`));
    kutipanLuar.set(key, snap.val());
  } catch (err) {
    console.error("Gagal memuat pesan kutipan:", err);
    kutipanLuar.set(key, null);
  }
  perbaruiKutipanKe(key);
}

// Render ulang semua pesan yang mengutip pesan ini
function perbaruiKutipanKe(targetKey) {
  for (const [key, data] of pesan) {
    if (data.replyTo === targetKey) perbaruiElemen(key);
  }
}

let highlightTimer = null;
let highlightedMessage = null;

function lompatKePesan(key) {
  if (hiddenSet.has(key)) {
    alert("Pesan ini sudah kamu hapus untuk saya.");
    return;
  }

  const target = listDiv.querySelector(`.msg[data-key="${CSS.escape(key)}"]`);
  if (!target) {
    alert("Pesan asli berada di luar riwayat yang sedang dimuat.");
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "center" });

  clearTimeout(highlightTimer);
  highlightedMessage?.classList.remove("reply-highlight");
  highlightedMessage = target;
  target.classList.add("reply-highlight");

  highlightTimer = setTimeout(() => {
    target.classList.remove("reply-highlight");
    if (highlightedMessage === target) highlightedMessage = null;
  }, 1600);
}

function buatKutipanReply(targetKey) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reply-quote";
  btn.setAttribute("aria-label", "Lihat pesan asli");

  const nama = document.createElement("span");
  nama.className = "reply-quote-name";
  const teks = document.createElement("span");
  teks.className = "reply-quote-text";

  if (hiddenSet.has(targetKey)) {
    nama.textContent = "Pesan tersembunyi";
    teks.textContent = "Kamu menghapus pesan ini untuk saya.";
  } else {
    const dimuat = pesan.has(targetKey);
    const target = dimuat ? pesan.get(targetKey) : kutipanLuar.get(targetKey);
    if (!dimuat && !kutipanLuar.has(targetKey)) ambilKutipanLuar(targetKey);

    nama.textContent = target ? namaPengirim(target) : "Pesan sebelumnya";
    teks.textContent = ringkasanPesan(target);
  }

  btn.append(nama, teks);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    lompatKePesan(targetKey);
  });
  // Enter pada kutipan jangan ikut membuka menu bubble
  btn.addEventListener("keydown", (e) => e.stopPropagation());

  return btn;
}

// ===== RENDER PESAN =====
function buatLampiran(f) {
  if (f.type && f.type.startsWith("image/")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "att-img-btn";
    const img = document.createElement("img");
    img.className = "att-img";
    img.alt = f.name;
    img.dataset.fid = f.id;
    if (f.w && f.h) img.style.aspectRatio = `${f.w} / ${f.h}`;
    btn.appendChild(img);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      bukaLightbox(img.src);
    });
    io.observe(img);
    return btn;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "att-file";

  const ext = document.createElement("span");
  ext.className = "att-ext";
  ext.textContent = (f.name.includes(".") ? f.name.split(".").pop() : "file")
    .slice(0, 4)
    .toUpperCase();

  const info = document.createElement("span");
  info.className = "att-info";
  const nama = document.createElement("span");
  nama.className = "att-name";
  nama.textContent = f.name;
  const ukuran = document.createElement("span");
  ukuran.className = "att-size";
  ukuran.textContent = formatUkuran(f.size || 0);
  info.append(nama, ukuran);

  btn.append(ext, info);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    unduhFile(f);
  });
  return btn;
}

// Status di samping nama: Admin / User / Anon. Teks polos tanpa latar, ikut warna tema.
// Label User/Admin baru ditampilkan setelah daftar admin selesai dibaca, supaya admin
// tidak sempat tampil sebagai "User" lalu berubah sendiri.
function terapkanStatus(el, uid, verified) {
  el.className = "status-badge";
  el.removeAttribute("title");

  if (!verified) {
    el.classList.add("status-anon");
    el.textContent = "Anon";
    el.title = "Pengguna tamu";
    return;
  }
  if (!admin.adminSiap()) {
    el.textContent = "";
    return;
  }
  if (admin.isAdmin(uid)) {
    el.classList.add("status-admin");
    el.textContent = "Admin";
    el.title = "Administrator";
  } else {
    el.classList.add("status-user");
    el.textContent = "User";
    el.title = "Akun Google terverifikasi";
  }
}

// Dipanggil saat daftar admin berubah: cukup perbarui label, tanpa render ulang chat
function perbaruiStatusBadge() {
  listDiv.querySelectorAll(".status-badge[data-uid]").forEach((el) => {
    terapkanStatus(el, el.dataset.uid, el.dataset.verified === "1");
  });
}

// Render ulang semua pesan tanpa menggeser posisi scroll. Dipakai saat nama admin
// berubah, supaya riwayat lama ikut memakai nama terbaru.
function segarkanNama() {
  const bawah = dekatBawah();
  renderSemua("jaga");
  if (bawah) scrollBawah();
}

function buatElemen(key, data) {
  const isMe = data.uid
    ? data.uid === currentUser?.uid
    : !isGoogle(currentUser) && data.name === nameInput.value.trim();

  const msg = document.createElement("div");
  msg.classList.add("msg");
  if (isMe) msg.classList.add("me");
  msg.dataset.key = key;

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.tabIndex = 0;
  if (data.deleted) bubble.classList.add("deleted");

  if (!isMe) {
    const name = document.createElement("span");
    name.classList.add("msg-name");
    // Admin: pakai nama tampilan terbaru, bukan nama yang tersimpan di pesan lama
    name.textContent = admin.namaUntuk(data.uid, data.name);

    // Centang hanya untuk pesan dari akun Google (divalidasi oleh Database Rules)
    if (data.verified) {
      const badge = document.createElement("span");
      badge.classList.add("badge");
      badge.title = "Akun Google terverifikasi";
      badge.textContent = "✓";
      name.appendChild(badge);
    }

    const statusBadge = document.createElement("span");
    statusBadge.dataset.uid = data.uid || "";
    statusBadge.dataset.verified = data.verified ? "1" : "";
    terapkanStatus(statusBadge, data.uid, !!data.verified);
    name.appendChild(statusBadge);

    bubble.appendChild(name);
  }

  if (data.deleted) {
    const text = document.createElement("span");
    text.classList.add("msg-text");
    text.textContent = data.deletedByAdmin
      ? "Pesan ini dihapus oleh admin"
      : isMe
        ? "Kamu menghapus pesan ini"
        : "Pesan ini telah dihapus";
    bubble.appendChild(text);
  } else {
    if (data.replyTo) bubble.appendChild(buatKutipanReply(data.replyTo));
    if (data.file) bubble.appendChild(buatLampiran(data.file));

    if (data.text) {
      const text = document.createElement("span");
      text.classList.add("msg-text");
      text.textContent = data.text;
      bubble.appendChild(text);
    }
  }

  const time = document.createElement("small");
  time.classList.add("msg-time");
  if (data.timestamp) {
    time.textContent = new Date(data.timestamp).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  // Centang status kirim/baca hanya untuk pesan sendiri yang belum dihapus
  if (isMe && !data.deleted) time.appendChild(buatCentang(key));
  bubble.appendChild(time);

  // Ketuk pesan untuk membuka menu (diabaikan kalau sedang memilih teks)
  bubble.addEventListener("click", () => {
    if (String(window.getSelection()).length > 0) return;
    bukaMenu(key);
  });
  bubble.addEventListener("keydown", (e) => {
    if (e.key === "Enter") bukaMenu(key);
  });

  msg.appendChild(bubble);
  return msg;
}

function buatPemisahHari(label) {
  const el = document.createElement("div");
  el.className = "day-sep";
  const span = document.createElement("span");
  span.textContent = label;
  el.appendChild(span);
  return el;
}

// Render ulang semua pesan yang sudah dimuat
function renderSemua(posisi = "bawah") {
  const tinggiLama = messagesDiv.scrollHeight;
  const atasLama = messagesDiv.scrollTop;

  const frag = document.createDocumentFragment();
  let hari = null;
  for (const k of keys) {
    if (hiddenSet.has(k)) continue;
    const d = pesan.get(k);
    const label = labelHari(d.timestamp);
    if (label !== hari) {
      frag.appendChild(buatPemisahHari(label));
      hari = label;
    }
    frag.appendChild(buatElemen(k, d));
  }
  hariTerakhir = hari;
  listDiv.replaceChildren(frag);
  tampilkanReplyPreview();

  if (posisi === "jaga") {
    messagesDiv.scrollTop = messagesDiv.scrollHeight - tinggiLama + atasLama;
  } else {
    scrollBawah();
  }
}

// Tambah satu pesan baru di paling bawah (tanpa render ulang semuanya)
function tambahElemen(key) {
  if (hiddenSet.has(key)) return;
  const d = pesan.get(key);
  const tempel = dekatBawah() || d.uid === currentUser?.uid;

  const label = labelHari(d.timestamp);
  if (label !== hariTerakhir) {
    listDiv.appendChild(buatPemisahHari(label));
    hariTerakhir = label;
  }
  listDiv.appendChild(buatElemen(key, d));
  if (tempel) scrollBawah();
}

function perbaruiElemen(key) {
  if (hiddenSet.has(key)) return;
  const lama = listDiv.querySelector(`.msg[data-key="${CSS.escape(key)}"]`);
  if (lama) lama.replaceWith(buatElemen(key, pesan.get(key)));
}

function perbaruiTombolLama() {
  olderBtn.hidden = !(hasMore && keys.length > 0 && keys.length < MAX_RIWAYAT);
  olderBtn.disabled = loadingOlder;
  olderBtn.textContent = loadingOlder ? "Memuat..." : "Muat pesan lama";
}

// ===== LISTENER PESAN (jalan setelah auth siap, karena Rules butuh login) =====
function terimaBaru(key, data) {
  if (pesan.has(key)) {
    pesan.set(key, data);
    return;
  }
  pesan.set(key, data);
  if (data?.uid && data.uid !== currentUser?.uid && key > balasLainMaks) {
    balasLainMaks = key;
    perbaruiCentang();
  }
  const terakhir = keys[keys.length - 1];
  keys.push(key);
  if (!terakhir || key > terakhir) {
    tambahElemen(key);
  } else {
    keys.sort();
    renderSemua("jaga");
  }
  perbaruiTombolLama();
  jadwalTandaiBaca();
  segarkanPanel();
}

// ===== CENTANG (terkirim / sampai / dibaca) =====
// ✓   = belum ada pengguna lain yang online
// ✓✓  = ada minimal 1 pengguna lain yang online
// ✓✓ biru = sudah dibaca pengguna lain
// "Dibaca" dicatat per akun sebagai pesan terakhir yang sudah dilihat (reads/{uid}),
// bukan per pesan, jadi ringan: pesan dianggap dibaca kalau key-nya <= catatan orang lain.
const readsRef = ref(db, "reads");
const ONLINE_MS = 90000; // dianggap online kalau lastSeen kurang dari ini
let dataUsers = {}; // salinan terakhir dari users/ (dipakai juga untuk hitung online)
let lainOnline = 0; // jumlah pengguna LAIN yang sedang online
let bacaMaks = ""; // key pesan terbaru yang sudah dibaca pengguna lain
let bacaSaya = ""; // key pesan terbaru yang sudah kita baca (untuk hitungan belum dibaca)
let balasLainMaks = ""; // key pesan terbaru yang DIKIRIM pengguna lain (pasti sudah baca pesan sebelumnya)
let tandaiTerakhir = ""; // key terakhir yang sudah kita catat sebagai dibaca
let bacaDitolak = false; // rules belum mengizinkan: jangan terus mencoba
let tandaiTimer = null;

function statusCentang(key) {
  // Dibaca kalau ada catatan baca ATAU orang lain sudah mengirim pesan setelahnya
  // (catatan reads/{uid} bisa tertinggal, mis. karena refresh/tab ditutup)
  const batas = bacaMaks > balasLainMaks ? bacaMaks : balasLainMaks;
  if (batas && key <= batas) return "read";
  return lainOnline > 0 ? "delivered" : "sent";
}

function terapkanCentang(el, key) {
  const st = statusCentang(key);
  el.classList.remove("sent", "delivered", "read");
  el.classList.add(st);
  el.classList.toggle("double", st !== "sent");
  const label = {
    sent: "Terkirim",
    delivered: "Sampai (ada pengguna online)",
    read: "Dibaca",
  }[st];
  el.title = label;
  el.setAttribute("aria-label", label);
}

function buatCentang(key) {
  const NS = "http://www.w3.org/2000/svg";
  const el = document.createElement("span");
  el.classList.add("ticks");
  el.setAttribute("role", "img");
  el.setAttribute("data-key", key);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 18 11");
  svg.setAttribute("aria-hidden", "true");
  const garis = [
    ["tick-1", "M1 5.8 4.6 9.4 11.2 1.6"],
    ["tick-2", "M6 5.8 9.6 9.4 16.2 1.6"],
  ];
  for (const [kelas, d] of garis) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", kelas);
    svg.appendChild(p);
  }
  el.appendChild(svg);
  terapkanCentang(el, key);
  return el;
}

function perbaruiCentang() {
  listDiv.querySelectorAll(".ticks[data-key]").forEach((el) => {
    terapkanCentang(el, el.getAttribute("data-key"));
  });
}

// Hitung pengguna online dari salinan users/ (juga dipanggil berkala, karena
// lastSeen yang basi tidak memicu snapshot baru)
function hitungOnline() {
  const now = Date.now();
  let total = 0;
  let lain = 0;
  for (const [uid, u] of Object.entries(dataUsers || {})) {
    if (u?.lastSeen && now - u.lastSeen < ONLINE_MS) {
      total++;
      if (uid !== currentUser?.uid) lain++;
    }
  }
  const dot = document.createElement("i");
  dot.classList.add("dot");
  onlineStatus.replaceChildren(dot, `${total} Online`);

  if (lain !== lainOnline) {
    lainOnline = lain;
    perbaruiCentang();
  }
  segarkanPanel();
}

// Catat bahwa kita sudah membaca sampai pesan terbaru: hanya saat tab terlihat dan
// posisi scroll ada di bawah (benar-benar melihat pesan terbaru). Tidak wajib fokus,
// supaya dua jendela yang dibuka berdampingan sama-sama bisa mencatat.
function tandaiDibaca() {
  if (!currentUser || diblokir || bacaDitolak) return;
  if (document.visibilityState !== "visible") return;
  if (panelAktif !== "chat") return; // chat sedang tidak dibuka: belum dibaca
  if (!dekatBawah()) return;

  const k = keys[keys.length - 1];
  if (!k || k <= tandaiTerakhir) return;
  tandaiTerakhir = k;

  set(ref(db, `reads/${currentUser.uid}`), {
    key: k,
    at: serverTimestamp(),
  }).then(
    () => {
      if (k > bacaSaya) bacaSaya = k;
      segarkanPanel();
    },
    (err) => {
      tandaiTerakhir = "";
      if (err?.code === "PERMISSION_DENIED") bacaDitolak = true;
      console.warn("Gagal mencatat status baca:", err.code || err.message);
    },
  );
}

function jadwalTandaiBaca() {
  clearTimeout(tandaiTimer);
  tandaiTimer = setTimeout(tandaiDibaca, 500);
}

document.addEventListener("visibilitychange", jadwalTandaiBaca);
window.addEventListener("focus", jadwalTandaiBaca);
messagesDiv.addEventListener("scroll", jadwalTandaiBaca, { passive: true });

// Semua pemantau chat dikumpulkan di sini supaya bisa dihentikan & dipasang ulang
// saat akun berganti (Firebase memutus listener yang izin bacanya hilang saat logout).
let stopsChat = [];

function hentikanListener() {
  stopsChat.forEach((f) => f());
  stopsChat = [];
  listenerAktif = false;
}

// Kosongkan riwayat di layar supaya dimuat ulang dari awal untuk akun yang baru
function resetRiwayat() {
  pesan.clear();
  kutipanLuar.clear();
  keys = [];
  hasMore = true;
  loadingOlder = false;
  hariTerakhir = null;
  dataUsers = {};
  lainOnline = 0;
  bacaMaks = "";
  bacaSaya = "";
  balasLainMaks = "";
  tandaiTerakhir = "";
  bacaDitolak = false;
  listDiv.replaceChildren();
  perbaruiTombolLama();
}

function pantauPerubahan(q) {
  stopsChat.push(
    onChildChanged(q, (snap) => {
      pesan.set(snap.key, snap.val());
      perbaruiElemen(snap.key);
      perbaruiKutipanKe(snap.key);
      tampilkanReplyPreview();
      segarkanPanel();
    }),
  );
}

function mulaiListener() {
  if (listenerAktif) return;
  listenerAktif = true;

  const liveQ = query(chatRef, orderByKey(), limitToLast(HALAMAN));
  stopsChat.push(
    onChildAdded(
      liveQ,
      (snap) => terimaBaru(snap.key, snap.val()),
      (err) => console.error("Gagal membaca chat:", err),
    ),
  );
  pantauPerubahan(liveQ);
  get(liveQ)
    .then((s) => {
      hasMore = s.size >= HALAMAN;
      console.info(
        `Riwayat: ${s.size} pesan terbaru dimuat, ada pesan lama: ${hasMore}`,
      );
      perbaruiTombolLama();
      jadwalTandaiBaca();
    })
    .catch((err) =>
      console.warn("Gagal mengecek riwayat:", err.code || err.message),
    );

  // Admin menghapus pesan terlama secara permanen: buang dari tampilan semua orang
  stopsChat.push(
    onValue(
      ref(db, "purge"),
      (snap) => {
        const upTo = snap.val()?.upTo;
        if (typeof upTo !== "string") return;
        if (!keys.some((k) => k <= upTo)) return;
        for (const k of keys) if (k <= upTo) pesan.delete(k);
        keys = keys.filter((k) => k > upTo);
        segarkanNama();
        perbaruiTombolLama();
      },
      (err) =>
        console.warn(
          "Gagal memantau penghapusan riwayat:",
          err.code || err.message,
        ),
    ),
  );

  stopsChat.push(
    onValue(usersRef, (snapshot) => {
      dataUsers = snapshot.val() || {};
      hitungOnline();
    }),
  );
  const timerOnline = setInterval(hitungOnline, 15000);
  stopsChat.push(() => clearInterval(timerOnline));

  // Catatan "sudah dibaca" milik pengguna lain (hanya yang aktif 3 hari terakhir)
  const bacaQ = query(
    readsRef,
    orderByChild("at"),
    startAt(Date.now() - 3 * 86400000),
  );
  stopsChat.push(
    onValue(
      bacaQ,
      (snap) => {
        let maks = "";
        snap.forEach((c) => {
          if (c.key === currentUser?.uid) {
            const sendiri = c.val()?.key;
            if (typeof sendiri === "string" && sendiri > bacaSaya) {
              bacaSaya = sendiri;
              segarkanPanel();
            }
            return;
          }
          const k = c.val()?.key;
          if (typeof k === "string" && k > maks) maks = k;
        });
        if (maks !== bacaMaks) {
          bacaMaks = maks;
          perbaruiCentang();
        }
      },
      (err) =>
        console.warn("Gagal membaca status baca:", err.code || err.message),
    ),
  );
}

// ===== RIWAYAT (muat pesan lama, sampai MAX_RIWAYAT pesan) =====
async function muatLama() {
  if (loadingOlder || !hasMore || keys.length === 0) return;
  if (keys.length >= MAX_RIWAYAT) {
    hasMore = false;
    perbaruiTombolLama();
    return;
  }

  loadingOlder = true;
  perbaruiTombolLama();

  try {
    const batas = Math.min(HALAMAN, MAX_RIWAYAT - keys.length);
    const snap = await get(
      query(chatRef, orderByKey(), endBefore(keys[0]), limitToLast(batas)),
    );

    const baru = [];
    snap.forEach((c) => {
      baru.push([c.key, c.val()]);
    });

    if (baru.length < batas || keys.length + baru.length >= MAX_RIWAYAT)
      hasMore = false;

    if (baru.length) {
      baru.forEach(([k, v]) => pesan.set(k, v));
      const kunciBaru = baru.map((b) => b[0]);
      keys = [...kunciBaru, ...keys];
      // agar pesan lama yang dihapus pengirimnya ikut berubah secara langsung
      pantauPerubahan(
        query(
          chatRef,
          orderByKey(),
          startAt(kunciBaru[0]),
          endAt(kunciBaru[kunciBaru.length - 1]),
        ),
      );
      renderSemua("jaga");
    }
  } catch (err) {
    console.error("Gagal memuat pesan lama:", err);
    alert("Gagal memuat pesan lama: " + (err.code || err.message));
  } finally {
    loadingOlder = false;
    perbaruiTombolLama();
  }
}

olderBtn.addEventListener("click", muatLama);
// Pesan lama sengaja TIDAK dimuat otomatis saat scroll: tiap HALAMAN pesan harus
// menekan tombol "Muat pesan lama" dulu.

// ===== MENU PESAN (balas & hapus) =====
function bukaMenu(key) {
  const data = pesan.get(key);
  if (!data || !currentUser) return;

  menuTarget = key;
  const milikku = data.uid === currentUser.uid;

  sheetPreview.textContent = data.deleted
    ? "Pesan yang sudah dihapus"
    : data.text
      ? data.text.length > 90
        ? data.text.slice(0, 90) + "..."
        : data.text
      : data.file
        ? "Lampiran: " + data.file.name
        : "";

  sheetReply.hidden = !!data.deleted;
  sheetHapusSemua.hidden = !(milikku && !data.deleted);

  // Opsi moderasi: hanya tampil untuk admin, pada pesan orang lain
  const bisaModerasi = admin.aktif() && !milikku;
  sheetAdminHapus.hidden = !(bisaModerasi && !data.deleted);
  sheetAdminBlokir.hidden = !(
    bisaModerasi &&
    data.uid &&
    !admin.sudahDiblokir(data.uid)
  );

  sheet.hidden = false;

  (sheetReply.hidden ? sheetHapusSaya : sheetReply).focus();
}

function tutupMenu() {
  sheet.hidden = true;
  menuTarget = null;
}

sheet.addEventListener("click", (e) => {
  if (e.target.dataset.tutup !== undefined) tutupMenu();
});
sheetBatal.addEventListener("click", tutupMenu);

// Hapus untuk saya: pesan hanya disembunyikan di akun ini, orang lain tetap melihatnya
sheetHapusSaya.addEventListener("click", async () => {
  const key = menuTarget;
  if (!key || !currentUser) return;
  tutupMenu();
  try {
    await set(ref(db, `hidden/${currentUser.uid}/${key}`), true);
  } catch (err) {
    alert("Gagal menghapus: " + (err.code || err.message));
  }
});

// Hapus untuk semua: isi pesan dihapus, tersisa keterangan "Pesan ini telah dihapus"
sheetHapusSemua.addEventListener("click", async () => {
  const key = menuTarget;
  const data = key && pesan.get(key);
  if (!data || !currentUser || data.uid !== currentUser.uid) return;
  tutupMenu();

  const updates = {
    [`chat/${key}/deleted`]: true,
    [`chat/${key}/text`]: null,
    [`chat/${key}/file`]: null,
  };
  if (data.file?.id) {
    updates[`files/${data.file.id}`] = null;
    fileCache.delete(data.file.id);
  }

  try {
    await update(ref(db), updates);
  } catch (err) {
    alert("Gagal menghapus untuk semua: " + (err.code || err.message));
  }
});

// Admin: hapus pesan orang lain untuk semua
sheetAdminHapus.addEventListener("click", () => {
  const key = menuTarget;
  const data = key && pesan.get(key);
  if (!data) return;
  tutupMenu();
  if (data.file?.id) fileCache.delete(data.file.id);
  admin.hapusPesan(key, data);
});

// Admin: blokir pengirim pesan
sheetAdminBlokir.addEventListener("click", () => {
  const data = menuTarget && pesan.get(menuTarget);
  if (!data?.uid) return;
  tutupMenu();
  admin.blokir(data.uid, data.name);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!lightbox.hidden) lightbox.click();
  else if (!sheet.hidden) tutupMenu();
});

function pantauHidden(user) {
  if (stopHidden) stopHidden();
  hiddenSet = new Set();
  stopHidden = onValue(
    ref(db, `hidden/${user.uid}`),
    (snap) => {
      hiddenSet = new Set(Object.keys(snap.val() || {}));
      renderSemua("jaga");
      segarkanPanel();
    },
    (err) => console.error("Gagal membaca daftar pesan tersembunyi:", err),
  );
}

// ===== LAMPIRAN (hanya akun Google) =====
function bacaDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Gagal membaca file."));
    r.readAsDataURL(blob);
  });
}

function muatImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar tidak bisa dibuka."));
    };
    img.src = url;
  });
}

async function kompresGambar(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bmp = await muatImg(file);
  }
  const lebarAsli = bmp.naturalWidth || bmp.width;
  const tinggiAsli = bmp.naturalHeight || bmp.height;

  let sisiMax = 1280;
  let kualitas = 0.8;
  let blob = null;
  let w = 0;
  let h = 0;

  for (let i = 0; i < 8; i++) {
    const skala = Math.min(1, sisiMax / Math.max(lebarAsli, tinggiAsli));
    w = Math.max(1, Math.round(lebarAsli * skala));
    h = Math.max(1, Math.round(tinggiAsli * skala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);

    blob = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", kualitas),
    );
    if (blob && blob.size <= MAX_IMG_BYTES) break;

    if (kualitas > 0.55) kualitas -= 0.1;
    else sisiMax = Math.round(sisiMax * 0.8);
  }

  if (bmp.close) bmp.close();
  if (!blob || blob.size > MAX_IMG_BYTES)
    throw new Error("Gambar terlalu besar untuk dikirim.");

  return {
    dataUrl: await bacaDataUrl(blob),
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    type: "image/jpeg",
    size: blob.size,
    w,
    h,
  };
}

async function siapkanLampiran(file) {
  if (file.type.startsWith("image/")) return kompresGambar(file);

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File terlalu besar (${formatUkuran(file.size)}). Maksimal ${formatUkuran(MAX_FILE_BYTES)}.`,
    );
  }
  return {
    dataUrl: await bacaDataUrl(file),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
}

function tampilkanPreview() {
  attachPreview.replaceChildren();
  if (!lampiran) {
    attachPreview.hidden = true;
    return;
  }

  if (lampiran.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = lampiran.dataUrl;
    img.alt = "";
    attachPreview.appendChild(img);
  }

  const info = document.createElement("span");
  info.className = "ap-info";
  const nama = document.createElement("span");
  nama.className = "ap-name";
  nama.textContent = lampiran.name;
  const ukuran = document.createElement("span");
  ukuran.className = "ap-size";
  ukuran.textContent = formatUkuran(lampiran.size);
  info.append(nama, ukuran);

  const tutup = document.createElement("button");
  tutup.type = "button";
  tutup.className = "ap-close";
  tutup.setAttribute("aria-label", "Batalkan lampiran");
  tutup.textContent = "×";
  tutup.addEventListener("click", () => {
    lampiran = null;
    tampilkanPreview();
  });

  attachPreview.append(info, tutup);
  attachPreview.hidden = false;
}

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  attachPreview.hidden = false;
  attachPreview.textContent = "Memproses file...";
  try {
    lampiran = await siapkanLampiran(file);
  } catch (err) {
    lampiran = null;
    alert(err.message);
  }
  tampilkanPreview();
});

// ===== LIMIT TAMU (per perangkat, 24 jam) =====
let devicePromise = null;
let deviceUid = null;
let nameChangeData = null; // { count, start } untuk perubahan nama
let stopPantauNameChange = null;

async function daftarkanPerangkat(user) {
  // Hubungkan akun anonim ini ke ID perangkat. Hanya bisa ditulis sekali per akun anonim.
  const mapRef = ref(db, `anonDevice/${user.uid}`);
  const snap = await get(mapRef);
  if (snap.exists()) {
    deviceId = snap.val();
    simpan.tulis("chatDeviceId", deviceId);
    return deviceId;
  }
  await set(mapRef, deviceId);
  return deviceId;
}

// Satu proses pendaftaran per akun anonim, dipakai bersama oleh pemantau limit dan pengiriman
function pastikanPerangkat(user) {
  if (devicePromise && deviceUid === user.uid) return devicePromise;
  deviceUid = user.uid;
  devicePromise = daftarkanPerangkat(user).catch((err) => {
    devicePromise = null;
    deviceUid = null;
    throw err;
  });
  return devicePromise;
}

function statusLimit() {
  const now = Date.now() + serverOffset;
  if (!limitData || now - limitData.start >= DAY_MS) {
    return { sisa: MAX_ANON };
  }
  return {
    sisa: MAX_ANON - limitData.count,
    bukaLagi: limitData.start + DAY_MS - now,
  };
}

function aturTombolKirim() {
  attachBtn.disabled = diblokir;
  if (diblokir) {
    input.disabled = true;
    sendBtn.disabled = true;
    input.placeholder = "Akunmu diblokir admin.";
    return;
  }
  if (isGoogle(currentUser)) {
    input.disabled = false;
    sendBtn.disabled = sedangKirim;
    return;
  }
  const habis = statusLimit().sisa <= 0;
  input.disabled = habis;
  sendBtn.disabled = habis || sedangKirim;
}

// Dipanggil saat status blokir berubah: pulihkan placeholder yang benar
function segarkanKirim() {
  if (isGoogle(currentUser)) {
    input.placeholder = "Ketik pesan";
    aturTombolKirim();
  } else {
    terapkanLimit();
  }
}

function terapkanLimit() {
  if (isGoogle(currentUser)) return;
  const st = statusLimit();

  if (st.sisa <= 0) {
    const jam = Math.max(1, Math.ceil(st.bukaLagi / 3600000));
    input.placeholder = `Batas tamu habis. Coba lagi ${jam} jam lagi, atau login Google.`;
  } else {
    input.placeholder = `Ketik pesan (sisa ${st.sisa} dari ${MAX_ANON})`;
  }
  aturTombolKirim();
  segarkanPanel();
}

function pantauSisa(user) {
  if (stopPantauSisa) stopPantauSisa();
  stopPantauSisa = null;
  clearInterval(timerLimit);
  limitData = null;

  if (isGoogle(user)) {
    input.placeholder = "Ketik pesan";
    aturTombolKirim();
    return;
  }

  pastikanPerangkat(user)
    .then((dev) => {
      if (currentUser?.uid !== user.uid) return; // akun sudah berganti
      stopPantauSisa = onValue(ref(db, `deviceLimit/${dev}`), (snap) => {
        limitData = snap.val();
        terapkanLimit();
      });
      timerLimit = setInterval(terapkanLimit, 60000);
    })
    .catch((err) => {
      console.error("Gagal menyiapkan limit tamu:", err);
      input.placeholder = "Gagal menyiapkan chat: " + (err.code || err.message);
    });
}

// Menambahkan penghitung limit ke dalam penulisan pesan. Mengembalikan false kalau jatah habis.
async function tambahkanLimitTamu(updates) {
  const dev = await pastikanPerangkat(currentUser);
  const path = `deviceLimit/${dev}`;
  const snap = await get(ref(db, path));
  const lim = snap.val();
  const now = Date.now() + serverOffset;

  if (!lim || now - lim.start >= DAY_MS) {
    updates[path] = { count: 1, start: serverTimestamp() };
  } else if (lim.count >= MAX_ANON) {
    limitData = lim;
    terapkanLimit();
    return false;
  } else {
    updates[path] = { count: lim.count + 1, start: lim.start };
  }
  return true;
}

// ===== LIMIT PERUBAHAN NAMA TAMU (per IP, 24 jam) =====
// Kunci limit = hash IP (lintas browser/perangkat di jaringan yang sama). Kalau IP
// tidak bisa didapat (diblokir ad-blocker, dsb.), jatuh ke ID perangkat seperti dulu.
let kunciNama = null; // { path, ip }
let kunciNamaPromise = null;
let kunciNamaUid = null;

async function siapkanKunciNama(user) {
  const ipId = await ambilIpId();
  if (ipId) {
    try {
      await set(ref(db, `anonIp/${user.uid}`), ipId);
      return { path: `ipNameLimit/${ipId}`, ip: true };
    } catch (err) {
      console.warn("Gagal mendaftarkan IP, pakai ID perangkat:", err.code || err.message);
    }
  }
  const dev = await pastikanPerangkat(user);
  return { path: `deviceNameLimit/${dev}`, ip: false };
}

function pastikanKunciNama(user) {
  if (kunciNamaPromise && kunciNamaUid === user.uid) return kunciNamaPromise;
  kunciNamaUid = user.uid;
  kunciNamaPromise = siapkanKunciNama(user)
    .then((k) => {
      if (kunciNamaUid === user.uid) kunciNama = k;
      return k;
    })
    .catch((err) => {
      kunciNamaPromise = null;
      kunciNamaUid = null;
      throw err;
    });
  return kunciNamaPromise;
}

// Nama terakhir yang sudah dipakai: dari database kalau pakai IP (jadi sama di semua
// browser), kalau tidak dari penyimpanan lokal.
function namaDasar() {
  return kunciNama?.ip ? nameChangeData?.last || "" : namaTerkirim;
}

function statusLimitNama() {
  const now = Date.now() + serverOffset;
  if (!nameChangeData || now - nameChangeData.start >= DAY_MS) {
    return { sisa: MAX_ANON_NAME_CHANGES };
  }
  return {
    sisa: MAX_ANON_NAME_CHANGES - nameChangeData.count,
    bukaLagi: nameChangeData.start + DAY_MS - now,
  };
}

function pantauNamaChange(user) {
  if (stopPantauNameChange) stopPantauNameChange();
  stopPantauNameChange = null;
  nameChangeData = null;
  kunciNama = null;

  if (isGoogle(user)) return;

  pastikanKunciNama(user)
    .then((k) => {
      if (currentUser?.uid !== user.uid) return;
      stopPantauNameChange = onValue(ref(db, k.path), (snap) => {
        nameChangeData = snap.val();
        terapkanLimitNama();
      });
    })
    .catch((err) => {
      console.error("Gagal menyiapkan limit nama:", err);
    });
}

function terapkanLimitNama() {
  const info = document.getElementById("name-limit-info");
  if (!info) return;
  if (isGoogle(currentUser)) return; // teks untuk akun Google diatur aturBarisNama()

  const st = statusLimitNama();
  const habis = st.sisa <= 0;
  info.classList.toggle("habis", habis);
  if (habis) {
    const jam = Math.max(1, Math.ceil(st.bukaLagi / 3600000));
    info.textContent = `Batas ganti nama habis. Coba lagi ${jam} jam lagi.`;
  } else {
    info.textContent = `Sisa ganti nama: ${st.sisa} dari ${MAX_ANON_NAME_CHANGES} hari ini`;
  }
  segarkanPanel();
}

// Menambahkan hitungan ganti nama ke penulisan pesan. Mengembalikan false kalau jatah
// habis. Nama yang sama dengan nama terakhir tidak dihitung.
async function tambahkanLimitNamaChange(updates, name) {
  const k = await pastikanKunciNama(currentUser);
  const snap = await get(ref(db, k.path));
  const lim = snap.val();
  const now = Date.now() + serverOffset;

  if (k.ip) {
    if (!lim) {
      // Pertama kali dari IP ini: gratis, hanya mencatat nama terakhir
      updates[k.path] = { count: 0, start: serverTimestamp(), last: name };
      return true;
    }
    if (lim.last === name) return true; // nama sama, tidak dihitung
    if (now - lim.start >= DAY_MS) {
      updates[k.path] = { count: 1, start: serverTimestamp(), last: name };
      return true;
    }
    if (lim.count >= MAX_ANON_NAME_CHANGES) {
      nameChangeData = lim;
      terapkanLimitNama();
      return false;
    }
    updates[k.path] = { count: lim.count + 1, start: lim.start, last: name };
    return true;
  }

  // Cadangan (IP tidak tersedia): per perangkat, nama terakhir dari penyimpanan lokal
  if (!namaTerkirim || name === namaTerkirim) return true;
  if (!lim || now - lim.start >= DAY_MS) {
    updates[k.path] = { count: 1, start: serverTimestamp() };
  } else if (lim.count >= MAX_ANON_NAME_CHANGES) {
    nameChangeData = lim;
    terapkanLimitNama();
    return false;
  } else {
    updates[k.path] = { count: lim.count + 1, start: lim.start };
  }
  return true;
}

// ===== KIRIM PESAN =====
async function kirimPesan() {
  if (sedangKirim || !currentUser || diblokir) return;
  const text = input.value.trim();
  const adaFile = !!lampiran && isGoogle(currentUser);
  if (!text && !adaFile) return;

  const targetBalasan = replyTarget;
  if (targetBalasan && !bisaDibalas(targetBalasan)) {
    batalkanReply();
    alert("Pesan tujuan sudah tidak tersedia. Kirim ulang pesanmu.");
    return;
  }

  // Admin: pastikan nama tampilan sudah terbaca sebelum dipakai
  if (isGoogle(currentUser) && admin.aktif() && !admin.namaSiap()) {
    sedangKirim = true;
    aturTombolKirim();
    try {
      await admin.pastikanNama();
    } finally {
      sedangKirim = false;
      aturTombolKirim();
    }
    if (!currentUser) return;
  }

  const google = isGoogle(currentUser);
  const uid = currentUser.uid;
  const name = google
    ? namaKustomAkun(currentUser) || namaGoogle(currentUser)
    : nameInput.value.trim() || "Orang Asing";

  if (!name) {
    alert(
      "Akun Google ini tidak punya nama, jadi tidak bisa dipakai untuk chat.",
    );
    return;
  }

  // Ganti nama baru dihitung kalau pesan dengan nama baru ini benar-benar terkirim,
  // bukan saat kolom nama diubah. Pesan pertama (belum ada nama sebelumnya) gratis.
  const dasar = namaDasar();
  const gantiNama = !google && !!dasar && name !== dasar;
  if (gantiNama && statusLimitNama().sisa <= 0) {
    tolakGantiNama();
    return;
  }

  sedangKirim = true;
  aturTombolKirim();

  try {
    const key = push(chatRef).key;
    let berhasil = false;

    // Maksimal 2 percobaan: kalau limit berubah di tab lain, hitung ulang lalu coba lagi
    for (let percobaan = 0; percobaan < 2 && !berhasil; percobaan++) {
      const data = {
        name,
        uid,
        timestamp: Math.round(Date.now() + serverOffset),
      };
      if (text) data.text = text;
      if (targetBalasan) data.replyTo = targetBalasan;

      const updates = { [`chat/${key}`]: data };

      if (google) {
        data.verified = true;
        if (adaFile) {
          const fid = push(ref(db, "files")).key;
          updates[`files/${fid}`] = {
            uid,
            name: lampiran.name,
            type: lampiran.type,
            size: lampiran.size,
            data: lampiran.dataUrl,
          };
          data.file = {
            id: fid,
            name: lampiran.name,
            type: lampiran.type,
            size: lampiran.size,
          };
          if (lampiran.w) {
            data.file.w = lampiran.w;
            data.file.h = lampiran.h;
          }
        }
      } else {
        if (!(await tambahkanLimitTamu(updates))) {
          return; // jatah tamu habis, pesan tidak dikirim
        }
        // Dikirim dalam satu update yang sama dengan pesannya: kalau pesan gagal,
        // hitungan ganti nama juga tidak bertambah.
        if (!(await tambahkanLimitNamaChange(updates, name))) {
          tolakGantiNama();
          return;
        }
      }

      try {
        await update(ref(db), updates);
        berhasil = true;
      } catch (err) {
        if (percobaan === 1 || google || err.code !== "PERMISSION_DENIED")
          throw err;
      }
    }

    if (!google) {
      namaTerkirim = name;
      simpan.tulis("chatName", name);
      // Samakan nama di daftar online (panel admin), tidak masalah kalau gagal
      update(ref(db, `users/${uid}`), { name }).catch(() => {});
    }

    // Akun biasa (tamu & Google non-admin yang punya nama tampilan): simpan nama
    // terbaru supaya SELURUH riwayat pesannya ikut memakai nama ini. Tidak masalah
    // kalau gagal, pesan sudah terkirim.
    if (!google || (!admin.isAdmin(uid) && admin.namaPengguna(uid))) {
      set(ref(db, `userNames/${uid}`), {
        name,
        at: serverTimestamp(),
      }).catch(() => {});
    }

    input.value = "";
    lampiran = null;
    if (replyTarget === targetBalasan) batalkanReply();
    tampilkanPreview();
    input.focus();
  } catch (err) {
    console.error("Pesan gagal terkirim:", err);
    alert("Pesan gagal terkirim: " + (err.code || err.message));
  } finally {
    sedangKirim = false;
    aturTombolKirim();
  }
}

sendBtn.addEventListener("click", kirimPesan);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") kirimPesan();
});

// ===== NAMA (hanya untuk tamu) =====
// Nama terakhir yang benar-benar dipakai di pesan terkirim. Mengubah kolom nama saja
// tidak memakai jatah ganti nama; jatah baru terpakai saat pesannya terkirim.
let namaTerkirim = "";

function tolakGantiNama() {
  const dasar = namaDasar() || namaTerkirim;
  alert(
    `Batas ganti nama habis untuk hari ini. Nama dikembalikan ke "${dasar}". Kirim lagi untuk memakai nama itu.`,
  );
  nameInput.value = dasar;
  terapkanLimitNama();
}

nameInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  input.focus(); // Enter di kolom nama hanya pindah ke kolom pesan
});
nameInput.addEventListener("input", segarkanPanel); // sapaan di Beranda ikut nama tamu

// Baris nama: tamu = nama bebas (ada batas ganti nama), Google non-admin = nama
// tampilan pilihan sendiri (kosong = pakai nama Google), admin = lewat Panel admin.
function aturBarisNama() {
  if (!currentUser) return;
  const wrapper = nameInput.closest(".name-input-wrapper");
  const info = document.getElementById("name-limit-info");

  if (!isGoogle(currentUser)) {
    wrapper.hidden = false;
    nameInput.placeholder = "Nama kamu";
    terapkanLimitNama();
    return;
  }
  if (admin.aktif()) {
    wrapper.hidden = true;
    return;
  }
  wrapper.hidden = false;
  nameInput.placeholder = namaGoogle(currentUser) || "Nama tampilan";
  info.classList.remove("habis");
  info.textContent = "Nama tampilan. Kosongkan untuk pakai nama Google.";
  sinkronNamaInput();
}

function sinkronNamaInput() {
  if (!currentUser || !isGoogle(currentUser) || admin.aktif()) return;
  if (document.activeElement === nameInput) return;
  nameInput.value = admin.namaPengguna(currentUser.uid) || "";
}

async function simpanNamaPengguna() {
  if (!currentUser || !isGoogle(currentUser) || admin.aktif()) return;
  const nama = nameInput.value.trim().slice(0, 24);
  const r = ref(db, `userNames/${currentUser.uid}`);
  try {
    if (nama) await set(r, { name: nama, at: serverTimestamp() });
    else await remove(r);
  } catch (err) {
    alert("Gagal menyimpan nama: " + (err.code || err.message));
    sinkronNamaInput();
  }
}

// Dipanggil saat daftar admin / daftar nama berubah
function adminBerubah() {
  segarkanNama();
  aturBarisNama();
  segarkanPanel();
}

function namaDaftarBerubah() {
  segarkanNama();
  sinkronNamaInput();
  segarkanPanel();
  if (isGoogle(currentUser)) {
    update(ref(db, `users/${currentUser.uid}`), {
      name: namaTampil(currentUser),
    }).catch(() => {});
  }
}

// Kalau jatah sudah habis, tolak perubahan nama sejak awal (tanpa memakai jatah)
nameInput.addEventListener("change", () => {
  if (isGoogle(currentUser)) {
    simpanNamaPengguna();
    return;
  }
  const baru = nameInput.value.trim() || "Orang Asing";
  const dasar = namaDasar();
  if (dasar && baru !== dasar && statusLimitNama().sisa <= 0) {
    tolakGantiNama();
  }
});

// ===== PRESENCE =====
// Catat "saya online" ke users/{uid}. Yang ditulis SELALU record lengkap (nama, online,
// lastSeen), bukan hanya lastSeen: kalau record sempat terhapus (mis. tab/halaman lama
// yang ditutup atau di-refresh menghapusnya terlambat), langkah berikutnya otomatis
// membuatnya lagi, tidak terjebak "offline" sampai halaman dimuat ulang.
let catatPresence = () => {};

function mulaiPresence(user) {
  clearInterval(heartbeat);
  const userRef = ref(db, `users/${user.uid}`);

  catatPresence = () => {
    const nama = (
      isGoogle(user)
        ? namaTampil(user)
        : nameInput.value.trim() || "Orang Asing"
    ).slice(0, 40);
    update(userRef, { name: nama, online: true, lastSeen: Date.now() }).catch(
      () => {},
    );
  };

  catatPresence();
  heartbeat = setInterval(catatPresence, 20000);
}

// Tab kembali terlihat / jendela kembali aktif: langsung tandai online lagi
// (timer di tab latar belakang bisa diperlambat browser)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") catatPresence();
});
window.addEventListener("focus", () => catatPresence());

window.addEventListener("beforeunload", () => {
  clearInterval(heartbeat);
  if (currentUser) remove(ref(db, `users/${currentUser.uid}`));
});

// ===== LOGIN / LOGOUT GOOGLE =====
// HP: pakai redirect (popup sering jadi layar putih). Desktop: popup.
const isHP =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
// Browser dalam aplikasi (IG, FB, Line, WebView) diblokir Google untuk login
const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp|Telegram/i.test(
  navigator.userAgent,
);

// Hasil login redirect (setelah balik dari halaman Google). Kalau gagal, tampilkan errornya.
getRedirectResult(auth).catch((err) => {
  console.error("Login redirect gagal:", err);
  alert("Login gagal: " + (err.code || err.message));
});

async function masukKeluar() {
  try {
    if (isGoogle(currentUser)) {
      await signOut(auth); // otomatis kembali jadi tamu
      return;
    }
    if (isInAppBrowser) {
      alert(
        "Login Google tidak bisa dari browser dalam aplikasi. Buka link ini lewat Chrome atau Safari.",
      );
      return;
    }
    // Login langsung ke akun Google (bukan menempel ke akun anonim)
    if (isHP) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        // Popup diblokir / tidak didukung: coba redirect
        if (
          err.code === "auth/popup-blocked" ||
          err.code === "auth/operation-not-supported-in-this-environment"
        ) {
          await signInWithRedirect(auth, googleProvider);
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    console.error("Login gagal:", err);
    if (
      err.code !== "auth/popup-closed-by-user" &&
      err.code !== "auth/cancelled-popup-request"
    ) {
      alert("Login gagal: " + (err.code || err.message));
    }
  }
}

// ===== PANEL: Beranda, Chat, Profil =====
// Data untuk panel diambil dari state di atas. Panelnya sendiri ada di
// nav.js (perpindahan), beranda.js, dan profil.js.
function namaSaya() {
  if (!currentUser) return "";
  if (isGoogle(currentUser)) return namaTampil(currentUser);
  return nameInput.value.trim() || namaTerkirim || "Orang Asing";
}

function statusAkun() {
  if (!currentUser) return "";
  if (!isGoogle(currentUser)) return "anon";
  if (!admin.adminSiap()) return "memuat"; // jangan tampil "User" dulu lalu berubah
  return admin.isAdmin(currentUser.uid) ? "admin" : "user";
}

function daftarOnline() {
  const now = Date.now();
  const hasil = [];
  for (const [uid, u] of Object.entries(dataUsers || {})) {
    if (!u?.lastSeen || now - u.lastSeen >= ONLINE_MS) continue;
    hasil.push({
      uid,
      nama: admin.namaUntuk(uid, u.name) || u.name || "Tanpa nama",
      saya: uid === currentUser?.uid,
      admin: admin.isAdmin(uid),
    });
  }
  // Kamu paling atas, sisanya urut nama
  return hasil.sort(
    (a, b) => b.saya - a.saya || a.nama.localeCompare(b.nama, "id"),
  );
}

// Pesan terbaru yang masih tampil di layarmu (tanpa yang dihapus/disembunyikan)
function pesanTerbaru(jumlah) {
  const hasil = [];
  for (let i = keys.length - 1; i >= 0 && hasil.length < jumlah; i--) {
    const key = keys[i];
    const d = pesan.get(key);
    if (!d || d.deleted || hiddenSet.has(key)) continue;
    const saya = d.uid === currentUser?.uid;
    hasil.push({
      key,
      uid: d.uid,
      nama: namaPengirim(d),
      teks: ringkasanPesan(d),
      ts: d.timestamp,
      baru: !saya && !!bacaSaya && key > bacaSaya,
    });
  }
  return hasil;
}

// Pesan orang lain yang masuk setelah terakhir kali kamu membuka chat
function belumBaca() {
  if (!currentUser || !bacaSaya) return 0;
  let n = 0;
  for (let i = keys.length - 1; i >= 0 && keys[i] > bacaSaya; i--) {
    const d = pesan.get(keys[i]);
    if (d && !d.deleted && d.uid !== currentUser.uid && !hiddenSet.has(keys[i]))
      n++;
  }
  return n;
}

function infoLimit() {
  return {
    pesan: { sisa: Math.max(0, statusLimit().sisa), maks: MAX_ANON },
    nama: {
      sisa: Math.max(0, statusLimitNama().sisa),
      maks: MAX_ANON_NAME_CHANGES,
    },
  };
}

// Nama tampilan akun Google biasa (kosong = pakai nama Google). Admin lewat Panel admin.
async function simpanNamaTampilan(nama) {
  if (!currentUser || !isGoogle(currentUser) || admin.aktif()) return;
  const r = ref(db, `userNames/${currentUser.uid}`);
  if (nama) await set(r, { name: nama.slice(0, 24), at: serverTimestamp() });
  else await remove(r);
}

const nav = initNav({
  onPindah(id) {
    panelAktif = id;
    if (id === "chat") {
      // Ada pesan belum dibaca: turun ke bawah supaya langsung tercatat terbaca
      if (belumBaca() > 0) scrollBawah();
      jadwalTandaiBaca();
    }
    panelApi.render?.();
  },
});

const beranda = initBeranda({
  user: () => currentUser,
  isGoogle: () => isGoogle(currentUser),
  nama: namaSaya,
  online: daftarOnline,
  pesanTerbaru,
  belumBaca,
  limit: infoLimit,
  news: () => NEWS[0],
  bukaNews,
  login: masukKeluar,
});

const profil = initProfil({
  db,
  user: () => currentUser,
  nama: namaSaya,
  namaGoogle: () => (currentUser ? namaGoogle(currentUser) : ""),
  namaKustom: () =>
    currentUser ? admin.namaPengguna(currentUser.uid) || "" : "",
  status: statusAkun,
  limit: infoLimit,
  simpanNama: simpanNamaTampilan,
  gantiTema,
  login: masukKeluar,
  bukaAdmin: () => document.getElementById("admin-btn").click(),
});

panelApi.render = () => {
  if (!currentUser) return;
  nav.setBadge("chat", panelAktif === "chat" ? 0 : belumBaca());
  nav.setAkun({
    nama: namaSaya(),
    uid: currentUser.uid,
    foto: fotoAkun(currentUser),
    status: statusAkun(),
  });
  beranda.segarkan();
  profil.segarkan();
};

// ===== STATUS AUTH =====
let uidChat = null; // uid yang sedang dipakai untuk listener chat
onAuthStateChanged(auth, (user) => {
  if (!user) {
    admin.setUser(null);
    signInAnonymously(auth).catch((err) => {
      console.error("Anonymous gagal:", err);
      input.placeholder =
        "Gagal masuk sebagai Orang Asing: " + (err.code || err.message);
    });
    return;
  }

  currentUser = user;
  batalkanReply();

  const google = isGoogle(user);

  // Akun Google: nama otomatis dari Google, kolom nama disembunyikan, bisa kirim file
  aturBarisNama();
  attachBtn.hidden = !google;
  if (!google) {
    namaTerkirim = simpan.baca("chatName") || "";
    nameInput.value = namaTerkirim;
    lampiran = null;
    tampilkanPreview();
  }

  // Akun berganti (login/logout): pasang ulang listener & muat riwayat dari awal,
  // karena listener lama diputus Firebase saat izin bacanya hilang.
  if (uidChat !== user.uid) {
    hentikanListener();
    resetRiwayat();
    uidChat = user.uid;
    profil.setUser(user);
  }
  mulaiListener();
  mulaiPresence(user);
  admin.setUser(user);
  pantauSisa(user);
  pantauNamaChange(user);
  pantauHidden(user);
  renderSemua();
  segarkanPanel();
});
