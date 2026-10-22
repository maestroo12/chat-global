import { el, buatAvatar, waktuRingkas } from "./ui.js";

const MAKS_ONLINE = 8;
const JUMLAH_PESAN = 5;

// Panel Beranda: sapaan, obrolan terbaru, siapa yang online, dan pembaruan.
// Semua data datang dari main.js lewat `ctx` (panel ini tidak menyentuh Firebase).
export function initBeranda(ctx) {
  const $ = (id) => document.getElementById(id);
  const judul = $("beranda-judul");
  const sub = $("beranda-sub");
  const tamu = $("beranda-tamu");
  const tamuInfo = $("beranda-tamu-info");
  const feed = $("beranda-pesan");
  const onlineJumlah = $("beranda-online-jumlah");
  const onlineList = $("beranda-online");
  const berita = $("beranda-news");
  const beritaBuka = $("beranda-news-buka");

  $("beranda-login").addEventListener("click", () => ctx.login());
  beritaBuka.addEventListener("click", () => ctx.bukaNews(beritaBuka));

  // Pembaruan terbaru: cukup dirender sekali
  const n = ctx.news();
  berita.replaceChildren(
    el("p", { class: "mini-judul", text: n.title }),
    el(
      "ul",
      { class: "poin" },
      n.points.slice(0, 3).map((p) => el("li", { text: p })),
    ),
  );

  function renderPesan() {
    const daftar = ctx.pesanTerbaru(JUMLAH_PESAN);
    if (!daftar.length) {
      feed.replaceChildren(
        el("li", {
          class: "kosong",
          text: "Belum ada pesan. Mulai obrolan di chat global.",
        }),
      );
      return;
    }
    feed.replaceChildren(
      ...daftar.map((p) =>
        el(
          "li",
          {},
          el(
            "button",
            { type: "button", class: "feed-row", "data-nav": "chat" },
            buatAvatar(p.nama, p.uid, { buka: true, verified: p.verified }),
            el(
              "span",
              { class: "feed-isi" },
              el(
                "span",
                { class: "feed-atas" },
                el("span", { class: "feed-nama", text: p.nama }),
                el("span", { class: "feed-waktu", text: waktuRingkas(p.ts) }),
                !!p.baru && el("span", { class: "titik-baru", title: "Belum dibaca" }),
              ),
              el("span", { class: "feed-teks", text: p.teks }),
            ),
          ),
        ),
      ),
    );
  }

  function renderOnline(online) {
    onlineJumlah.textContent = String(online.length);
    if (!online.length) {
      onlineList.replaceChildren(
        el("li", { class: "kosong", text: "Tidak ada yang online." }),
      );
      return;
    }
    const baris = online.slice(0, MAKS_ONLINE).map((o) =>
      el(
        "li",
        { class: "online-row" },
        buatAvatar(o.nama, o.uid, { ukuran: "sm", buka: true }),
        el("span", { class: "online-nama", text: o.nama }),
        o.saya && el("span", { class: "tag", text: "Kamu" }),
        !o.saya && !!o.admin && el("span", { class: "tag admin", text: "Admin" }),
      ),
    );
    if (online.length > MAKS_ONLINE) {
      baris.push(
        el("li", {
          class: "kosong",
          text: `dan ${online.length - MAKS_ONLINE} lainnya`,
        }),
      );
    }
    onlineList.replaceChildren(...baris);
  }

  function render() {
    if (!ctx.user()) return;
    const google = ctx.isGoogle();
    const nama = ctx.nama();
    judul.textContent = nama ? `Halo, ${nama}` : "Halo!";

    const online = ctx.online();
    const lain = online.filter((o) => !o.saya).length;
    const belum = ctx.belumBaca();
    const kalimat = [
      lain === 0
        ? "Belum ada orang lain yang online."
        : `${lain} orang lain sedang online.`,
    ];
    if (belum > 0) kalimat.push(`${belum} pesan di chat global belum kamu baca.`);
    sub.textContent = kalimat.join(" ");

    tamu.hidden = google;
    if (!google) {
      const l = ctx.limit();
      tamuInfo.textContent =
        "Login Google untuk kirim foto atau file, kirim pesan tanpa batas, " +
        `dan dapat centang terverifikasi. Sisa pesan tamu hari ini: ${l.pesan.sisa} dari ${l.pesan.maks}.`;
    }

    renderPesan();
    renderOnline(online);
  }

  return { segarkan: render };
}
