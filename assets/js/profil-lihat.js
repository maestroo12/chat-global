import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import { el, buatAvatar, waktuRingkas } from "./ui.js";
import { muatFoto, urlFoto } from "./foto.js";

export function initProfilLihat(ctx) {
  const wadah = document.getElementById("profil-lihat");
  const body = document.getElementById("lihat-body");
  const tutupBtn = document.getElementById("lihat-close");
  const lightbox = document.getElementById("lightbox");

  let seq = 0;
  let pemicu = null;

  function tutup() {
    if (wadah.hidden) return;
    seq++;
    wadah.hidden = true;
    body.replaceChildren();
    pemicu?.focus?.();
    pemicu = null;
  }

  function barisStatus() {
    return el("span", { class: "lihat-status" });
  }

  function isiStatus(elStatus, uid) {
    const { online, lastSeen } = ctx.online(uid);
    elStatus.replaceChildren(
      el("span", { class: "lihat-dot" + (online ? " aktif" : "") }),
      el("span", {
        text: online
          ? "Online"
          : lastSeen
            ? "Terakhir online " + waktuRingkas(lastSeen)
            : "Offline",
      }),
    );
  }

  async function buka(uid, { nama, verified, dari }) {
    const saya = ++seq;
    pemicu = dari || null;

    const admin = ctx.isAdmin(uid);
    const kamu = uid === ctx.user()?.uid;
    const tampilNama = ctx.namaUntuk(uid, nama) || nama || "Tanpa nama";
    const pasti = admin ? true : verified;

    const avatar = buatAvatar(tampilNama, uid, {
      ukuran: "xl",
      verified: pasti,
    });
    const avatarBox = el("div", { class: "lihat-avatar" }, avatar);
    avatarBox.addEventListener("click", () => {
      const url = urlFoto(uid);
      if (url) ctx.bukaFoto(url);
    });

    const chip = el("span", {
      class: "chip" + (admin ? " admin" : ""),
      text: admin ? "Admin" : "Memuat...",
    });
    const status = barisStatus();
    isiStatus(status, uid);
    const bioEl = el("p", { class: "profil-bio kosong", hidden: true });

    const isi = [
      avatarBox,
      el("h3", {
        class: "profil-nama",
        text: tampilNama + (kamu ? " (kamu)" : ""),
      }),
      chip,
      status,
      bioEl,
    ];
    if (kamu && !ctx.user()?.isAnonymous) {
      isi.push(
        el("button", {
          type: "button",
          class: "btn biasa lihat-aksi",
          text: "Ubah profilku",
          onclick: () => {
            tutup();
            ctx.keProfil();
          },
        }),
      );
    }
    body.replaceChildren(...isi);
    wadah.hidden = false;
    tutupBtn.focus();

    const [url, bioSnap] = await Promise.all([
      muatFoto(uid, { segar: true }),
      get(ref(ctx.db, `profiles/${uid}`)).catch(() => null),
    ]);
    if (saya !== seq) return;

    const bio = bioSnap?.val()?.bio || "";
    const google = admin || pasti === true || !!bio || !!url;
    const jenis = admin
      ? "Admin"
      : google
        ? "Akun Google"
        : pasti === false
          ? "Tamu"
          : "Pengguna";
    chip.textContent = jenis;
    avatarBox.classList.toggle("zoom", !!url);

    bioEl.hidden = jenis === "Tamu";
    bioEl.textContent = bio || "Belum ada bio.";
    bioEl.classList.toggle("kosong", !bio);
    isiStatus(status, uid);
  }

  // Ketuk foto profil di mana pun. Fase capture, supaya tidak ikut memicu tombol/baris
  // yang membungkusnya (mis. baris pesan di Beranda yang membuka Chat).
  function avatarDari(e) {
    return e.target.closest?.('.avatar[data-buka="1"]') || null;
  }

  function bukaDari(a) {
    const v = a.dataset.verified;
    buka(a.dataset.uid, {
      nama: a.dataset.nama,
      verified: v === "1" ? true : v === "0" ? false : undefined,
      dari: a,
    });
  }

  document.addEventListener(
    "click",
    (e) => {
      const a = avatarDari(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      bukaDari(a);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !wadah.hidden && lightbox.hidden) {
        tutup();
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      const a = avatarDari(e);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      bukaDari(a);
    },
    true,
  );

  tutupBtn.addEventListener("click", tutup);
  wadah.querySelector("[data-tutup-lihat]").addEventListener("click", tutup);

  return { buka, tutup };
}
