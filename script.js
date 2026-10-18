import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  get,
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
const MAX_ANON = 30; // batas pesan untuk tamu (anonymous)
const MAX_MESSAGES = 10; // jumlah pesan yang disimpan di database

let currentUser = null;
let semuaPesan = [];
let listenerAktif = false;
let heartbeat = null;
let stopPantauSisa = null;

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

// ===== SISA PESAN TAMU =====
function pantauSisa(user) {
  if (stopPantauSisa) stopPantauSisa();
  stopPantauSisa = null;

  if (isGoogle(user)) {
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = "Ketik pesan";
    return;
  }

  stopPantauSisa = onValue(ref(db, `msgCount/${user.uid}`), (snap) => {
    const sisa = MAX_ANON - (snap.val() || 0);
    if (sisa <= 0) {
      input.disabled = true;
      sendBtn.disabled = true;
      input.placeholder = "Batas 30 pesan tamu habis. Login Google untuk lanjut.";
    } else {
      input.disabled = false;
      sendBtn.disabled = false;
      input.placeholder = `Ketik pesan (sisa ${sisa})`;
    }
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
    ? currentUser.displayName || "Pengguna Google"
    : nameInput.value.trim() || "Tamu";

  const key = push(chatRef).key;
  const pesan = { name, text, uid, timestamp: Date.now() };
  if (google) pesan.verified = true;

  const updates = { [`chat/${key}`]: pesan };

  // Tamu: pesan dan penghitung ditulis bersamaan (atomik) supaya batasnya tidak bisa dilewati
  if (!google) {
    const snap = await get(ref(db, `msgCount/${uid}`));
    const terpakai = snap.val() || 0;
    if (terpakai >= MAX_ANON) return;
    updates[`msgCount/${uid}`] = terpakai + 1;
  }

  try {
    await update(ref(db), updates);
    input.value = "";
    input.focus();
    hapusPesanLama();
  } catch (err) {
    console.error("Pesan gagal terkirim:", err);
    alert("Pesan gagal terkirim. Coba lagi.");
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
    : nameInput.value.trim() || "Tamu";

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
    signInAnonymously(auth).catch((err) => console.error("Anonymous gagal:", err));
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