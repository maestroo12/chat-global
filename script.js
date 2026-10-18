import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  remove,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup
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

// ===== DOM =====
const messagesDiv = document.getElementById("messages");
const input = document.getElementById("message-input");
const nameInput = document.getElementById("user-name");
const sendBtn = document.getElementById("send-btn");
const onlineStatus = document.getElementById("online-status");
const loginBtn = document.getElementById("login-btn");

// ===== RENDER PESAN =====
function renderPesan(data) {
  const msg = document.createElement("div");
  msg.classList.add("msg");

  const name = document.createElement("span");
  name.classList.add("msg-name");
  name.textContent = `${data.name}: `;

  const text = document.createElement("span");
  text.classList.add("msg-text");
  text.textContent = data.text;

  const time = document.createElement("small");
  time.classList.add("msg-time");
  if (data.timestamp) {
    time.textContent = new Date(data.timestamp).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  msg.appendChild(name);
  msg.appendChild(text);
  msg.appendChild(time);
  messagesDiv.appendChild(msg);
}

// ===== MUAT DARI CACHE =====
function muatCache() {
  const cached = localStorage.getItem("chatCache");
  if (cached) {
    const messages = JSON.parse(cached);
    messages.forEach((data) => renderPesan(data));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

function simpanCache(messages) {
  localStorage.setItem("chatCache", JSON.stringify(messages));
}

muatCache();

// ===== REAL-TIME LISTENER (PESAN) =====
onValue(chatRef, (snapshot) => {
  const data = snapshot.val();
  messagesDiv.innerHTML = "";

  if (!data) return;

  const messages = Object.values(data);
  messages.sort((a, b) => a.timestamp - b.timestamp);

  const cached = [];
  messages.forEach((msg) => {
    renderPesan(msg);
    cached.push({
      name: msg.name,
      text: msg.text,
      timestamp: msg.timestamp
    });
  });

  simpanCache(cached);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// ===== LIMIT PESAN =====
const MAX_MESSAGES = 10;

function hapusPesanLama() {
  onValue(chatRef, (snapshot) => {
    const messages = snapshot.val();
    if (!messages) return;

    const keys = Object.keys(messages);
    if (keys.length <= MAX_MESSAGES) return;

    const sorted = keys.sort((a, b) => {
      return messages[a].timestamp - messages[b].timestamp;
    });

    const toDelete = sorted.slice(0, keys.length - MAX_MESSAGES);
    toDelete.forEach((key) => {
      remove(ref(db, `chat/${key}`));
    });
  }, { onlyOnce: true });
}

// ===== KIRIM PESAN =====
function kirimPesan() {
  const text = input.value.trim();
  const name = nameInput.value.trim() || "Tanpa nama";
  if (!text) return;

  push(chatRef, {
    name,
    text,
    timestamp: Date.now()
  });

  hapusPesanLama();

  input.value = "";
  input.focus();
}

sendBtn.addEventListener("click", kirimPesan);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") kirimPesan();
});

// ===== SAVE NAMA =====
const savedName = localStorage.getItem("chatName");
if (savedName) nameInput.value = savedName;

nameInput.addEventListener("change", () => {
  localStorage.setItem("chatName", nameInput.value.trim());
});

// ===== AUTH + STATUS ONLINE =====
const userId = localStorage.getItem("chatUserId") || crypto.randomUUID();
localStorage.setItem("chatUserId", userId);
const userRef = ref(db, `users/${userId}`);

// Default: anonymous
signInAnonymously(auth).then(() => {
  // Tandai online SETELAH auth berhasil
  update(ref(db), {
    [`users/${userId}`]: {
      name: nameInput.value.trim() || "Anon",
      online: true,
      lastSeen: Date.now()
    }
  });
});

// Heartbeat: update lastSeen tiap 30 detik
const heartbeat = setInterval(() => {
  update(userRef, { lastSeen: Date.now() });
}, 30000);

// Hitung online — real-time
onValue(usersRef, (snapshot) => {
  const data = snapshot.val();
  let count = 0;
  if (data) {
    const now = Date.now();
    Object.values(data).forEach((user) => {
      if (user.lastSeen && now - user.lastSeen < 60000) {
        count++;
      }
    });
  }
  onlineStatus.textContent = `🟢 ${count} Online`;
});

// Tandai offline
window.addEventListener("beforeunload", () => {
  clearInterval(heartbeat);
  remove(userRef);
});

// ===== LOGIN GOOGLE =====
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    const user = auth.currentUser;
    if (user && user.isAnonymous) {
      reauthenticateWithPopup(auth, googleProvider).then(() => {
        user.linkWithPopup(googleProvider).then(() => {
          console.log("Login Google berhasil!");
        });
      });
    } else {
      signInWithPopup(auth, googleProvider);
    }
  });
}

// Update nama pas login Google
onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous) {
    nameInput.value = user.displayName || "Anon";
    localStorage.setItem("chatName", nameInput.value);
  }
});   