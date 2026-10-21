import {
  ref,
  set,
  remove,
  onValue,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import { el, buatAvatar, fotoAkun, tanggalPanjang } from "./ui.js";

const MAKS_BIO = 140;
const MAKS_NAMA = 24;

// Panel Profil: identitas, ubah nama tampilan & bio (akun Google), info akun,
// jatah tamu, dan pengaturan. Bio disimpan di profiles/{uid}.
export function initProfil(ctx) {
  const { db } = ctx;
  const $ = (id) => document.getElementById(id);

  const avatarBox = $("profil-avatar");
  const namaEl = $("profil-nama");
  const chip = $("profil-status");
  const emailEl = $("profil-email");
  const bioEl = $("profil-bio");

  const tamuKartu = $("profil-tamu");
  const editKartu = $("profil-edit-kartu");
  const form = $("profil-form");
  const namaWrap = $("profil-nama-wrap");
  const namaInput = $("profil-nama-input");
  const namaAdmin = $("profil-nama-admin");
  const bioInput = $("profil-bio-input");
  const bioHitung = $("profil-bio-hitung");
  const simpanBtn = $("profil-simpan");
  const kabarEl = $("profil-kabar");

  const infoJenis = $("info-jenis");
  const infoEmailBaris = $("info-email-baris");
  const infoEmail = $("info-email");
  const infoId = $("info-id");
  const salinBtn = $("info-salin");
  const infoGabung = $("info-gabung");
  const infoMasuk = $("info-masuk");

  const limitKartu = $("profil-limit");
  const limitPesan = $("limit-pesan");
  const limitPesanBar = $("limit-pesan-bar");
  const limitNama = $("limit-nama");
  const limitNamaBar = $("limit-nama-bar");

  const temaSwitch = $("profil-tema");
  const adminBaris = $("profil-admin-baris");
  const akunBtn = $("profil-akun-btn");
  const akunInfo = $("profil-akun-info");

  let stopBio = null;
  let bio = "";
  const kotor = { nama: false, bio: false }; // sedang diedit, jangan ditimpa data baru

  // ===== Bio (profiles/{uid}) =====
  function setUser(user) {
    if (stopBio) stopBio();
    stopBio = null;
    bio = "";
    kotor.nama = false;
    kotor.bio = false;
    bioInput.value = "";
    namaInput.value = "";
    kabar("");

    if (user && !user.isAnonymous) {
      stopBio = onValue(
        ref(db, `profiles/${user.uid}`),
        (snap) => {
          bio = snap.val()?.bio || "";
          render();
        },
        (err) => console.warn("Gagal membaca bio:", err.code || err.message),
      );
    }
    render();
  }

  function kabar(teks, galat = false) {
    kabarEl.textContent = teks;
    kabarEl.classList.toggle("galat", galat);
  }

  function hitungBio() {
    bioHitung.textContent = `${bioInput.value.length}/${MAKS_BIO}`;
  }

  namaInput.addEventListener("input", () => {
    kotor.nama = true;
    kabar("");
  });
  bioInput.addEventListener("input", () => {
    kotor.bio = true;
    hitungBio();
    kabar("");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = ctx.user();
    if (!user || user.isAnonymous) return;

    const adminAktif = ctx.status() === "admin";
    const namaBaru = namaInput.value.trim().slice(0, MAKS_NAMA);
    const bioBaru = bioInput.value.trim().slice(0, MAKS_BIO);

    simpanBtn.disabled = true;
    kabar("Menyimpan...");
    try {
      if (!adminAktif && namaBaru !== ctx.namaKustom()) {
        await ctx.simpanNama(namaBaru);
      }
      if (bioBaru !== bio) {
        const r = ref(db, `profiles/${user.uid}`);
        if (bioBaru) await set(r, { bio: bioBaru, at: serverTimestamp() });
        else await remove(r);
      }
      kotor.nama = false;
      kotor.bio = false;
      kabar("Tersimpan.");
    } catch (err) {
      console.error("Gagal menyimpan profil:", err);
      kabar(
        err.code === "PERMISSION_DENIED"
          ? "Tidak diizinkan. Pastikan database.rules.json terbaru sudah di-deploy dan akunmu tidak diblokir."
          : "Gagal menyimpan: " + (err.code || err.message),
        true,
      );
    } finally {
      simpanBtn.disabled = false;
      render();
    }
  });

  // ===== Aksi kecil =====
  salinBtn.addEventListener("click", async () => {
    const uid = ctx.user()?.uid;
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      salinBtn.textContent = "Tersalin";
    } catch {
      salinBtn.textContent = "Gagal menyalin";
    }
    setTimeout(() => (salinBtn.textContent = "Salin ID"), 1800);
  });

  $("profil-buka-admin").addEventListener("click", () => ctx.bukaAdmin());
  $("profil-buka-admin-2").addEventListener("click", () => ctx.bukaAdmin());
  $("profil-login").addEventListener("click", () => ctx.login());
  akunBtn.addEventListener("click", () => ctx.login());
  temaSwitch.addEventListener("click", () => ctx.gantiTema());

  // Saklar mode gelap ikut berubah kalau tema diganti dari tombol lain
  function sinkronTema() {
    temaSwitch.setAttribute(
      "aria-checked",
      String(document.documentElement.dataset.theme === "dark"),
    );
  }
  new MutationObserver(sinkronTema).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  sinkronTema();

  // ===== Render =====
  function setMeter(teksEl, barEl, sisa, maks) {
    teksEl.textContent = `${sisa} dari ${maks}`;
    barEl.style.width = `${maks ? Math.round((sisa / maks) * 100) : 0}%`;
    barEl.classList.toggle("rendah", maks > 0 && sisa / maks <= 0.2);
  }

  let avatarKunci = "";

  function render() {
    const user = ctx.user();
    if (!user) return;
    const google = !user.isAnonymous;
    const status = ctx.status();
    const nama = ctx.nama();

    // Identitas
    const foto = fotoAkun(user);
    const kunci = [nama, user.uid, foto].join("|");
    if (kunci !== avatarKunci) {
      avatarKunci = kunci;
      avatarBox.replaceChildren(
        buatAvatar(nama, user.uid, { ukuran: "xl", foto }),
      );
    }
    namaEl.textContent = nama || "Tanpa nama";

    const label = { admin: "Admin", user: "User", anon: "Tamu" }[status] || "";
    chip.hidden = !label;
    chip.textContent = label;
    chip.classList.toggle("admin", status === "admin");

    const email = google
      ? user.email || user.providerData?.find((p) => p.email)?.email || ""
      : "";
    emailEl.textContent = google ? email : "Masuk sebagai tamu";
    emailEl.hidden = !emailEl.textContent;

    bioEl.hidden = !google;
    bioEl.classList.toggle("kosong", !bio);
    bioEl.textContent = bio || "Belum ada bio.";

    // Ubah profil: hanya akun Google
    tamuKartu.hidden = google;
    editKartu.hidden = !google;
    if (google) {
      const adminAktif = status === "admin";
      namaWrap.hidden = adminAktif;
      namaAdmin.hidden = !adminAktif;
      namaInput.placeholder = ctx.namaGoogle() || "Nama tampilan";
      if (!kotor.nama && document.activeElement !== namaInput) {
        namaInput.value = ctx.namaKustom();
      }
      if (!kotor.bio && document.activeElement !== bioInput) {
        bioInput.value = bio;
      }
      hitungBio();
    }

    // Info akun
    infoJenis.textContent = google ? "Akun Google" : "Tamu (anonim)";
    infoEmailBaris.hidden = !email;
    infoEmail.textContent = email;
    infoId.textContent = user.uid.slice(0, 6);
    infoGabung.textContent = tanggalPanjang(user.metadata?.creationTime);
    infoMasuk.textContent = tanggalPanjang(user.metadata?.lastSignInTime);

    // Jatah tamu
    limitKartu.hidden = google;
    if (!google) {
      const l = ctx.limit();
      setMeter(limitPesan, limitPesanBar, l.pesan.sisa, l.pesan.maks);
      setMeter(limitNama, limitNamaBar, l.nama.sisa, l.nama.maks);
    }

    // Pengaturan
    adminBaris.hidden = status !== "admin";
    akunBtn.textContent = google ? "Keluar" : "Login dengan Google";
    akunBtn.classList.toggle("utama", !google);
    akunBtn.classList.toggle("biasa", google);
    akunInfo.textContent = google
      ? "Setelah keluar kamu kembali jadi tamu."
      : "Untuk kirim foto atau file dan pesan tanpa batas.";
  }

  return { segarkan: render, setUser };
}
