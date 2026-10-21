// Login Google lewat Google Identity Services (GIS), tanpa halaman
// /__/auth/handler. Dipakai saat situs di-host di luar Firebase Hosting
// (mis. GitHub Pages), di mana popup/redirect Firebase gagal di browser HP
// yang memisahkan storage per domain (Brave, Safari, Chrome terbaru).
//
// Alur: tampilkan tombol resmi Google -> user tap -> Google mengirim ID token
// -> token ditukar jadi sesi Firebase lewat signInWithCredential (di main.js).

const GSI_SRC = "https://accounts.google.com/gsi/client";
let gsiPromise = null;

function muatGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        gsiPromise = null;
        reject(new Error("gsi-load-failed"));
      };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

// Menampilkan kotak kecil berisi tombol "Sign in with Google".
// Mengembalikan Promise<string> berisi ID token, atau reject kalau dibatalkan.
export async function mintaIdTokenGoogle(clientId) {
  await muatGsi();

  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.className = "gl-overlay";
    overlay.innerHTML =
      '<div class="gl-card" role="dialog" aria-modal="true">' +
      '<p class="gl-judul">Masuk dengan Google</p>' +
      '<div class="gl-tombol"></div>' +
      '<button type="button" class="gl-batal">Batal</button>' +
      "</div>";
    document.body.appendChild(overlay);

    const tutup = () => overlay.remove();
    const batal = () => {
      tutup();
      const e = new Error("dibatalkan");
      e.code = "auth/popup-closed-by-user";
      reject(e);
    };

    overlay.querySelector(".gl-batal").addEventListener("click", batal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) batal();
    });

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: false,
      callback: (resp) => {
        tutup();
        if (resp?.credential) resolve(resp.credential);
        else reject(new Error("no-credential"));
      },
    });
    window.google.accounts.id.renderButton(
      overlay.querySelector(".gl-tombol"),
      { type: "standard", theme: "outline", size: "large", shape: "pill", text: "signin_with", width: 260 },
    );
  });
}


// ===== Alur REDIRECT (untuk HP) =====
// Popup GIS sering menghasilkan "400. That's an error" di browser HP (Brave,
// Chrome, dll). Solusinya: pindah ke halaman login Google satu tab penuh, lalu
// Google mengembalikan ID token lewat bagian # di alamat (implicit flow).
// Tidak ada popup, iframe, atau cookie pihak ketiga yang bisa diblokir.
//
// PENTING: alamat balik (redirect URI) harus didaftarkan di Google Cloud
// Console -> APIs & Services -> Credentials -> Web client -> Authorized
// redirect URIs. Lihat alamatnya dengan alamatBalikGoogle().

const KUNCI_LOGIN = "gl_login_state";

export function alamatBalikGoogle() {
  // Contoh: https://maestroo12.github.io/chat-global/
  return location.origin + location.pathname.replace(/index\.html$/, "");
}

function acak(panjang = 32) {
  const b = new Uint8Array(panjang);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function simpanSementara(nilai) {
  const j = JSON.stringify(nilai);
  try { sessionStorage.setItem(KUNCI_LOGIN, j); } catch {}
  try { localStorage.setItem(KUNCI_LOGIN, j); } catch {}
}

function bacaSementara() {
  for (const st of [() => sessionStorage, () => localStorage]) {
    try {
      const v = st().getItem(KUNCI_LOGIN);
      if (v) return JSON.parse(v);
    } catch {}
  }
  return null;
}

function hapusSementara() {
  try { sessionStorage.removeItem(KUNCI_LOGIN); } catch {}
  try { localStorage.removeItem(KUNCI_LOGIN); } catch {}
}

// Pindah ke halaman login Google (halaman ini akan ditinggalkan).
export function mulaiLoginRedirectGoogle(clientId) {
  const nonce = acak();
  const state = acak(16);
  // Setelah login, kembali ke panel yang sedang dibuka (default: chat)
  const kembali = /^#\/[\w-]+$/.test(location.hash) ? location.hash : "#/chat";
  simpanSementara({ nonce, state, kembali, waktu: Date.now() });

  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: alamatBalikGoogle(),
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    state,
    prompt: "select_account",
  });
  location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + q);
}

// Dipanggil SEKALI saat halaman dimuat, sebelum router (nav.js) jalan.
// Kalau halaman ini baru kembali dari Google, ambil token/errornya dari # lalu
// bersihkan alamat. Mengembalikan null kalau bukan hasil login Google.
export function ambilHasilRedirectGoogle() {
  const h = location.hash;
  if (!/^#(.*&)?(id_token|error)=/.test(h)) return null;

  const params = new URLSearchParams(h.slice(1));
  const tersimpan = bacaSementara();
  hapusSementara();

  // Bersihkan token dari alamat & riwayat, kembali ke panel sebelumnya
  history.replaceState(null, "", location.pathname + location.search + (tersimpan?.kembali || "#/chat"));

  if (params.get("error")) {
    return { error: params.get("error") };
  }
  if (!tersimpan || !params.get("state") || params.get("state") !== tersimpan.state) {
    return { error: "state-tidak-cocok" };
  }
  return { idToken: params.get("id_token"), nonce: tersimpan.nonce };
}
