import { buatAvatar } from "./ui.js";

// Perpindahan antar panel (Beranda / Chat / Profil, dan nanti panel lain).
//
// Cara menambah panel baru:
//   1. Di index.html, tambah <section class="panel" data-panel="nama-panel" aria-label="...">
//   2. Tambah tombol di menu: <button class="nav-item" data-nav="nama-panel">
//   3. Selesai. Alamat otomatis jadi #/nama-panel, dan tombol apa pun dengan
//      atribut data-nav="nama-panel" (di dalam panel mana pun) akan membukanya.
//
// Panel yang tidak aktif disembunyikan dengan visibility (bukan display:none),
// supaya posisi scroll dan isi chat tidak hilang saat pindah panel.
export function initNav({ onPindah } = {}) {
  const panel = [...document.querySelectorAll(".panel[data-panel]")];
  const ids = panel.map((p) => p.dataset.panel);
  const item = [...document.querySelectorAll(".nav-item[data-nav]")];
  const awal = ids[0];
  let aktif = null;

  const dariHash = () => {
    const m = location.hash.match(/^#\/?([\w-]+)/);
    return m && ids.includes(m[1]) ? m[1] : null;
  };

  function tampil(id) {
    if (!ids.includes(id)) id = awal;
    if (id === aktif) return;
    const sebelum = aktif;
    aktif = id;

    for (const p of panel) {
      const on = p.dataset.panel === id;
      p.classList.toggle("aktif", on);
      p.inert = !on;
    }
    for (const b of item) {
      if (b.dataset.nav === id) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }

    const label = panel
      .find((p) => p.dataset.panel === id)
      ?.getAttribute("aria-label");
    document.title = label
      ? `${label} · FitChat (Fitnah Chat)`
      : "FitChat (Fitnah Chat)";

    onPindah?.(id, sebelum);
  }

  function pindah(id) {
    if (!ids.includes(id)) return;
    if (location.hash === `#/${id}`) tampil(id);
    else location.hash = `#/${id}`; // memicu hashchange -> tampil()
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-nav]");
    if (t) pindah(t.dataset.nav);
  });
  window.addEventListener("hashchange", () => tampil(dariHash() || awal));

  const mula = dariHash() || awal;
  if (location.hash !== `#/${mula}`) {
    history.replaceState(null, "", `#/${mula}`);
  }
  tampil(mula);

  // Deteksi keyboard layar (HP): tinggi area tampil mengecil drastis. Saat itu
  // menu bawah disembunyikan lewat class "keyboard" di <html>.
  let tinggiMax = 0;
  let lebarTerakhir = 0;
  function cekKeyboard() {
    const h = window.visualViewport?.height || window.innerHeight;
    if (window.innerWidth !== lebarTerakhir) {
      lebarTerakhir = window.innerWidth; // rotasi layar: hitung ulang
      tinggiMax = 0;
    }
    tinggiMax = Math.max(tinggiMax, h);
    document.documentElement.classList.toggle("keyboard", h < tinggiMax * 0.75);
  }
  window.addEventListener("resize", cekKeyboard);
  window.visualViewport?.addEventListener("resize", cekKeyboard);
  cekKeyboard();

  // Angka kecil di tombol menu (mis. pesan chat yang belum dibaca)
  function setBadge(id, n) {
    document.querySelectorAll(`[data-badge="${id}"]`).forEach((b) => {
      b.hidden = !(n > 0);
      b.textContent = n > 99 ? "99+" : String(n);
    });
  }

  // Kartu akun kecil di bagian bawah menu samping
  const akunAvatar = document.getElementById("nav-akun-avatar");
  const akunNama = document.getElementById("nav-akun-nama");
  const akunStatus = document.getElementById("nav-akun-status");
  let akunKunci = "";

  function setAkun({ nama, uid, foto, status }) {
    const kunci = [nama, uid, foto].join("|");
    if (kunci !== akunKunci) {
      akunKunci = kunci;
      akunAvatar.replaceChildren(buatAvatar(nama, uid, { ukuran: "sm", foto }));
    }
    akunNama.textContent = nama || "Tamu";
    akunStatus.textContent =
      { admin: "Admin", user: "Akun Google", anon: "Tamu" }[status] || "";
  }

  return { pindah, aktif: () => aktif, setBadge, setAkun };
}
