import {
  ref,
  get,
  set,
  remove,
  update,
  onValue,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

const ONLINE_MS = 60000;

export function initAdmin({ db, onDiblokir }) {
  const btn = document.getElementById("admin-btn");
  const panel = document.getElementById("admin-panel");
  const closeBtn = document.getElementById("admin-close");
  const onlineList = document.getElementById("admin-online");
  const bannedList = document.getElementById("admin-banned");
  const onlineCount = document.getElementById("admin-online-count");
  const bannedCount = document.getElementById("admin-banned-count");

  let user = null;
  let aktif = false;
  let stops = [];
  let timer = null;
  let usersData = {};
  let bannedData = {};

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
    if (aksi) li.appendChild(aksi);
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
      let aksi = null;
      if (!saya) {
        aksi = bannedData[uid]
          ? buatTag("Diblokir")
          : buatTombol("Blokir", true, () => blokir(uid, u.name));
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
          buatTombol("Buka blokir", false, () => bukaBlokir(uid)),
        ),
      );
    }
    bannedList.replaceChildren(frag);
  }

  function render() {
    renderOnline();
    renderBanned();
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

  // ===== Panel =====
  function tutup() {
    panel.hidden = true;
  }

  btn.addEventListener("click", () => {
    render();
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
  function bersihkan() {
    stops.forEach((f) => f());
    stops = [];
    clearInterval(timer);
    usersData = {};
    bannedData = {};
    aktif = false;
    btn.hidden = true;
    tutup();
  }

  function setUser(u) {
    bersihkan();
    user = u;
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

    // Apakah akun ini admin? (daftar admin diisi manual lewat Firebase Console)
    get(ref(db, `admins/${u.uid}`))
      .then((snap) => {
        if (user?.uid !== u.uid || snap.val() !== true) return;
        aktif = true;
        btn.hidden = false;

        stops.push(
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
          onValue(
            ref(db, "admins"),
            (s) => {
              setAdminData(s.val() || {});
            },
            (err) => console.error("Gagal membaca daftar admin:", err),
          ),
        );
        timer = setInterval(() => {
          if (!panel.hidden) renderOnline();
        }, 15000);
      })
      .catch((err) =>
        console.warn("Cek admin gagal:", err.code || err.message),
      );
  }

  let adminData = {};

  // ===== Fungsi tambahan untuk cek status admin =====
  function isAdmin(uid) {
    return !!adminData[uid];
  }

  function setAdminData(data) {
    adminData = data || {};
  }

  return {
    setUser,
    aktif: () => aktif,
    sudahDiblokir: (uid) => !!bannedData[uid],
    isAdmin,
    setAdminData,
    hapusPesan,
    blokir,
  };
}
