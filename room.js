// ===================== تهيئة Firebase =====================
const firebaseConfig = {
  apiKey: "AIzaSyA3vUkDU4rLDxcIfY0ZYXzvw8GznlG9gc8",
  authDomain: "bechar-8b049.firebaseapp.com",
  projectId: "bechar-8b049",
  storageBucket: "bechar-8b049.appspot.com",
  messagingSenderId: "394161915136",
  appId: "1:394161915136:web:23da8f9f82393f66af5fe5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'default-room';
const roomRef = db.collection('rooms').doc(roomId);

const roomCodeElement = document.getElementById('room-code');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const startRoundBtn = document.getElementById('start-round-btn');
const skipQuestionBtn = document.getElementById('skip-question-btn');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const typingIndicator = document.getElementById('typing-indicator');
const timerElement = document.getElementById('timer');
const timerContainer = document.getElementById('timer-container');

roomCodeElement.textContent = roomId;

let currentUser = null;
let typingTimeout = null;
let timerInterval = null;
let currentRoomData = null;
let chosenEmoji = null;
let chosenColor = "#d97706";

// ===================== تخصيص اللاعب =====================
const modal = document.getElementById("customize-modal");
const emojiBtns = document.querySelectorAll(".emoji-btn");
const colorPicker = document.getElementById("color-picker");
const saveCustomizationBtn = document.getElementById("save-customization");

emojiBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    chosenEmoji = btn.textContent;
    emojiBtns.forEach(b => b.classList.remove("ring-4", "ring-amber-500"));
    btn.classList.add("ring-4", "ring-amber-500");
  });
});
colorPicker.addEventListener("input", (e) => {
  chosenColor = e.target.value;
});
saveCustomizationBtn.addEventListener("click", async () => {
  if (!chosenEmoji) chosenEmoji = "🙂";
  modal.classList.add("hidden");
  await savePlayerData();
});

// ===================== انضمام للغرفة =====================
async function joinRoom() {
  currentUser = auth.currentUser;
  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }

  const snap = await roomRef.get();
  if (!snap.exists) {
    alert('هذه الغرفة غير موجودة!');
    window.location.href = 'index.html';
    return;
  }

  const data = snap.data();

  // لو ما فيه مضيف، عيّن هذا اللاعب
  if (!data.creator) {
    await roomRef.update({ creator: currentUser.uid });
  }

  // تحقق إذا اللاعب مسجل بالفعل
  const players = data.players || [];
  const exists = players.find(p => p.id === currentUser.uid);
  if (!exists) {
    modal.classList.remove("hidden"); // أظهر نافذة اختيار الإيموجي واللون
  }
}

async function savePlayerData() {
  const playerData = {
    id: currentUser.uid,
    name: currentUser.displayName || 'مستخدم',
    avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
    emoji: chosenEmoji,
    color: chosenColor
  };

  await roomRef.update({
    players: firebase.firestore.FieldValue.arrayUnion(playerData)
  });
}

// ===================== إرسال رسالة =====================
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  const isAnswer = currentRoomData?.currentQuestion &&
                   currentRoomData?.currentPlayer?.id === currentUser.uid;

  await roomRef.collection("chat").add({
    senderId: currentUser.uid,
    senderName: currentUser.displayName || 'مستخدم',
    senderAvatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
    senderEmoji: getPlayerEmoji(currentUser.uid),
    senderColor: getPlayerColor(currentUser.uid),
    type: isAnswer ? "answer" : "chat",
    question: isAnswer ? currentRoomData.currentQuestion : null,
    text: message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  chatInput.value = "";
  setTyping(false);
}

// ===================== جلب الإيموجي واللون =====================
function getPlayerEmoji(uid) {
  const players = currentRoomData?.players || [];
  const player = players.find(p => p.id === uid);
  return player?.emoji || "🙂";
}
function getPlayerColor(uid) {
  const players = currentRoomData?.players || [];
  const player = players.find(p => p.id === uid);
  return player?.color || "#333";
}

// ===================== مؤشر الكتابة =====================
function setTyping(isTyping) {
  if (!currentUser) return;
  roomRef.collection("typing").doc(currentUser.uid).set({
    name: currentUser.displayName || 'مستخدم',
    typing: isTyping,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ===================== المؤقت =====================
function startTimer(seconds) {
  clearInterval(timerInterval);
  let remaining = seconds;
  timerContainer.classList.remove('hidden');
  timerElement.textContent = remaining;

  timerInterval = setInterval(() => {
    remaining--;
    timerElement.textContent = remaining;
    if (remaining <= 5) {
      timerElement.classList.add('text-red-500', 'animate__animated', 'animate__pulse');
    }
    if (remaining <= 0) {
      clearInterval(timerInterval);
      endRound();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerContainer.classList.add('hidden');
  timerElement.classList.remove('text-red-500', 'animate__animated', 'animate__pulse');
  timerElement.textContent = '30';
}

// ===================== بدء وتخطي الجولة =====================
async function startRound() {
  const snap = await roomRef.get();
  const data = snap.data();

  if (data.creator && data.creator !== currentUser.uid) {
    alert('فقط المضيف يمكنه بدء الجولة.');
    return;
  }

  const players = data.players || [];
  const questions = data.questions || [];

  if (players.length < 2) {
    alert('يجب أن يكون هناك لاعبين على الأقل!');
    return;
  }

  const question = questions.length
    ? questions[Math.floor(Math.random() * questions.length)]
    : "سؤال افتراضي";

  let available = players;
  if (data.currentPlayer && data.currentPlayer.id) {
    available = players.filter(p => p.id !== data.currentPlayer.id);
    if (!available.length) available = players;
  }
  const randPlayer = available[Math.floor(Math.random() * available.length)];

  await roomRef.update({
    currentQuestion: question,
    currentPlayer: randPlayer,
    status: 'playing',
    questionStartTime: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function skipQuestion() {
  await roomRef.update({
    currentQuestion: null,
    currentPlayer: null,
    status: 'waiting'
  });
  stopTimer();
}

async function endRound() {
  await roomRef.update({
    status: 'waiting',
    currentQuestion: null,
    currentPlayer: null
  });
  stopTimer();
}

// ===================== الاستماع لحالة الغرفة =====================
roomRef.onSnapshot((doc) => {
  if (!doc.exists) return;
  currentRoomData = doc.data();
  const data = currentRoomData;

  // قائمة اللاعبين
  const players = data.players || [];
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = "";
  players.forEach(p => {
    playersList.innerHTML += `
      <div class="flex items-center space-x-3 bg-white p-3 rounded-lg shadow">
        <span style="font-size:20px">${p.emoji || "🙂"}</span>
        <span class="font-bold" style="color:${p.color || "#333"}">
          ${p.name} ${data.creator === p.id ? "(المضيف)" : ""}
        </span>
      </div>`;
  });
  document.getElementById('players-count').textContent = players.length;

  // تحديث السؤال الحالي
  document.getElementById('question-text').textContent =
    data.currentQuestion || "لم يتم اختيار سؤال بعد.";
  document.getElementById('current-player').textContent =
    data.currentPlayer?.name || "---";

  // المؤقت يظهر للجميع بشكل متزامن
  if (data.status === 'playing' && data.questionStartTime) {
    const startTime = data.questionStartTime.toDate().getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    const remaining = 30 - elapsed;
    if (remaining > 0) startTimer(remaining);
    else stopTimer();
  }
  if (data.status === 'waiting') {
    stopTimer();
  }
});

// ===================== الاستماع للرسائل =====================
roomRef.collection("chat").orderBy("timestamp")
  .onSnapshot((snap) => {
    const chatBox = document.getElementById('chat-messages');
    chatBox.innerHTML = "";
    snap.forEach(doc => {
      const msg = doc.data();
      const isMe = msg.senderId === currentUser?.uid;

      let content = "";
      if (msg.type === "answer") {
        content = `
          <div class="font-bold text-sm">${msg.senderEmoji || "🙂"} ${msg.senderName}</div>
          <div class="text-gray-600">❓ ${msg.question}</div>
          <div style="color:${msg.senderColor || "#333"}">💬 ${msg.text}</div>
        `;
      } else {
        content = `
          <div class="font-bold text-sm" style="color:${msg.senderColor || "#333"}">
            ${msg.senderEmoji || "🙂"} ${msg.senderName}
          </div>
          <p>${msg.text}</p>
        `;
      }

      chatBox.innerHTML += `
        <div class="flex ${isMe ? 'justify-start' : 'justify-end'}">
          <div class="${isMe ? 'bg-amber-100' : 'bg-white'} p-3 rounded-lg shadow max-w-xs">
            ${content}
          </div>
        </div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });

// ===================== الاستماع لمؤشر الكتابة =====================
roomRef.collection("typing").onSnapshot((snap) => {
  let typingUsers = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.typing && d.name && d.name !== currentUser?.displayName) {
      typingUsers.push(d.name);
    }
  });
  typingIndicator.textContent = typingUsers.length > 0 ? typingUsers.join(", ") + " يكتب..." : "";
  typingIndicator.classList.toggle("hidden", typingUsers.length === 0);
});

// ===================== أحداث =====================
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
  else {
    setTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => setTyping(false), 2000);
  }
});
copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId);
  copyRoomIdBtn.innerHTML = '<i class="fas fa-check"></i>';
  setTimeout(() => copyRoomIdBtn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
});
leaveRoomBtn.addEventListener('click', () => window.location.href = "index.html");
startRoundBtn.addEventListener('click', startRound);
skipQuestionBtn.addEventListener('click', skipQuestion);

// ===================== مصادقة =====================
auth.onAuthStateChanged((u) => {
  currentUser = u;
  if (!u) window.location.href = "index.html";
  else joinRoom();
});
