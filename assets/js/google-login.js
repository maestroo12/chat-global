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
