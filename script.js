import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  get,
  set,
  serverTimestamp,
  onValue,
  remove,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

// ===== CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyDQYSoIuyWfHJYCMU8B0HAKFOkshiGCrXw",
  authDomain: "chat-globall.firebaseapp.com",
  databaseURL: "https://chat-globall-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-globall",
  storageBucket: "chat-globall.firebasestorage.app",
  messagingSenderId: "681085064123",
  appId: "1:681085064123:web:45edafbf44945ef5762a9e",
  measurementId: "G-KES6SEN37K"
};

// ===== INIT =====
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const chatRef = ref(db, "chat");
const usersRef = ref(db, "users");
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ===== DOM =====
const messagesDiv = document.getElementById("messages");
const input = document.getElementById("message-input");
const nameInput = document.getElementById("user-name");
const sendBtn = document.getElementById("send-btn");
const onlineStatus = document.getElementById("online-status");
const loginBtn = document.getElementById("login-btn");

// ===== STATE =====
const MAX_ANON = 30 // batas pesan tamu per 24 jam
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 50; // jumlah pesan yang disimpan di database

let currentUser = null;
let semuaPesan = [];
let listenerAktif = false;
let heartbeat = null;
let stopPantauSisa = null;
let timerLimit = null;
let limitData = null; // { count, start } milik perangkat ini
let aktifDevice = null;
let serverOffset = 0;

// ID perangkat: tetap sama walau logout / login Google / ganti akun anonim
function buatId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

let deviceId = localStorage.getItem("chatDeviceId");
if (!deviceId) {
  deviceId = buatId();
  localStorage.setItem("chatDeviceId", deviceId);
}

// Selisih jam server, supaya hitungan 24 jam tidak bergantung jam HP/laptop
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
  serverOffset = snap.val() || 0;
});

const isGoogle = (user) => !!user && !user.isAnonymous;

// ===== RENDER PESAN =====
function renderPesan(data) {
  const isMe = data.uid
    ? data.uid === currentUser?.uid
    : !isGoogle(currentUser) && data.name === nameInput.value.trim();

  const msg = document.createElement("div");
  msg.classList.add("msg");
  if (isMe) msg.classList.add("me");

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");

  if (!isMe) {
    const name = document.createElement("span");
    name.classList.add("msg-name");
    name.textContent = data.name;

    // Centang hanya untuk pesan dari akun Google (divalidasi oleh Database Rules)
    if (data.verified) {
      const badge = document.createElement("span");
      badge.classList.add("badge");
      badge.title = "Akun Google terverifikasi";
      badge.textContent = "✓";
      name.appendChild(badge);
    }
    bubble.appendChild(name);
  }

  const text = document.createElement("span");
  text.classList.add("msg-text");
  text.textContent = data.text;
  bubble.appendChild(text);

  const time = document.createElement("small");
  time.classList.add("msg-time");
  if (data.timestamp) {
    time.textContent = new Date(data.timestamp).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  bubble.appendChild(time);

  msg.appendChild(bubble);
  messagesDiv.appendChild(msg);
}

function renderSemua() {
  messagesDiv.innerHTML = "";
  semuaPesan.forEach(renderPesan);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ===== CACHE =====
function muatCache() {
  const cached = localStorage.getItem("chatCache");
  if (!cached) return;
  try {
    semuaPesan = JSON.parse(cached);
    renderSemua();
  } catch {
    localStorage.removeItem("chatCache");
  }
}

muatCache();

// ===== LISTENER (jalan setelah auth siap, karena Rules butuh login) =====
function mulaiListener() {
  if (listenerAktif) return;
  listenerAktif = true;

  onValue(
    chatRef,
    (snapshot) => {
      const data = snapshot.val();
      semuaPesan = data
        ? Object.values(data).sort((a, b) => a.timestamp - b.timestamp)
        : [];
      localStorage.setItem("chatCache", JSON.stringify(semuaPesan));
      renderSemua();
    },
    (err) => console.error("Gagal membaca chat:", err)
  );

  onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    let count = 0;
    if (data) {
      const now = Date.now();
      Object.values(data).forEach((user) => {
        if (user.lastSeen && now - user.lastSeen < 60000) count++;
      });
    }
    const dot = document.createElement("i");
    dot.classList.add("dot");
    onlineStatus.replaceChildren(dot, `${count} Online`);
  });
}

// ===== HAPUS PESAN LAMA =====
function hapusPesanLama() {
  onValue(
    chatRef,
    (snapshot) => {
      const messages = snapshot.val();
      if (!messages) return;

      const keys = Object.keys(messages);
      if (keys.length <= MAX_MESSAGES) return;

      keys
        .sort((a, b) => messages[a].timestamp - messages[b].timestamp)
        .slice(0, keys.length - MAX_MESSAGES)
        .forEach((key) => remove(ref(db, `chat/${key}`)));
    },
    { onlyOnce: true }
  );
}

// ===== LIMIT TAMU (per perangkat, 24 jam) =====
async function daftarkanPerangkat(user) {
  // Hubungkan akun anonim ini ke ID perangkat. Hanya bisa ditulis sekali per akun anonim.
  const mapRef = ref(db, `anonDevice/${user.uid}`);
  const snap = await get(mapRef);
  if (snap.exists()) {
    deviceId = snap.val();
    localStorage.setItem("chatDeviceId", deviceId);
    return deviceId;
  }
  await set(mapRef, deviceId);
  return deviceId;
}

function statusLimit() {
  const now = Date.now() + serverOffset;
  if (!limitData || now - limitData.start >= DAY_MS) {
    return { sisa: MAX_ANON };
  }
  return {
    sisa: MAX_ANON - limitData.count,
    bukaLagi: limitData.start + DAY_MS - now
  };
}

function terapkanLimit() {
  if (isGoogle(currentUser)) return;
  const st = statusLimit();

  if (st.sisa <= 0) {
    const jam = Math.max(1, Math.ceil(st.bukaLagi / 3600000));
    input.disabled = true;
    sendBtn.disabled = true;
    input.placeholder = `Limit chat lu habis. Coba tes ${jam} jam lagi, atau login Google.`;
  } else {
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = `Ketik pesan (sisa ${st.sisa})`;
  }
}

function pantauSisa(user) {
  if (stopPantauSisa) stopPantauSisa();
  stopPantauSisa = null;
  clearInterval(timerLimit);
  limitData = null;

  if (isGoogle(user)) {
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = "Ketik pesan";
    return;
  }

  daftarkanPerangkat(user)
    .then((dev) => {
      if (currentUser?.uid !== user.uid) return; // akun sudah berganti
      aktifDevice = dev;
      stopPantauSisa = onValue(ref(db, `deviceLimit/${dev}`), (snap) => {
        limitData = snap.val();
        terapkanLimit();
      });
      timerLimit = setInterval(terapkanLimit, 60000);
    })
    .catch((err) => {
      console.error("Gagal menyiapkan limit tamu:", err);
      input.placeholder = "Gagal menyiapkan chat: " + (err.code || err.message);
    });
}

// ===== KIRIM PESAN =====
async function kirimPesan() {
  if (!currentUser) return;
  const text = input.value.trim();
  if (!text) return;

  const google = isGoogle(currentUser);
  const uid = currentUser.uid;
  const name = google
    ? currentUser.displayName || ""
    : nameInput.value.trim() || "Orang Asing";

  const key = push(chatRef).key;
  const pesan = { name, text, uid, timestamp: Math.round(Date.now() + serverOffset) };
  if (google) pesan.verified = true;

  const updates = { [`chat/${key}`]: pesan };

  // Tamu: pesan dan penghitung perangkat ditulis bersamaan (atomik).
  // Database Rules menolak pesan tamu kalau penghitung tidak ikut naik.
  if (!google) {
    try {
      if (!aktifDevice) aktifDevice = await daftarkanPerangkat(currentUser);
      const snap = await get(ref(db, `deviceLimit/${aktifDevice}`));
      const lim = snap.val();
      const now = Date.now() + serverOffset;
      const path = `deviceLimit/${aktifDevice}`;

      if (!lim || now - lim.start >= DAY_MS) {
        updates[path] = { count: 1, start: serverTimestamp() };
      } else if (lim.count >= MAX_ANON) {
        limitData = lim;
        terapkanLimit();
        return;
      } else {
        updates[path] = { count: lim.count + 1, start: lim.start };
      }
    } catch (err) {
      console.error("Gagal cek limit Orang Asing:", err);
      alert("Gagal memeriksa batas pesan: " + (err.code || err.message));
      return;
    }
  }

  try {
    await update(ref(db), updates);
    input.value = "";
    input.focus();
    hapusPesanLama();
  } catch (err) {
    console.error("Pesan gagal terkirim:", err);
    alert("Pesan gagal terkirim: " + (err.code || err.message));
  }
}

sendBtn.addEventListener("click", kirimPesan);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") kirimPesan();
});

// ===== NAMA (hanya untuk tamu) =====
nameInput.addEventListener("change", () => {
  if (!isGoogle(currentUser)) {
    localStorage.setItem("chatName", nameInput.value.trim());
  }
});

// ===== PRESENCE =====
function mulaiPresence(user) {
  clearInterval(heartbeat);
  const userRef = ref(db, `users/${user.uid}`);
  const nama = isGoogle(user)
    ? user.displayName || "Pengguna Google"
    : nameInput.value.trim() || "Orang Asing";

  update(userRef, { name: nama, online: true, lastSeen: Date.now() });
  heartbeat = setInterval(() => {
    update(userRef, { lastSeen: Date.now() });
  }, 30000);
}

window.addEventListener("beforeunload", () => {
  clearInterval(heartbeat);
  if (currentUser) remove(ref(db, `users/${currentUser.uid}`));
});

// ===== LOGIN / LOGOUT GOOGLE =====
loginBtn.addEventListener("click", async () => {
  try {
    if (isGoogle(currentUser)) {
      await signOut(auth); // otomatis kembali jadi tamu
    } else {
      // Login langsung ke akun Google (bukan menempel ke akun anonim)
      await signInWithPopup(auth, googleProvider);
    }
  } catch (err) {
    console.error("Login gagal:", err);
    if (err.code !== "auth/popup-closed-by-user") {
      alert("Login gagal: " + err.code);
    }
  }
});

// ===== STATUS AUTH =====
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch((err) => {
      console.error("Anonymous gagal:", err);
      input.placeholder = "Gagal masuk sebagai Orang Asing: " + (err.code || err.message);
    });
    return;
  }

  currentUser = user;
  const google = isGoogle(user);

  // Akun Google: nama otomatis dari Google, kolom nama disembunyikan
  nameInput.hidden = google;
  if (!google) nameInput.value = localStorage.getItem("chatName") || "";
  loginBtn.textContent = google ? "Keluar" : "Login Google";

  mulaiListener();
  mulaiPresence(user);
  pantauSisa(user);
  renderSemua();
});