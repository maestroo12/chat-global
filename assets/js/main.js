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
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

import { firebaseConfig, LIMITS } from "./config.js";
import { formatUkuran, simpan } from "./utils.js";
import { NEWS } from "./news.js";

// ===== INIT =====
const app = initializeApp(firebaseConfig);
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
const loginBtn = document.getElementById("login-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachPreview = document.getElementById("attach-preview");
const sheet = document.getElementById("sheet");
const sheetPreview = document.getElementById("sheet-preview");
const sheetHapusSaya = document.getElementById("sheet-hapus-saya");
const sheetHapusSemua = document.getElementById("sheet-hapus-semua");
const sheetBatal = document.getElementById("sheet-batal");
const sheetReply = document.getElementById("sheet-reply");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const replyPreview = document.getElementById("reply-preview");
const replyPreviewName = document.getElementById("reply-preview-name");
const replyPreviewText = document.getElementById("reply-preview-text");
const replyCancel = document.getElementById("reply-cancel");

// ===== TEMA (terang / gelap) =====
const themeBtn = document.getElementById("theme-btn");
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

  const label = gelap ? "Ganti ke mode terang" : "Ganti ke mode gelap";
  themeBtn.setAttribute("aria-label", label);
  themeBtn.title = label;
}

themeBtn.addEventListener("click", () => {
  const baru =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, baru);
  } catch {}
  terapkanTema(baru);
});

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

const isGoogle = (user) => !!user && !user.isAnonymous;

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

input.maxLength = MAX_TEKS;
simpan.hapus("chatCache"); // cache lama sudah tidak dipakai

// ===== PEMBARUAN ("Yang baru") =====
// Daftar pembaruan ada di news.js
const NEWS_KEY = "chatNewsSeen";
const newsBtn = document.getElementById("news-btn");
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

function perbaruiTitikNews() {
  newsBtn.classList.toggle("has-new", newsTerbaca() !== NEWS[0].id);
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

function bukaNews() {
  renderNews(newsTerbaca() !== NEWS[0].id);
  newsModal.hidden = false;
  try {
    localStorage.setItem(NEWS_KEY, NEWS[0].id);
  } catch {}
  perbaruiTitikNews();
  newsClose.focus();
}

function tutupNews() {
  newsModal.hidden = true;
  newsBtn.focus();
}

newsBtn.addEventListener("click", bukaNews);
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
  return data.uid === currentUser?.uid ? "Kamu" : data.name || "Pengguna";
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
    name.textContent = data.name;

    // Centang hanya untuk pesan dari akun Google (divalidasi oleh Database Rules)
    if (data.verified) {
      const badge = document.createElement("span");
      badge.classList.add("badge");
      badge.title = "Akun Google terverifikasi";
      badge.textContent = "✓";
      name.appendChild(badge);
    }
    bubble.appendChild(name);
  }

  if (data.deleted) {
    const text = document.createElement("span");
    text.classList.add("msg-text");
    text.textContent = isMe
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
  const terakhir = keys[keys.length - 1];
  keys.push(key);
  if (!terakhir || key > terakhir) {
    tambahElemen(key);
  } else {
    keys.sort();
    renderSemua("jaga");
  }
  perbaruiTombolLama();
}

function pantauPerubahan(q) {
  onChildChanged(q, (snap) => {
    pesan.set(snap.key, snap.val());
    perbaruiElemen(snap.key);
    perbaruiKutipanKe(snap.key);
    tampilkanReplyPreview();
  });
}

function mulaiListener() {
  if (listenerAktif) return;
  listenerAktif = true;

  const liveQ = query(chatRef, orderByKey(), limitToLast(HALAMAN));
  onChildAdded(
    liveQ,
    (snap) => terimaBaru(snap.key, snap.val()),
    (err) => console.error("Gagal membaca chat:", err),
  );
  pantauPerubahan(liveQ);
  get(liveQ)
    .then((s) => {
      hasMore = s.size >= HALAMAN;
      perbaruiTombolLama();
    })
    .catch(() => {});

  onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    let count = 0;
    if (data) {
      const now = Date.now();
      Object.values(data).forEach((user) => {
        if (user.lastSeen && now - user.lastSeen < 60000) count++;
      });
    }
    const dot = document.createElement("i");
    dot.classList.add("dot");
    onlineStatus.replaceChildren(dot, `${count} Online`);
  });
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
messagesDiv.addEventListener("scroll", () => {
  if (messagesDiv.scrollTop < 60) muatLama();
});

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
  if (isGoogle(currentUser)) {
    input.disabled = false;
    sendBtn.disabled = sedangKirim;
    return;
  }
  const habis = statusLimit().sisa <= 0;
  input.disabled = habis;
  sendBtn.disabled = habis || sedangKirim;
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

// ===== KIRIM PESAN =====
async function kirimPesan() {
  if (sedangKirim || !currentUser) return;
  const text = input.value.trim();
  const adaFile = !!lampiran && isGoogle(currentUser);
  if (!text && !adaFile) return;

  const targetBalasan = replyTarget;
  if (targetBalasan && !bisaDibalas(targetBalasan)) {
    batalkanReply();
    alert("Pesan tujuan sudah tidak tersedia. Kirim ulang pesanmu.");
    return;
  }

  const google = isGoogle(currentUser);
  const uid = currentUser.uid;
  const name = google
    ? namaGoogle(currentUser)
    : nameInput.value.trim() || "Orang Asing";

  if (!name) {
    alert(
      "Akun Google ini tidak punya nama, jadi tidak bisa dipakai untuk chat.",
    );
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
      } else if (!(await tambahkanLimitTamu(updates))) {
        return; // jatah tamu habis, pesan tidak dikirim
      }

      try {
        await update(ref(db), updates);
        berhasil = true;
      } catch (err) {
        if (percobaan === 1 || google || err.code !== "PERMISSION_DENIED")
          throw err;
      }
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
nameInput.addEventListener("change", () => {
  if (!isGoogle(currentUser)) {
    simpan.tulis("chatName", nameInput.value.trim());
  }
});

// ===== PRESENCE =====
function mulaiPresence(user) {
  clearInterval(heartbeat);
  const userRef = ref(db, `users/${user.uid}`);
  const nama = isGoogle(user)
    ? namaGoogle(user) || "Pengguna Google"
    : nameInput.value.trim() || "Orang Asing";

  update(userRef, { name: nama, online: true, lastSeen: Date.now() });
  heartbeat = setInterval(() => {
    update(userRef, { lastSeen: Date.now() });
  }, 30000);
}

window.addEventListener("beforeunload", () => {
  clearInterval(heartbeat);
  if (currentUser) remove(ref(db, `users/${currentUser.uid}`));
});

// ===== LOGIN / LOGOUT GOOGLE =====
loginBtn.addEventListener("click", async () => {
  try {
    if (isGoogle(currentUser)) {
      await signOut(auth); // otomatis kembali jadi tamu
    } else {
      // Login langsung ke akun Google (bukan menempel ke akun anonim)
      await signInWithPopup(auth, googleProvider);
    }
  } catch (err) {
    console.error("Login gagal:", err);
    if (err.code !== "auth/popup-closed-by-user") {
      alert("Login gagal: " + err.code);
    }
  }
});

// ===== STATUS AUTH =====
onAuthStateChanged(auth, (user) => {
  if (!user) {
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
  nameInput.hidden = google;
  attachBtn.hidden = !google;
  if (!google) {
    nameInput.value = simpan.baca("chatName") || "";
    lampiran = null;
    tampilkanPreview();
  }
  loginBtn.textContent = google ? "Keluar" : "Login Google";

  mulaiListener();
  mulaiPresence(user);
  pantauSisa(user);
  pantauHidden(user);
  renderSemua();
});
