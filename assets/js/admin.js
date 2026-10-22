import {
  ref,
  get,
  set,
  remove,
  update,
  onValue,
  query,
  orderByKey,
  limitToFirst,
  orderByChild,
  startAt,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import { initPengguna } from "./admin-pengguna.js";

const ONLINE_MS = 60000;

export function initAdmin({
  db,
  onDiblokir,
  onAdminBerubah,
  onNamaAdmin,
  onNamaDaftarBerubah,
  onPengaturan,
  namaDefault,
}) {
  const btn = document.getElementById("admin-btn");
  const panel = document.getElementById("admin-panel");
  const closeBtn = document.getElementById("admin-close");
  const onlineList = document.getElementById("admin-online");
  const bannedList = document.getElementById("admin-banned");
  const onlineCount = document.getElementById("admin-online-count");
  const bannedCount = document.getElementById("admin-banned-count");
  const nameForm = document.getElementById("admin-name-form");
  const nameField = document.getElementById("admin-name-input");
  const nameHint = document.getElementById("admin-name-hint");
  const purgeForm = document.getElementById("admin-purge-form");
  const purgeField = document.getElementById("admin-purge-input");
  const purgeHint = document.getElementById("admin-purge-hint");
  const MAX_HAPUS = 500;

  let user = null;
  let aktif = false; // akun yang sedang login adalah admin
  let stops = []; // pemantau milik sesi login (blokir diri sendiri, daftar admin)
  let stopsAdmin = []; // pemantau khusus admin (daftar blokir, daftar user)
  let timer = null;
  let usersData = {};
  let bannedData = {};

  // Daftar admin bersifat publik (boleh dibaca semua akun yang login), jadi dipakai
  // semua orang untuk menentukan label "Admin" di chat. Sengaja TIDAK dikosongkan
  // saat ganti akun, supaya label tidak berkedip.
  // Nama tampilan admin (bukan nama Google). Disimpan di adminNames/{uid}.
  let namaKustom = null;
  let namaSiap = false;

  // Nama tampilan semua admin (uid -> nama). Publik, dipakai untuk menampilkan nama
  // admin di SEMUA pesan mereka (termasuk riwayat lama), jadi ganti nama berlaku
  // surut tanpa mengubah isi pesan. Seperti adminSet, tidak dikosongkan saat ganti akun.
  let namaMap = {};

  // Nama tampilan akun biasa (tamu & Google non-admin), uid -> nama. Hanya yang aktif
  // dalam 120 hari terakhir dimuat, supaya data tidak membengkak.
  let userMap = {};
  const samaPeta = (a, b) => {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
  };

  // Pengaturan khusus untuk akun yang sedang login (userSettings/{uid}), diatur admin:
  // msgLimit, nameLimit, maxText, noFile. Kosong = pakai bawaan aplikasi.
  let pengaturan = {};

  let adminSet = new Set();
  let adminSiap = false; // daftar admin sudah pernah berhasil dibaca

  // ===== Elemen kecil =====
  function buatTombol(label, danger, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "admin-act" + (danger ? " danger" : "");
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }

  function buatTag(teks) {
    const s = document.createElement("span");
    s.className = "admin-tag";
    s.textContent = teks;
    return s;
  }

  function buatKosong(teks) {
    const li = document.createElement("li");
    li.className = "admin-empty";
    li.textContent = teks;
    return li;
  }

  function buatBaris(nama, sub, aksi) {
    const li = document.createElement("li");
    li.className = "admin-row";

    const info = document.createElement("span");
    info.className = "admin-info";
    const n = document.createElement("span");
    n.className = "admin-name";
    n.textContent = nama;
    const s = document.createElement("span");
    s.className = "admin-sub";
    s.textContent = sub;
    info.append(n, s);

    li.appendChild(info);
    const daftarAksi = [aksi].flat().filter(Boolean);
    if (daftarAksi.length === 1) li.appendChild(daftarAksi[0]);
    else if (daftarAksi.length) {
      const wadah = document.createElement("span");
      wadah.className = "admin-acts";
      wadah.append(...daftarAksi);
      li.appendChild(wadah);
    }
    return li;
  }

  // ===== Render =====
  function renderOnline() {
    const now = Date.now();
    const daftar = Object.entries(usersData)
      .filter(([, u]) => u?.lastSeen && now - u.lastSeen < ONLINE_MS)
      .sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));

    onlineCount.textContent = daftar.length;
    const frag = document.createDocumentFragment();
    if (!daftar.length) frag.appendChild(buatKosong("Tidak ada yang online."));

    for (const [uid, u] of daftar) {
      const saya = uid === user?.uid;
      const aksi = [buatTombol("Cek", false, () => bukaProfil(uid))];
      if (!saya) {
        aksi.push(
          bannedData[uid]
            ? buatTag("Diblokir")
            : buatTombol("Blokir", true, () => blokir(uid, u.name)),
        );
      }
      frag.appendChild(
        buatBaris(
          (u.name || "Tanpa nama") + (saya ? " (kamu)" : ""),
          `ID ${uid.slice(0, 6)}`,
          aksi,
        ),
      );
    }
    onlineList.replaceChildren(frag);
  }

  function renderBanned() {
    const daftar = Object.entries(bannedData).sort(
      (a, b) => (b[1]?.at || 0) - (a[1]?.at || 0),
    );

    bannedCount.textContent = daftar.length;
    const frag = document.createDocumentFragment();
    if (!daftar.length)
      frag.appendChild(buatKosong("Belum ada yang diblokir."));

    for (const [uid, b] of daftar) {
      const sub = b?.at
        ? "Sejak " +
        new Date(b.at).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
        : `ID ${uid.slice(0, 6)}`;
      frag.appendChild(
        buatBaris(
          b?.name || "Tanpa nama",
          sub,
          [
            buatTombol("Cek", false, () => bukaProfil(uid)),
            buatTombol("Buka blokir", false, () => bukaBlokir(uid)),
          ],
        ),
      );
    }
    bannedList.replaceChildren(frag);
  }

  function render() {
    renderOnline();
    renderBanned();
    pengguna.segarkan();
  }

  // ===== Aksi =====
  async function blokir(uid, nama) {
    if (!aktif || !uid || uid === user?.uid) return;
    if (
      !confirm(
        `Blokir ${nama || "pengguna ini"}? Dia tidak bisa kirim pesan lagi.`,
      )
    )
      return;
    try {
      await set(ref(db, `banned/${uid}`), {
        name: (nama || "").slice(0, 40),
        at: serverTimestamp(),
      });
    } catch (err) {
      alert("Gagal memblokir: " + (err.code || err.message));
    }
  }

  async function bukaBlokir(uid) {
    if (!aktif) return;
    try {
      await remove(ref(db, `banned/${uid}`));
    } catch (err) {
      alert("Gagal membuka blokir: " + (err.code || err.message));
    }
  }

  async function hapusPesan(key, data) {
    if (!aktif || !key) return;
    if (!confirm("Hapus pesan ini untuk semua orang?")) return;

    const updates = {
      [`chat/${key}/deleted`]: true,
      [`chat/${key}/deletedByAdmin`]: true,
      [`chat/${key}/text`]: null,
      [`chat/${key}/file`]: null,
    };
    if (data?.file?.id) updates[`files/${data.file.id}`] = null;

    try {
      await update(ref(db), updates);
    } catch (err) {
      alert("Gagal menghapus (admin): " + (err.code || err.message));
    }
  }

  // ===== Cek profil & atur pengguna (admin-pengguna.js) =====
  const pengguna = initPengguna({
    db,
    aktif: () => aktif,
    user: () => user,
    users: () => usersData,
    banned: () => bannedData,
    isAdmin: (uid) => adminSet.has(uid),
    namaUntuk: (uid, namaPesan) => namaUntuk(uid, namaPesan),
    // uid -> nama untuk semua akun yang dikenal klien (dipakai pencarian)
    daftarKenal() {
      const peta = new Map();
      for (const [uid, u] of Object.entries(usersData)) peta.set(uid, u?.name || "");
      for (const [uid, b] of Object.entries(bannedData)) if (!peta.get(uid)) peta.set(uid, b?.name || "");
      for (const uid of adminSet) peta.set(uid, namaMap[uid] || peta.get(uid) || "");
      for (const [uid, n] of Object.entries(userMap)) peta.set(uid, n);
      return peta;
    },
    blokir: (uid, nama) => blokir(uid, nama),
    bukaBlokir: (uid) => bukaBlokir(uid),
  });

  function bukaProfil(uid) {
    if (!aktif) return;
    render();
    isiFormNama();
    panel.hidden = false;
    pengguna.buka(uid);
  }

  // ===== Nama tampilan admin =====
  async function simpanNama(e) {
    e.preventDefault();
    if (!aktif || !user) return;
    const nama = nameField.value.trim().slice(0, 24);
    const r = ref(db, `adminNames/${user.uid}`);
    try {
      if (nama) await set(r, nama);
      else await remove(r);
      nameHint.textContent = nama
        ? "Tersimpan. Pesan barumu memakai nama ini."
        : "Kembali memakai nama Google.";
    } catch (err) {
      alert("Gagal menyimpan nama: " + (err.code || err.message));
    }
  }

  nameForm.addEventListener("submit", simpanNama);

  // ===== Hapus riwayat chat (N pesan terlama) =====
  let sedangHapus = false;

  async function hapusTerlama(e) {
    e.preventDefault();
    if (!aktif || sedangHapus) return;

    const n = Math.floor(Number(purgeField.value));
    if (!(n >= 1)) {
      purgeHint.textContent = "Isi jumlah pesan yang mau dihapus (minimal 1).";
      return;
    }
    if (n > MAX_HAPUS) {
      purgeHint.textContent = `Maksimal ${MAX_HAPUS} pesan sekali hapus. Ulangi kalau perlu lebih.`;
      return;
    }
    if (
      !confirm(
        `Hapus ${n} pesan terlama secara permanen (termasuk foto/file-nya)? Tidak bisa dibatalkan.`,
      )
    )
      return;

    sedangHapus = true;
    purgeForm.querySelector("button").disabled = true;
    purgeHint.textContent = "Menghapus...";

    try {
      const snap = await get(
        query(ref(db, "chat"), orderByKey(), limitToFirst(n)),
      );

      const updates = {};
      let terakhir = null;
      let jumlah = 0;
      snap.forEach((c) => {
        updates[`chat/${c.key}`] = null;
        const fid = c.val()?.file?.id;
        if (fid) updates[`files/${fid}`] = null;
        terakhir = c.key;
        jumlah++;
      });

      if (!jumlah) {
        purgeHint.textContent = "Tidak ada pesan untuk dihapus.";
        return;
      }

      // Sinyal ke semua pengguna yang sedang membuka chat: buang pesan sampai key ini
      updates["purge"] = { upTo: terakhir, at: serverTimestamp() };
      await update(ref(db), updates);

      purgeField.value = "";
      purgeHint.textContent = `${jumlah} pesan terlama sudah dihapus.`;
    } catch (err) {
      purgeHint.textContent = "Gagal menghapus: " + (err.code || err.message);
    } finally {
      sedangHapus = false;
      purgeForm.querySelector("button").disabled = false;
    }
  }

  purgeForm.addEventListener("submit", hapusTerlama);

  // Dipanggil sebelum kirim pesan: pastikan nama sudah terbaca, supaya pesan pertama
  // setelah login tidak sempat memakai nama Google.
  async function pastikanNama() {
    if (!aktif || namaSiap || !user) return;
    const uid = user.uid;
    try {
      const snap = await get(ref(db, `adminNames/${uid}`));
      if (user?.uid === uid) namaKustom = snap.val() || null;
    } catch (err) {
      console.warn("Gagal membaca nama admin:", err.code || err.message);
    }
  }

  // ===== Panel =====
  function tutup() {
    panel.hidden = true;
    pengguna.tutup();
  }

  function isiFormNama() {
    nameField.value = namaKustom || "";
    nameField.placeholder = (user && namaDefault && namaDefault(user)) || "Nama";
  }

  function namaUntuk(uid, namaPesan) {
    if (!uid) return namaPesan;
    if (adminSet.has(uid)) return namaMap[uid] || namaPesan;
    return userMap[uid] || namaPesan;
  }

  btn.addEventListener("click", () => {
    render();
    isiFormNama();
    panel.hidden = false;
    closeBtn.focus();
  });
  closeBtn.addEventListener("click", () => {
    tutup();
    btn.focus();
  });
  panel.addEventListener("click", (e) => {
    if (e.target.dataset.tutupAdmin !== undefined) tutup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) tutup();
  });

  // ===== Siklus akun =====
  function matikanAdmin() {
    stopsAdmin.forEach((f) => f());
    stopsAdmin = [];
    clearInterval(timer);
    usersData = {};
    bannedData = {};
    namaKustom = null;
    namaSiap = false;
    aktif = false;
    btn.hidden = true;
    tutup();
  }

  function aktifkanAdmin() {
    aktif = true;
    btn.hidden = false;

    const uid = user.uid;
    stopsAdmin.push(
      onValue(
        ref(db, `adminNames/${uid}`),
        (s) => {
          namaKustom = s.val() || null;
          namaSiap = true;
          if (!panel.hidden && document.activeElement !== nameField) isiFormNama();
          if (onNamaAdmin) onNamaAdmin();
        },
        (err) => {
          namaSiap = true; // tetap pakai nama Google kalau tidak bisa dibaca
          console.warn("Gagal membaca nama admin:", err.code || err.message);
        },
      ),
      onValue(
        ref(db, "banned"),
        (s) => {
          bannedData = s.val() || {};
          if (!panel.hidden) render();
        },
        (err) => console.error("Gagal membaca daftar blokir:", err),
      ),
      onValue(
        ref(db, "users"),
        (s) => {
          usersData = s.val() || {};
          if (!panel.hidden) render();
        },
        (err) => console.error("Gagal membaca daftar user:", err),
      ),
    );
    timer = setInterval(() => {
      if (!panel.hidden) renderOnline();
    }, 15000);
  }

  function bersihkan() {
    stops.forEach((f) => f());
    stops = [];
    matikanAdmin();
  }

  // Satu-satunya tempat yang menentukan siapa admin: dipanggil tiap daftar admin berubah.
  function terapkanDaftarAdmin(val) {
    const baru = new Set(Object.keys(val).filter((k) => val[k] === true));
    const berubah =
      !adminSiap ||
      baru.size !== adminSet.size ||
      [...baru].some((k) => !adminSet.has(k));

    adminSet = baru;
    adminSiap = true;

    const harusAktif = !!user && !user.isAnonymous && baru.has(user.uid);
    if (harusAktif && !aktif) aktifkanAdmin();
    else if (!harusAktif && aktif) matikanAdmin();

    if (berubah && onAdminBerubah) onAdminBerubah();
  }

  function setUser(u) {
    bersihkan();
    user = u;
    pengaturan = {};
    onDiblokir(false);
    if (!u) return;

    // Apakah akun ini sendiri diblokir?
    stops.push(
      onValue(
        ref(db, `banned/${u.uid}`),
        (snap) => onDiblokir(snap.exists()),
        (err) => console.error("Gagal membaca status blokir:", err),
      ),
    );

    // Pengaturan khusus akun ini (batas pesan/ganti nama, dst.) yang diatur admin.
    // Snapshot pertama selalu memanggil onPengaturan, supaya klien menerapkan bawaan.
    pengaturan = {};
    stops.push(
      onValue(
        ref(db, `userSettings/${u.uid}`),
        (snap) => {
          if (user?.uid !== u.uid) return;
          pengaturan = snap.val() || {};
          if (onPengaturan) onPengaturan();
        },
        (err) => {
          console.warn("Gagal membaca pengaturan akun:", err.code || err.message);
          if (user?.uid === u.uid && onPengaturan) onPengaturan();
        },
      ),
    );

    // Daftar admin diisi manual lewat Firebase Console. Dipantau terus (realtime)
    // oleh semua akun, bukan hanya admin.
    stops.push(
      onValue(
        ref(db, "admins"),
        (snap) => {
          if (user?.uid !== u.uid) return; // akun sudah berganti
          terapkanDaftarAdmin(snap.val() || {});
        },
        (err) => console.warn("Gagal membaca daftar admin:", err.code || err.message),
      ),
    );

    // Nama tampilan akun biasa: dibaca semua akun
    stops.push(
      onValue(
        query(
          ref(db, "userNames"),
          orderByChild("at"),
          startAt(Date.now() - 120 * 86400000),
        ),
        (snap) => {
          const baru = {};
          snap.forEach((c) => {
            const n = c.val()?.name;
            if (typeof n === "string" && n) baru[c.key] = n;
          });
          const sama = samaPeta(baru, userMap);
          userMap = baru;
          if (!sama && onNamaDaftarBerubah) onNamaDaftarBerubah();
        },
        (err) =>
          console.warn("Gagal membaca nama pengguna:", err.code || err.message),
      ),
    );

    // Nama tampilan admin: dibaca semua akun
    stops.push(
      onValue(
        ref(db, "adminNames"),
        (snap) => {
          const baru = snap.val() || {};
          const sama = JSON.stringify(baru) === JSON.stringify(namaMap);
          namaMap = baru;
          if (!sama && onNamaDaftarBerubah) onNamaDaftarBerubah();
        },
        (err) => console.warn("Gagal membaca nama admin:", err.code || err.message),
      ),
    );
  }

  return {
    setUser,
    aktif: () => aktif,
    sudahDiblokir: (uid) => !!bannedData[uid],
    isAdmin: (uid) => adminSet.has(uid),
    namaTampil: () => (aktif && namaKustom) || null,
    // Nama yang ditampilkan untuk pesan dari uid ini (nama admin terbaru, kalau dia admin)
    namaUntuk,
    // Nama tampilan akun biasa (bukan admin) yang tersimpan, atau null
    namaPengguna: (uid) => userMap[uid] || null,
    namaSiap: () => namaSiap,
    pastikanNama,
    adminSiap: () => adminSiap,
    hapusPesan,
    blokir,
    bukaProfil,
    pengaturanSaya: () => pengaturan,
  };
}
