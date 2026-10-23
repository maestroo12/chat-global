import { el, buatAvatar, waktuRingkas } from "./ui.js";

const MAKS_ONLINE = 5;
const JUMLAH_PESAN = 4;

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
      n.points.slice(0, 2).map((p) => el("li", { text: p })),
    ),
  );

  // Render ulang hanya kalau datanya benar-benar berubah (hindari bangun ulang
  // avatar & baca foto berulang tiap ada sinyal segarkan).
  let kunciPesan = "";
  let kunciOnline = "";

  function renderPesan() {
    const daftar = ctx.pesanTerbaru(JUMLAH_PESAN);
    const kunci = daftar
      .map((p) => [p.key, p.nama, p.teks, p.ts, p.baru ? 1 : 0, p.verified ? 1 : 0].join("\u0001"))
      .join("\u0002");
    if (kunci === kunciPesan) return;
    kunciPesan = kunci;
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
    const kunci = online
      .slice(0, MAKS_ONLINE)
      .map((o) => [o.uid, o.nama, o.saya ? 1 : 0, o.admin ? 1 : 0].join("\u0001"))
      .join("\u0002") + "|" + online.length;
    if (kunci === kunciOnline) return;
    kunciOnline = kunci;
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
    const belum = ctx.belumBaca();
    sub.textContent = belum > 0 ? `${belum} pesan di chat global belum kamu baca.` : "";
    sub.hidden = belum <= 0;

    // Ajakan login ringkas (jatah tamu ada di Profil, tidak diulang di sini)
    tamu.hidden = google;
    if (!google) {
      tamuInfo.textContent =
        "Kamu masuk sebagai tamu. Login Google untuk kirim foto/file dan pesan tanpa batas.";
    }

    renderPesan();
    renderOnline(online);
  }

  return { segarkan: render };
}
