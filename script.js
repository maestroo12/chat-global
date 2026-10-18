import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  remove,
  update
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

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

// ===== DOM =====
const messagesDiv = document.getElementById("messages");
const input = document.getElementById("message-input");
const nameInput = document.getElementById("user-name");
const sendBtn = document.getElementById("send-btn");
const onlineStatus = document.getElementById("online-status");

// ===== RENDER PESAN =====
function renderPesan(data) {
  const msg = document.createElement("div");
  msg.classList.add("msg");

  const name = document.createElement("span");
  name.classList.add("msg-name");
  name.textContent = `${data.name} : `;

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

// ===== KIRIM PESAN =====
function kirimPesan() {
  const text = input.value.trim();
  const name = nameInput.value.trim() || "Anon";
  if (!text) return;

  push(chatRef, {
    name,
    text,
    timestamp: Date.now()
  });

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

// ===== STATUS ONLINE (REAL-TIME) =====
const userId = localStorage.getItem("chatUserId") || crypto.randomUUID();
localStorage.setItem("chatUserId", userId);
const userRef = ref(db, `users/${userId}`);

// Tandai online
update(ref(db), {
  [`users/${userId}`]: {
    name: nameInput.value.trim() || "Anonymous",
    online: true,
    lastSeen: Date.now()
  }
});

// Heartbeat: update lastSeen tiap 30 detik (biar nggak "mati" pas tab idle)
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
      // Hitung yang lastSeen-nya < 60 detik lalu
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