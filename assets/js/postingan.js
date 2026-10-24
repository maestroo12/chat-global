import {
  ref,
  push,
  set,
  get,
  update,
  query,
  orderByKey,
  limitToLast,
  onChildAdded,
  onChildRemoved,
  onValue,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import { LIMITS } from "./config.js";
import { el, buatAvatar, waktuRelatif } from "./ui.js";
import { simpan } from "./utils.js";

const { MAX_POST, MAX_KOMENTAR, POST_HALAMAN, JEDA_POST_MS, JEDA_KOMENTAR_MS } =
  LIMITS;

const KUNCI_DILIHAT = "feedSeen"; // key postingan terbaru yang sudah dilihat (untuk titik/angka di menu)

// Panel Postingan: feed realtime dengan like dan komentar.
//
// Data (Realtime Database):
//   posts/{postId}                      { uid, name, text, timestamp }
//   postLikes/{postId}/{uid}            true
//   postComments/{postId}/{commentId}   { uid, name, text, timestamp }
//
// Hanya akun Google yang bisa memposting dan berkomentar. Semua pengguna (termasuk
// tamu) bisa melihat dan memberi like. Semua teks dipasang lewat textContent.
//
// `ctx` dari main.js: db, user, isGoogle, nama, namaUntuk, isAdmin, adminSiap,
// diblokir, dibisukan, sekarang, aktif, setBadge, login.
export function initPostingan(ctx) {
  const db = ctx.db;
  const $ = (id) => document.getElementById(id);

  const body = $("postingan-body");
  const daftar = $("post-daftar");
  const status = $("post-status");
  const kabarEl = $("post-kabar");
  const lebihBtn = $("post-lebih");
  const tulisForm = $("post-tulis-form");
  const tulisTamu = $("post-tulis-tamu");
  const tulisInput = $("post-input");
  const tulisHitung = $("post-hitung");
  const tulisKirim = $("post-kirim");
  const tulisKabar = $("post-tulis-kabar");

  tulisInput.maxLength = MAX_POST;
  $("post-login").addEventListener("click", () => ctx.login());

  // ===== STATE =====
  const kartu = new Map(); // postId -> kartu
  let urutan = []; // postId, terbaru di atas
  const hapusLokal = new Set(); // postId yang sedang kita hapus sendiri
  let batas = POST_HALAMAN;
  let stopPosts = [];
  let uidAktif = null;
  let gen = 0; // naik tiap pasang ulang listener, supaya callback lama diabaikan
  let siap = false;
  let galat = "";
  let memuatLagi = false;
  let terakhirPost = 0;
  let terakhirKomentar = 0;

  // ===== PEMBANTU =====
  const NS = "http://www.w3.org/2000/svg";
  function ikon(d, ukuran = 18) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", ukuran);
    s.setAttribute("height", ukuran);
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.append(p);
    return s;
  }
  const IKON_HATI =
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z";
  const IKON_KOMEN = "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.2-4.4A8 8 0 1 1 21 12z";
  const IKON_HAPUS =
    "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6";

  const saya = () => ctx.user()?.uid || "";
  const sayaAdmin = () =>
    !!saya() && ctx.isGoogle() && ctx.adminSiap() && ctx.isAdmin(saya());

  // Rapikan teks: baris baru seragam, spasi di ujung dibuang. Komentar satu baris.
  function bersihkan(teks, maks, banyakBaris) {
    let t = String(teks || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    t = banyakBaris ? t.replace(/\n{3,}/g, "\n\n") : t.replace(/\s*\n\s*/g, " ");
    return t.slice(0, maks);
  }

  function pesanGalat(err) {
    if (err?.code === "PERMISSION_DENIED" || /permission/i.test(err?.message || "")) {
      return "Ditolak server. Kalau ini baru dipasang, deploy dulu database.rules.json terbaru.";
    }
    return "Gagal: " + (err?.code || err?.message || "tidak diketahui");
  }

  // Alasan akun ini tidak boleh posting/komentar ("" = boleh)
  function larangan() {
    if (ctx.diblokir()) return "Akunmu diblokir admin.";
    if (ctx.dibisukan()) return "Admin membatasi pengiriman pesan untuk akunmu.";
    return "";
  }

  let kabarTimer = null;
  function kabar(teks, elemen = kabarEl) {
    elemen.textContent = teks || "";
    elemen.classList.toggle("galat", !!teks);
    if (elemen === kabarEl) {
      clearTimeout(kabarTimer);
      if (teks) kabarTimer = setTimeout(() => kabar(""), 6000);
    }
  }

  // ===== NAMA, STATUS, WAKTU (dipakai postingan dan komentar) =====
  // x: { uid, data, namaEl, adminEl, kamuEl, waktuEl, hapusEl, bolehHapus() }
  function segarkanIdentitas(x) {
    const nama = ctx.namaUntuk(x.data.uid, x.data.name) || x.data.name || "Pengguna";
    if (x.namaEl.firstChild?.nodeValue !== nama) x.namaEl.firstChild.nodeValue = nama;
    const admin = ctx.adminSiap() && ctx.isAdmin(x.data.uid);
    x.adminEl.textContent = admin ? "Admin" : "";
    x.kamuEl.hidden = x.data.uid !== saya();
    x.hapusEl.hidden = !x.bolehHapus();
    const waktu = waktuRelatif(x.data.timestamp, ctx.sekarang());
    if (x.waktuEl.textContent !== waktu) x.waktuEl.textContent = waktu;
  }

  // Baris identitas: nama + centang + label Admin + (Kamu) + waktu
  function buatIdentitas(data, bolehHapus, onHapus, labelHapus) {
    const namaEl = el("span", { class: "post-nama" });
    namaEl.append(document.createTextNode(""));
    namaEl.append(
      el("span", { class: "badge", title: "Akun Google terverifikasi", text: "✓" }),
    );
    const adminEl = el("span", { class: "status-badge status-admin", title: "Administrator" });
    const kamuEl = el("span", { class: "tag", text: "Kamu", hidden: true });
    const waktuEl = el("span", { class: "post-waktu" });
    waktuEl.title = new Date(data.timestamp).toLocaleString("id-ID");
    const hapusEl = el(
      "button",
      {
        type: "button",
        class: "post-hapus",
        "aria-label": labelHapus,
        title: labelHapus,
        hidden: true,
        onclick: onHapus,
      },
      ikon(IKON_HAPUS, 16),
    );
    return { data, namaEl, adminEl, kamuEl, waktuEl, hapusEl, bolehHapus };
  }

  // ===== KARTU POSTINGAN =====
  function buatKartu(id, data) {
    const k = {
      id,
      data,
      suka: new Set(),
      komentar: new Map(), // commentId -> { data, li, x }
      terbuka: false,
      stops: [],
    };

    const bolehHapus = () => data.uid === saya() || sayaAdmin();
    k.x = buatIdentitas(data, bolehHapus, () => hapusPost(k), "Hapus postingan");

    const avatar = buatAvatar(ctx.namaUntuk(data.uid, data.name) || data.name, data.uid, {
      buka: true,
      verified: true,
    });

    const kepala = el(
      "header",
      { class: "post-kepala" },
      avatar,
      el(
        "div",
        { class: "post-meta" },
        el("div", { class: "post-baris" }, k.x.namaEl, k.x.adminEl, k.x.kamuEl),
        k.x.waktuEl,
      ),
      k.x.hapusEl,
    );

    const teks = el("p", { class: "post-teks", text: data.text });

    // Aksi: suka + komentar
    k.sukaIkon = ikon(IKON_HATI, 20);
    k.sukaJumlah = el("span", { class: "aksi-jumlah", text: "0" });
    k.sukaBtn = el(
      "button",
      {
        type: "button",
        class: "aksi-btn",
        "aria-pressed": "false",
        onclick: () => toggleSuka(k),
      },
      k.sukaIkon,
      el("span", { class: "aksi-label", text: "Suka" }),
      k.sukaJumlah,
    );
    k.komenJumlah = el("span", { class: "aksi-jumlah", text: "0" });
    k.komenBtn = el(
      "button",
      {
        type: "button",
        class: "aksi-btn",
        "aria-expanded": "false",
        onclick: () => bukaKomentar(k),
      },
      ikon(IKON_KOMEN, 20),
      el("span", { class: "aksi-label", text: "Komentar" }),
      k.komenJumlah,
    );
    const aksi = el("div", { class: "post-aksi" }, k.sukaBtn, k.komenBtn);

    // Bagian komentar (dibangun saat dibuka pertama kali)
    k.komenDaftar = el("ul", { class: "komentar-daftar" });
    k.komenKabar = el("p", { class: "kabar", role: "status" });
    k.komenKosong = el("p", { class: "kosong", text: "Belum ada komentar." });
    const bagianKomen = el("section", { class: "post-komentar", hidden: true });
    bagianKomen.append(k.komenKosong, k.komenDaftar);

    if (ctx.isGoogle()) {
      k.komenInput = el("input", {
        type: "text",
        class: "komentar-input",
        maxlength: MAX_KOMENTAR,
        placeholder: "Tulis komentar",
        autocomplete: "off",
        enterkeyhint: "send",
        "aria-label": "Tulis komentar",
      });
      k.komenKirim = el("button", {
        type: "submit",
        class: "btn utama kecil",
        text: "Kirim",
      });
      const form = el(
        "form",
        {
          class: "komentar-form",
          novalidate: true,
          onsubmit: (e) => {
            e.preventDefault();
            kirimKomentar(k);
          },
        },
        k.komenInput,
        k.komenKirim,
      );
      bagianKomen.append(form);
    } else {
      bagianKomen.append(
        el(
          "div",
          { class: "komentar-tamu" },
          el("span", { text: "Login Google untuk menulis komentar." }),
          el("button", {
            type: "button",
            class: "link-btn",
            text: "Login",
            onclick: () => ctx.login(),
          }),
        ),
      );
    }
    bagianKomen.append(k.komenKabar);
    k.bagianKomen = bagianKomen;

    k.root = el(
      "article",
      { class: "card post-kartu", "data-post": id },
      kepala,
      teks,
      aksi,
      bagianKomen,
    );

    segarkanIdentitas(k.x);
    perbaruiSuka(k);

    // Listener realtime untuk suka dan komentar milik postingan ini
    const gagal = () => {};
    const sukaRef = ref(db, `postLikes/${id}`);
    const komenRef = ref(db, `postComments/${id}`);
    k.stops.push(
      onChildAdded(
        sukaRef,
        (s) => {
          k.suka.add(s.key);
          perbaruiSuka(k);
        },
        gagal,
      ),
      onChildRemoved(
        sukaRef,
        (s) => {
          k.suka.delete(s.key);
          perbaruiSuka(k);
        },
        gagal,
      ),
      onChildAdded(
        query(komenRef, orderByKey()),
        (s) => tambahKomentar(k, s.key, s.val()),
        gagal,
      ),
      onChildRemoved(komenRef, (s) => buangKomentar(k, s.key), gagal),
    );
    return k;
  }

  function perbaruiSuka(k) {
    const aktif = k.suka.has(saya());
    const sebelum = k.sukaBtn.classList.contains("aktif");
    k.sukaBtn.classList.toggle("aktif", aktif);
    k.sukaBtn.setAttribute("aria-pressed", aktif ? "true" : "false");
    k.sukaJumlah.textContent = String(k.suka.size);
    k.sukaBtn.title = aktif ? "Batalkan suka" : "Suka";
    if (aktif && !sebelum) {
      k.sukaIkon.classList.remove("pop");
      void k.sukaIkon.getBoundingClientRect(); // ulang animasi
      k.sukaIkon.classList.add("pop");
    }
  }

  async function toggleSuka(k) {
    const uid = saya();
    if (!uid) return;
    if (ctx.diblokir()) return kabar("Akunmu diblokir admin.");
    const r = ref(db, `postLikes/${k.id}/${uid}`);
    try {
      // Tampilan langsung berubah (Firebase memberi kabar lokal dulu), dan otomatis
      // kembali kalau server menolak.
      if (k.suka.has(uid)) await set(r, null);
      else await set(r, true);
    } catch (err) {
      kabar(pesanGalat(err));
    }
  }

  // ===== KOMENTAR =====
  function perbaruiJumlahKomentar(k) {
    const n = k.komentar.size;
    k.komenJumlah.textContent = String(n);
    k.komenKosong.hidden = n > 0;
  }

  function bukaKomentar(k, paksa) {
    k.terbuka = paksa ?? !k.terbuka;
    k.bagianKomen.hidden = !k.terbuka;
    k.komenBtn.setAttribute("aria-expanded", k.terbuka ? "true" : "false");
    if (!k.terbuka) return;
    // Bangun elemen komentar yang belum ada (ditunda sampai dibuka, supaya feed ringan)
    for (const [cid, c] of k.komentar) {
      if (!c.li) pasangKomentar(k, cid, c);
    }
    k.komenInput?.focus({ preventScroll: true });
  }

  function tambahKomentar(k, cid, data) {
    if (!data || typeof data.text !== "string" || k.komentar.has(cid)) return;
    const c = { data, li: null };
    k.komentar.set(cid, c);
    if (k.terbuka) pasangKomentar(k, cid, c);
    perbaruiJumlahKomentar(k);
  }

  function pasangKomentar(k, cid, c) {
    const data = c.data;
    const bolehHapus = () =>
      data.uid === saya() || k.data.uid === saya() || sayaAdmin();
    c.x = buatIdentitas(data, bolehHapus, () => hapusKomentar(k, cid), "Hapus komentar");
    c.li = el(
      "li",
      { class: "komentar-item", "data-komentar": cid },
      buatAvatar(ctx.namaUntuk(data.uid, data.name) || data.name, data.uid, {
        ukuran: "sm",
        buka: true,
        verified: true,
      }),
      el(
        "div",
        { class: "komentar-isi" },
        el(
          "div",
          { class: "komentar-atas" },
          el("div", { class: "post-baris" }, c.x.namaEl, c.x.adminEl, c.x.kamuEl),
          c.x.waktuEl,
          c.x.hapusEl,
        ),
        el("p", { class: "komentar-teks", text: data.text }),
      ),
    );
    segarkanIdentitas(c.x);
    k.komenDaftar.append(c.li);
  }

  function buangKomentar(k, cid) {
    const c = k.komentar.get(cid);
    if (!c) return;
    c.li?.remove();
    k.komentar.delete(cid);
    perbaruiJumlahKomentar(k);
  }

  async function kirimKomentar(k) {
    const u = ctx.user();
    if (!u || !ctx.isGoogle()) return;
    const alasan = larangan();
    if (alasan) return kabar(alasan, k.komenKabar);
    const nilai = k.komenInput.value;
    const teks = bersihkan(nilai, MAX_KOMENTAR, false);
    if (!teks) return;
    if (Date.now() - terakhirKomentar < JEDA_KOMENTAR_MS) {
      return kabar("Pelan-pelan, tunggu sebentar sebelum berkomentar lagi.", k.komenKabar);
    }
    terakhirKomentar = Date.now();
    kabar("", k.komenKabar);
    k.komenInput.value = "";
    k.komenKirim.disabled = true;
    try {
      const cid = push(ref(db, `postComments/${k.id}`)).key;
      await set(ref(db, `postComments/${k.id}/${cid}`), {
        uid: u.uid,
        name: ctx.nama().slice(0, 40),
        text: teks,
        timestamp: ctx.sekarang(),
      });
    } catch (err) {
      terakhirKomentar = 0;
      if (!k.komenInput.value) k.komenInput.value = nilai; // kembalikan tulisannya
      kabar(pesanGalat(err), k.komenKabar);
    } finally {
      k.komenKirim.disabled = false;
    }
  }

  async function hapusKomentar(k, cid) {
    try {
      await set(ref(db, `postComments/${k.id}/${cid}`), null);
    } catch (err) {
      kabar(pesanGalat(err), k.komenKabar);
    }
  }

  // ===== DAFTAR POSTINGAN =====
  function tambah(id, data) {
    if (!data || typeof data.text !== "string" || typeof data.uid !== "string") return;
    const ada = kartu.get(id);
    if (ada) {
      ada.data = data;
      return;
    }
    const k = buatKartu(id, data);
    kartu.set(id, k);
    // Urutan: key lebih besar = lebih baru = lebih atas
    const i = urutan.findIndex((x) => x < id);
    if (i === -1) {
      urutan.push(id);
      daftar.append(k.root);
    } else {
      daftar.insertBefore(k.root, kartu.get(urutan[i]).root);
      urutan.splice(i, 0, id);
    }
    renderStatus();
    hitungBadge();
  }

  function buang(id) {
    const k = kartu.get(id);
    if (!k) return;
    for (const stop of k.stops) stop();
    k.root.remove();
    kartu.delete(id);
    urutan = urutan.filter((x) => x !== id);
    hapusLokal.delete(id);
    renderStatus();
    hitungBadge();
  }

  // Listener memakai jendela "N terbaru", jadi saat ada postingan baru yang terlama
  // ikut "keluar jendela" dan memicu kejadian hapus. Pastikan benar-benar sudah
  // terhapus di server sebelum kartunya dibuang.
  function cekTerhapus(id) {
    if (hapusLokal.has(id)) return buang(id);
    get(ref(db, `posts/${id}`))
      .then((s) => {
        if (!s.exists()) buang(id);
      })
      .catch(() => {});
  }

  async function hapusPost(k) {
    if (!confirm("Hapus postingan ini beserta suka dan komentarnya?")) return;
    hapusLokal.add(k.id);
    try {
      await update(ref(db), {
        [`posts/${k.id}`]: null,
        [`postLikes/${k.id}`]: null,
        [`postComments/${k.id}`]: null,
      });
    } catch (err) {
      hapusLokal.delete(k.id);
      kabar(pesanGalat(err));
    }
  }

  function renderStatus() {
    const kosong = urutan.length === 0;
    status.hidden = !(galat || (kosong && !galat));
    status.classList.toggle("galat", !!galat);
    if (galat) status.textContent = galat;
    else if (!siap) status.textContent = "Memuat postingan...";
    else status.textContent = "Belum ada postingan. Jadilah yang pertama!";
    // Tombol muat lebih banyak: jendela penuh berarti mungkin masih ada yang lebih lama
    lebihBtn.hidden = !(siap && !galat && urutan.length >= batas);
    lebihBtn.disabled = memuatLagi;
    lebihBtn.textContent = memuatLagi ? "Memuat..." : "Muat postingan lama";
  }

  function pasangPosts() {
    for (const stop of stopPosts) stop();
    stopPosts = [];
    const saatIni = ++gen;
    const q = query(ref(db, "posts"), orderByKey(), limitToLast(batas));
    const gagal = (err) => {
      if (saatIni !== gen) return;
      galat =
        err?.code === "PERMISSION_DENIED" || /permission/i.test(err?.message || "")
          ? "Postingan belum bisa dibuka. Deploy dulu database.rules.json terbaru (firebase deploy --only database)."
          : "Gagal memuat postingan: " + (err?.code || err?.message || "tidak diketahui");
      memuatLagi = false;
      renderStatus();
    };
    stopPosts.push(
      onChildAdded(
        q,
        (s) => {
          if (saatIni === gen) tambah(s.key, s.val());
        },
        gagal,
      ),
      onChildRemoved(
        q,
        (s) => {
          if (saatIni === gen) cekTerhapus(s.key);
        },
        gagal,
      ),
      // Kejadian "value" pertama datang SETELAH semua child_added awal: tandanya muatan selesai
      onValue(
        q,
        () => {
          if (saatIni !== gen) return;
          siap = true;
          galat = "";
          memuatLagi = false;
          renderStatus();
          // Pengguna baru (belum ada penanda): postingan yang sudah ada bukan "baru"
          if (ctx.aktif() || !simpan.baca(KUNCI_DILIHAT)) tandaiDilihat();
          hitungBadge();
        },
        gagal,
        { onlyOnce: true },
      ),
    );
  }

  lebihBtn.addEventListener("click", () => {
    if (memuatLagi) return;
    memuatLagi = true;
    batas += POST_HALAMAN;
    renderStatus();
    pasangPosts();
  });

  // ===== TITIK / ANGKA DI MENU =====
  // "!" = feed kosong saat dilihat (lebih kecil dari semua key postingan, jadi semua yang
  // datang sesudahnya dihitung baru)
  function tandaiDilihat() {
    simpan.tulis(KUNCI_DILIHAT, urutan[0] || "!");
    ctx.setBadge(0);
  }

  function hitungBadge() {
    if (ctx.aktif()) return tandaiDilihat(); // panel terbuka: semuanya langsung terlihat
    const dilihat = simpan.baca(KUNCI_DILIHAT);
    if (!dilihat) return ctx.setBadge(0);
    let n = 0;
    for (const id of urutan) {
      if (id > dilihat && kartu.get(id)?.data.uid !== saya()) n++;
    }
    ctx.setBadge(n);
  }

  // ===== PENULIS POSTINGAN =====
  function sinkronPenulis() {
    const google = ctx.isGoogle();
    tulisForm.hidden = !google;
    tulisTamu.hidden = google;
    if (!google) return;
    const alasan = larangan();
    tulisInput.disabled = !!alasan;
    tulisInput.placeholder = alasan || "Apa yang ingin kamu bagikan?";
    tulisKirim.disabled = !!alasan || !tulisInput.value.trim();
    tulisHitung.textContent = `${tulisInput.value.length}/${MAX_POST}`;
  }

  tulisInput.addEventListener("input", sinkronPenulis);
  tulisInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      kirimPost();
    }
  });
  tulisForm.addEventListener("submit", (e) => {
    e.preventDefault();
    kirimPost();
  });

  async function kirimPost() {
    const u = ctx.user();
    if (!u || !ctx.isGoogle()) return;
    const alasan = larangan();
    if (alasan) return kabar(alasan, tulisKabar);
    const nilai = tulisInput.value;
    const teks = bersihkan(nilai, MAX_POST, true);
    if (!teks) return;
    if (Date.now() - terakhirPost < JEDA_POST_MS) {
      return kabar("Pelan-pelan, tunggu sebentar sebelum memposting lagi.", tulisKabar);
    }
    terakhirPost = Date.now();
    kabar("", tulisKabar);
    tulisInput.value = "";
    sinkronPenulis();
    tulisKirim.disabled = true;
    try {
      const id = push(ref(db, "posts")).key;
      await set(ref(db, `posts/${id}`), {
        uid: u.uid,
        name: ctx.nama().slice(0, 40),
        text: teks,
        timestamp: ctx.sekarang(),
      });
      body.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      terakhirPost = 0;
      if (!tulisInput.value) tulisInput.value = nilai; // kembalikan tulisannya
      kabar(pesanGalat(err), tulisKabar);
    } finally {
      sinkronPenulis();
    }
  }

  // ===== SIKLUS =====
  function bersihSemua() {
    gen++;
    for (const stop of stopPosts) stop();
    stopPosts = [];
    for (const k of kartu.values()) for (const stop of k.stops) stop();
    kartu.clear();
    urutan = [];
    hapusLokal.clear();
    daftar.replaceChildren();
    batas = POST_HALAMAN;
    siap = false;
    galat = "";
    memuatLagi = false;
    ctx.setBadge(0);
  }

  // Dipanggil saat akun berganti (login/keluar). Listener lama diputus Firebase saat
  // izin bacanya hilang, jadi semuanya dipasang ulang dari awal.
  function setUser(user) {
    const uid = user?.uid || null;
    if (uid === uidAktif) return;
    bersihSemua();
    uidAktif = uid;
    if (uid) pasangPosts();
    renderStatus();
    sinkronPenulis();
  }

  // Segarkan tampilan (nama, waktu, tombol hapus, penulis). Penuh hanya saat panelnya terbuka.
  function segarkan(aktif = ctx.aktif()) {
    hitungBadge();
    if (!aktif) return;
    if (siap) tandaiDilihat();
    sinkronPenulis();
    for (const k of kartu.values()) {
      segarkanIdentitas(k.x);
      perbaruiSuka(k);
      for (const c of k.komentar.values()) if (c.x) segarkanIdentitas(c.x);
    }
  }

  // Waktu relatif ("5 mnt lalu") dihitung ulang tiap setengah menit selagi panel terbuka
  setInterval(() => {
    if (!ctx.aktif() || document.hidden) return;
    for (const k of kartu.values()) {
      segarkanIdentitas(k.x);
      if (k.terbuka) for (const c of k.komentar.values()) if (c.x) segarkanIdentitas(c.x);
    }
  }, 30000);

  renderStatus();
  return { setUser, segarkan };
}
