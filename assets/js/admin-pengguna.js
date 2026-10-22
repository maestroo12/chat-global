import {
  ref,
  get,
  set,
  remove,
  onValue,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import { el } from "./ui.js";

// Cek profil + atur pengguna lewat ID (bagian dari Panel admin).
// Pengaturan disimpan di userSettings/{uid}; kosong = pakai bawaan aplikasi.
//   msgLimit  : batas pesan per 24 jam (tamu bawaan 30, akun Google bawaan tanpa batas)
//   nameLimit : batas ganti nama per 24 jam (hanya tamu, bawaan 5)
//   maxText   : panjang maksimal satu pesan (bawaan 500)
//   noFile    : true = dilarang kirim foto/file
const UID_RE = /^[A-Za-z0-9]{20,40}$/;
const ONLINE_MS = 60000;
const BATAS = {
  msgLimit: { min: 0, max: 10000, label: "Batas pesan per 24 jam" },
  nameLimit: { min: 0, max: 1000, label: "Batas ganti nama per 24 jam" },
  maxText: { min: 1, max: 500, label: "Panjang maksimal pesan" },
};

const waktu = (ts) =>
  new Date(ts).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function initPengguna(ctx) {
  const $ = (id) => document.getElementById(id);
  const form = $("admin-cari-form");
  const field = $("admin-cari-input");
  const hint = $("admin-cari-hint");
  const pilihan = $("admin-cari-pilihan");
  const kartu = $("admin-profil");

  let S = null; // state kartu yang sedang dibuka
  let stopSet = null;
  let seq = 0; // menandai permintaan terbaru supaya hasil lama tidak menimpa
  let ui = null; // referensi elemen kartu

  // ===== Pencarian =====
  function kandidat(q) {
    const kecil = q.toLowerCase();
    const hasil = [];
    for (const [uid, nama] of ctx.daftarKenal()) {
      if (
        (kecil.length >= 3 && uid.toLowerCase().startsWith(kecil)) ||
        (nama || "").toLowerCase().includes(kecil)
      ) {
        hasil.push([uid, nama]);
      }
    }
    return hasil;
  }

  function cari(e) {
    e.preventDefault();
    if (!ctx.aktif()) return;
    const q = field.value.trim();
    pilihan.replaceChildren();
    if (!q) {
      hint.textContent = "Isi ID pengguna atau namanya.";
      return;
    }
    if (UID_RE.test(q)) {
      hint.textContent = "";
      buka(q);
      return;
    }
    const hasil = kandidat(q);
    if (!hasil.length) {
      hint.textContent =
        "Tidak ditemukan. Pencarian nama/ID depan hanya mencakup yang online, diblokir, atau pernah pakai nama tampilan. Untuk yang lain, tempel ID lengkapnya.";
      return;
    }
    if (hasil.length === 1) {
      hint.textContent = "";
      buka(hasil[0][0]);
      return;
    }
    hint.textContent = `${hasil.length} hasil, pilih salah satu:`;
    const frag = document.createDocumentFragment();
    for (const [uid, nama] of hasil.slice(0, 8)) {
      frag.append(
        el("button", {
          type: "button",
          class: "admin-act",
          text: `${nama || "Tanpa nama"} · ${uid.slice(0, 6)}`,
          onclick: () => {
            pilihan.replaceChildren();
            hint.textContent = "";
            buka(uid);
          },
        }),
      );
    }
    pilihan.replaceChildren(frag);
  }
  form.addEventListener("submit", cari);

  // ===== Kartu profil =====
  function tutup() {
    seq++;
    if (stopSet) stopSet();
    stopSet = null;
    S = null;
    ui = null;
    kartu.hidden = true;
    kartu.replaceChildren();
  }

  async function buka(uid) {
    if (!ctx.aktif() || !UID_RE.test(uid)) return;
    tutup();
    const saya = ++seq;
    S = { uid, bio: "", pesan: [], set: null, formKotor: false };
    kartu.hidden = false;
    kartu.replaceChildren(el("p", { class: "admin-hint", text: "Memuat profil..." }));
    kartu.scrollIntoView({ block: "nearest" });

    try {
      const [bioSnap, pesanSnap] = await Promise.all([
        get(ref(ctx.db, `profiles/${uid}`)),
        get(
          query(
            ref(ctx.db, "chat"),
            orderByChild("uid"),
            equalTo(uid),
            limitToLast(5),
          ),
        ),
      ]);
      if (saya !== seq) return;
      S.bio = bioSnap.val()?.bio || "";
      const daftar = [];
      pesanSnap.forEach((c) => {
        daftar.push({ key: c.key, ...c.val() });
      });
      S.pesan = daftar.reverse(); // terbaru dulu
    } catch (err) {
      if (saya !== seq) return;
      kartu.replaceChildren(
        el("p", {
          class: "admin-hint galat",
          text: "Gagal memuat profil: " + (err.code || err.message),
        }),
      );
      return;
    }

    bangunKartu();
    stopSet = onValue(
      ref(ctx.db, `userSettings/${uid}`),
      (snap) => {
        if (saya !== seq) return;
        S.set = snap.val();
        isiInfo();
        isiForm(false);
      },
      (err) => {
        if (saya !== seq) return;
        ui.kabar.textContent =
          "Gagal membaca pengaturan: " + (err.code || err.message);
      },
    );
    kartu.scrollIntoView({ block: "nearest" });
  }

  function chip(teks, kelas) {
    return el("span", { class: "admin-chip" + (kelas ? " " + kelas : ""), text: teks });
  }

  function bangunKartu() {
    ui = {
      nama: el("div", { class: "admin-kartu-nama" }),
      chips: el("div", { class: "admin-chips" }),
      id: el("code", { class: "admin-id", text: S.uid }),
      bio: el("p", { class: "admin-bio" }),
      aksi: el("div", { class: "admin-acts" }),
      pesan: el("ul", { class: "admin-pesan" }),
      status: el("p", { class: "admin-hint" }),
      kabar: el("p", { class: "admin-hint", role: "status" }),
    };
    const salin = el("button", {
      type: "button",
      class: "admin-act",
      text: "Salin ID",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(S.uid);
          salin.textContent = "Tersalin";
        } catch {
          salin.textContent = "Gagal menyalin";
        }
        setTimeout(() => (salin.textContent = "Salin ID"), 1800);
      },
    });
    const tutupBtn = el("button", {
      type: "button",
      class: "admin-act",
      text: "Tutup",
      onclick: tutup,
    });

    ui.f = {};
    const angka = (kunci, placeholder) => {
      const input = el("input", {
        type: "number",
        class: "admin-num",
        min: BATAS[kunci].min,
        max: BATAS[kunci].max,
        step: 1,
        inputmode: "numeric",
        placeholder,
        "aria-label": BATAS[kunci].label,
      });
      input.addEventListener("input", () => (S.formKotor = true));
      ui.f[kunci] = input;
      return input;
    };
    const baris = (label, input, bantuan) =>
      el(
        "label",
        { class: "admin-field" },
        el("span", { class: "admin-field-label", text: label }),
        input,
        el("span", { class: "admin-hint", text: bantuan }),
      );

    ui.f.noFile = el("input", { type: "checkbox" });
    ui.f.noFile.addEventListener("change", () => (S.formKotor = true));

    const pengaturan = el(
      "form",
      { class: "admin-pengaturan", novalidate: true, onsubmit: simpan },
      el("h4", { text: "Pengaturan pengguna" }),
      baris(
        "Batas pesan per 24 jam",
        angka("msgLimit", "Bawaan"),
        "Kosong = bawaan (tamu 30, akun Google tanpa batas). 0 = tidak boleh kirim pesan.",
      ),
      baris(
        "Batas ganti nama per 24 jam",
        angka("nameLimit", "Bawaan"),
        "Kosong = bawaan (5). Berlaku untuk tamu.",
      ),
      baris(
        "Panjang maksimal pesan",
        angka("maxText", "500"),
        "Kosong = 500 karakter (batas tertinggi).",
      ),
      el(
        "label",
        { class: "admin-cek" },
        ui.f.noFile,
        el("span", { text: "Larang kirim foto/file" }),
      ),
      el(
        "div",
        { class: "admin-acts admin-acts-kiri" },
        el("button", { type: "submit", class: "admin-act", text: "Simpan" }),
        el("button", {
          type: "button",
          class: "admin-act",
          text: "Kembalikan ke bawaan",
          onclick: resetPengaturan,
        }),
      ),
      ui.status,
      ui.kabar,
      el("p", {
        class: "admin-hint",
        text: "Pengaturan melekat pada ID akun. Tamu yang menghapus data browser mendapat ID baru, jadi bawaan berlaku lagi.",
      }),
    );

    kartu.replaceChildren(
      el("div", { class: "admin-kartu-atas" }, ui.nama, ui.chips),
      el("div", { class: "admin-idbaris" }, ui.id, salin),
      ui.bio,
      el("h4", { text: "Pesan terakhir" }),
      ui.pesan,
      ui.aksi,
      pengaturan,
      el("div", { class: "admin-acts admin-acts-kiri" }, tutupBtn),
    );
    isiInfo();
    isiForm(true);
  }

  // Bagian yang ikut berubah realtime (status online, blokir, pengaturan aktif)
  function isiInfo() {
    if (!S || !ui) return;
    const { uid } = S;
    const u = ctx.users()[uid];
    const ban = ctx.banned()[uid];
    const terakhir = S.pesan[0];
    const admin = ctx.isAdmin(uid);
    const saya = uid === ctx.user()?.uid;

    const nama =
      ctx.namaUntuk(uid, terakhir?.name || u?.name || ban?.name) ||
      "Tanpa nama";
    ui.nama.textContent = nama + (saya ? " (kamu)" : "");

    const jenis = admin
      ? "Admin"
      : terakhir?.verified
        ? "Akun Google"
        : terakhir
          ? "Tamu"
          : "Jenis tidak diketahui";
    const online = u?.lastSeen && Date.now() - u.lastSeen < ONLINE_MS;
    const chips = [chip(jenis, admin ? "admin" : "")];
    chips.push(chip(online ? "Online" : "Offline", online ? "hijau" : ""));
    if (ban) chips.push(chip("Diblokir", "merah"));
    if (S.set) chips.push(chip("Ada pengaturan khusus", "biru"));
    ui.chips.replaceChildren(...chips);

    ui.bio.textContent = S.bio || "Belum ada bio.";
    ui.bio.classList.toggle("kosong", !S.bio);

    if (!S.pesan.length) {
      ui.pesan.replaceChildren(
        el("li", { class: "admin-empty", text: "Belum ada pesan di chat." }),
      );
    } else {
      ui.pesan.replaceChildren(
        ...S.pesan.map((p) =>
          el(
            "li",
            { class: "admin-pesan-item" },
            el("span", { class: "admin-sub", text: waktu(p.timestamp || 0) }),
            el("span", {
              class: "admin-pesan-isi",
              text: p.deleted
                ? "(pesan dihapus)"
                : p.text
                  ? p.text.slice(0, 120)
                  : p.file
                    ? `[file] ${p.file.name || ""}`
                    : "",
            }),
          ),
        ),
      );
    }

    // Aksi blokir (tidak untuk diri sendiri)
    ui.aksi.replaceChildren();
    if (!saya) {
      ui.aksi.append(
        ban
          ? el("button", {
              type: "button",
              class: "admin-act",
              text: "Buka blokir",
              onclick: () => ctx.bukaBlokir(uid),
            })
          : el("button", {
              type: "button",
              class: "admin-act danger",
              text: "Blokir pengguna",
              onclick: () => ctx.blokir(uid, nama),
            }),
      );
    }

    const s = S.set;
    ui.status.textContent = s
      ? "Aktif: " +
        [
          s.msgLimit != null ? `pesan ${s.msgLimit}/24 jam` : null,
          s.nameLimit != null ? `ganti nama ${s.nameLimit}/24 jam` : null,
          s.maxText != null ? `maks ${s.maxText} karakter` : null,
          s.noFile ? "tanpa file" : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "Memakai pengaturan bawaan.";
  }

  function isiForm(paksa) {
    if (!S || !ui) return;
    // Jangan menimpa ketikan admin yang belum disimpan
    const sedangMengetik =
      kartu.contains(document.activeElement) &&
      document.activeElement?.tagName === "INPUT";
    if (!paksa && (S.formKotor || sedangMengetik)) return;
    const s = S.set || {};
    for (const k of Object.keys(BATAS)) ui.f[k].value = s[k] ?? "";
    ui.f.noFile.checked = s.noFile === true;
    S.formKotor = false;
  }

  function bacaForm() {
    const hasil = {};
    for (const [k, b] of Object.entries(BATAS)) {
      const mentah = ui.f[k].value.trim();
      if (mentah === "") continue;
      const n = Number(mentah);
      if (!Number.isInteger(n) || n < b.min || n > b.max) {
        throw new Error(`${b.label}: isi bilangan bulat ${b.min}-${b.max}, atau kosongkan.`);
      }
      hasil[k] = n;
    }
    if (ui.f.noFile.checked) hasil.noFile = true;
    return hasil;
  }

  async function simpan(e) {
    e.preventDefault();
    if (!ctx.aktif() || !S || !ui) return;
    const uid = S.uid;
    const r = ref(ctx.db, `userSettings/${uid}`);
    let nilai;
    try {
      nilai = bacaForm();
    } catch (err) {
      ui.kabar.textContent = err.message;
      return;
    }
    ui.kabar.textContent = "Menyimpan...";
    try {
      if (Object.keys(nilai).length) {
        await set(r, { ...nilai, at: serverTimestamp(), by: ctx.user().uid });
        ui.kabar.textContent = "Tersimpan. Langsung berlaku untuk pengguna ini.";
      } else {
        await remove(r);
        ui.kabar.textContent = "Semua kosong, kembali ke pengaturan bawaan.";
      }
      if (S?.uid === uid) S.formKotor = false;
    } catch (err) {
      ui.kabar.textContent =
        err.code === "PERMISSION_DENIED"
          ? "Ditolak. Pastikan database.rules.json terbaru sudah di-deploy."
          : "Gagal menyimpan: " + (err.code || err.message);
    }
  }

  async function resetPengaturan() {
    if (!ctx.aktif() || !S || !ui) return;
    if (!confirm("Kembalikan semua pengaturan pengguna ini ke bawaan?")) return;
    const uid = S.uid;
    try {
      await remove(ref(ctx.db, `userSettings/${uid}`));
      if (S?.uid === uid) {
        S.formKotor = false;
        ui.kabar.textContent = "Dikembalikan ke bawaan.";
        isiForm(true);
      }
    } catch (err) {
      ui.kabar.textContent = "Gagal: " + (err.code || err.message);
    }
  }

  return { buka, tutup, segarkan: isiInfo };
}
