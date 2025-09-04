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

// ===================== عناصر وحقول =====================
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

// Presence & intervals
let presenceInterval = null;       // يحدّث lastSeen كل 15s
let hostCleanupInterval = null;    // المضيف ينظف اللاعبين غير النشطين كل 30s

// ===================== تخصيص اللاعب (modal) =====================
const modal = document.getElementById("customize-modal");
const emojiBtns = document.querySelectorAll(".emoji-btn");
const colorPicker = document.getElementById("color-picker");
const saveCustomizationBtn = document.getElementById("save-customization");

emojiBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    emojiBtns.forEach(b => b.classList.remove("emoji-selected"));
    btn.classList.add("emoji-selected");
    chosenEmoji = btn.textContent.trim();
  });
});
if (colorPicker) {
  colorPicker.addEventListener("input", (e) => {
    chosenColor = e.target.value;
  });
}
if (saveCustomizationBtn) {
  saveCustomizationBtn.addEventListener("click", async () => {
    if (!chosenEmoji) chosenEmoji = "🙂";
    if (!chosenColor) chosenColor = "#d97706";
    modal.classList.add("hidden");
    await savePlayerData();
    // بعد حفظ اللاعب، أبدأ presence و (إن كنت مضيفاً) تنظيف المضيف
    startPresenceHeartbeat();
    startHostCleanupIfNeeded();
  });
}

// ===================== أدوات مساعدة =====================
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"'`=\/]/g, function (s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

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

  const data = snap.data() || {};

  // تعيين creator إن لم يكن موجودًا (transaction لتقليل التعارض)
  try {
    await db.runTransaction(async (tx) => {
      const d = await tx.get(roomRef);
      if (!d.exists) throw "no-doc";
      const dd = d.data();
      if (!dd.creator) tx.update(roomRef, { creator: currentUser.uid });
    });
  } catch (e) {
    // تجاهل الأخطاء هنا — قد يكون تم تعيين creator من لاعب آخر
  }

  // هل اللاعب موجود مسبقًا؟
  const players = data.players || [];
  const existing = players.find(p => p.id === currentUser.uid);
  if (existing) {
    // خزّن الاختيارات محلياً وابدأ heartbeat
    chosenEmoji = existing.emoji || "🙂";
    chosenColor = existing.color || chosenColor;
    startPresenceHeartbeat();
    startHostCleanupIfNeeded();
    return;
  }

  // جديد → أظهر نافذة الاختيار
  if (modal) modal.classList.remove("hidden");
}

// ===================== حفظ بيانات اللاعب =====================
async function savePlayerData() {
  if (!currentUser) return;
  const playerData = {
    id: currentUser.uid,
    name: currentUser.displayName || 'مستخدم',
    avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
    emoji: chosenEmoji || '🙂',
    color: chosenColor || '#d97706'
  };

  // نقرأ ونكتب المصفوفة بالكامل لتجنّب مشاكل arrayRemove/arrayUnion مع الأوبجكتات
  const snap = await roomRef.get();
  const data = snap.data() || {};
  const players = data.players || [];
  const filtered = players.filter(p => p.id !== currentUser.uid);
  filtered.push(playerData);
  await roomRef.update({ players: filtered });

  // أنشئ مستند حضور خاص بهذا اللاعب
  await roomRef.collection('presence').doc(currentUser.uid).set({
    uid: currentUser.uid,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ===================== presence (heartbeat & cleanup) =====================

// تحدث تايم ستامب الحضور كل 15 ثانية
function startPresenceHeartbeat() {
  stopPresenceHeartbeat(); // نمنع مضاعفات
  if (!currentUser) return;
  // تحديث فوري أولاً
  roomRef.collection('presence').doc(currentUser.uid).set({
    uid: currentUser.uid,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(()=>{});
  // ثم تحديث دوري
  presenceInterval = setInterval(() => {
    roomRef.collection('presence').doc(currentUser.uid).set({
      uid: currentUser.uid,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  }, 15000);
}

function stopPresenceHeartbeat() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
}

// إذا كنت المضيف فابدأ مهمة تنظيف اللاعبين غير النشطين كل 30 ثانية
function startHostCleanupIfNeeded() {
  stopHostCleanup();
  if (!currentUser) return;
  roomRef.get().then(snap => {
    const data = snap.exists ? snap.data() : {};
    if (data && data.creator === currentUser.uid) {
      // فقط المضيف يقوم بالتنظيف الدوري
      hostCleanupInterval = setInterval(() => {
        pruneStalePlayers().catch(()=>{});
      }, 30000);
    }
  }).catch(()=>{});
}

function stopHostCleanup() {
  if (hostCleanupInterval) {
    clearInterval(hostCleanupInterval);
    hostCleanupInterval = null;
  }
}

// حذف اللاعبين الذين لم يظهروا presence منذ أكثر من 60 ثانية
async function pruneStalePlayers() {
  const thresholdMs = 60 * 1000; // 60s
  // اجلب كل مستندات presence
  const presSnap = await roomRef.collection('presence').get();
  const now = Date.now();
  const staleUids = [];
  presSnap.forEach(doc => {
    const d = doc.data();
    if (!d || !d.lastSeen) return;
    const ts = d.lastSeen.toDate().getTime();
    if ((now - ts) > thresholdMs) staleUids.push(d.uid);
  });

  if (staleUids.length === 0) return;

  // اقرأ players وازِل اللاعبين المطابقين
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) return;
  const data = roomSnap.data() || {};
  const players = data.players || [];
  const filtered = players.filter(p => !staleUids.includes(p.id));

  if (filtered.length !== players.length) {
    await roomRef.update({ players: filtered }).catch(e => console.warn('prune update failed', e));
  }

  // أحذف مستندات presence الخاصة بهم
  for (const uid of staleUids) {
    await roomRef.collection('presence').doc(uid).delete().catch(()=>{});
  }
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
  }).catch(e => console.warn('typing set failed:', e));
}

// ===================== بدء/تخطي/إنهاء الجولة =====================
async function startRound() {
  const snap = await roomRef.get();
  const data = snap.data() || {};

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

// ===================== المؤقت (متزامن للجميع) =====================
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
  timerElement.textContent = '60';
}

// ===================== إزالة اللاعب من players (آمنة) =====================
async function removeSelfFromPlayers() {
  if (!currentUser) return;
  try {
    const snap = await roomRef.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    const players = data.players || [];
    const filtered = players.filter(p => p.id !== currentUser.uid);
    if (filtered.length !== players.length) {
      await roomRef.update({ players: filtered });
    }
    // احذف وثيقة presence و typing للمستخدم
    await roomRef.collection('presence').doc(currentUser.uid).delete().catch(()=>{});
    await roomRef.collection('typing').doc(currentUser.uid).delete().catch(()=>{});
  } catch (e) {
    console.warn('removeSelfFromPlayers failed:', e);
  }
}

// ===================== مستمعو Firestore =====================
roomRef.onSnapshot((doc) => {
  if (!doc.exists) return;
  currentRoomData = doc.data() || {};
  const data = currentRoomData;

  // تحديث قائمة اللاعبين
  const players = data.players || [];
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = "";
  players.forEach(p => {
    playersList.innerHTML += `
      <div class="flex items-center space-x-3 bg-white p-3 rounded-lg shadow">
        <span style="font-size:20px">${escapeHtml(p.emoji || "🙂")}</span>
        <span class="font-bold" style="color:${p.color || "#333"}">
          ${escapeHtml(p.name)} ${data.creator === p.id ? "(المضيف)" : ""}
        </span>
      </div>`;
  });
  document.getElementById('players-count').textContent = players.length;

  // تحديث السؤال واللاعب الحالي
  document.getElementById('question-text').textContent =
    data.currentQuestion || "لم يتم اختيار سؤال بعد.";
  document.getElementById('current-player').textContent =
    data.currentPlayer?.name || "---";

  // المؤقت المتزامن: استخدم questionStartTime
  if (data.status === 'playing' && data.questionStartTime) {
    // قد يكون questionStartTime من نوع Timestamp
    const startTime = data.questionStartTime.toDate().getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    const remaining = 60 - elapsed;
    if (remaining > 0) startTimer(remaining);
    else stopTimer();
  }

  if (data.status === 'waiting') {
    stopTimer();
  }

  // تمكين/تعطيل زر البدء بحسب كونك المضيف
  if (data.creator && currentUser) {
    startRoundBtn.disabled = data.creator !== currentUser.uid;
  }
});

// الرسائل
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
          <div class="font-bold text-sm">${escapeHtml(msg.senderEmoji || "🙂")} ${escapeHtml(msg.senderName)}</div>
          <div class="text-gray-600">❓ ${escapeHtml(msg.question || '')}</div>
          <div style="color:${msg.senderColor || "#333"}">💬 ${escapeHtml(msg.text)}</div>
        `;
      } else {
        content = `
          <div class="font-bold text-sm" style="color:${msg.senderColor || "#333"}">
            ${escapeHtml(msg.senderEmoji || "🙂")} ${escapeHtml(msg.senderName)}
          </div>
          <p>${escapeHtml(msg.text)}</p>
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

// مؤشر الكتابة
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

// ===================== أحداث الواجهة =====================
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('input', () => {
  setTyping(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTyping(false), 2000);
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});
copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId);
  copyRoomIdBtn.innerHTML = '<i class="fas fa-check"></i>';
  setTimeout(() => copyRoomIdBtn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
});
startRoundBtn.addEventListener('click', startRound);
skipQuestionBtn.addEventListener('click', skipQuestion);

// عند الضغط على الخروج — نزيل اللاعب ثم نعيد للمؤشر
leaveRoomBtn.addEventListener('click', async () => {
  try {
    await removeSelfFromPlayers();
  } catch(_) {}
  stopPresenceHeartbeat();
  stopHostCleanup();
  window.location.href = 'index.html';
});

// تنظيف عند غلق التبويب (محاولة جادة لكن لا ضمان)
window.addEventListener('beforeunload', () => {
  try {
    if (currentUser) {
      // محاولة مزج عملية سريعة: احذف presence و players
      // removeSelfFromPlayers يقوم بقراءة/كتابة لذا لا ننتظر اكتماله لأن المستعرض قد يغلق
      removeSelfFromPlayers();
    }
  } catch (e) {}
});

// ===================== المصادقة والبدء =====================
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (!user) {
    window.location.href = 'index.html';
  } else {
    // إذا colorPicker موجود حدّده محلياً
    if (typeof colorPicker !== 'undefined' && colorPicker && colorPicker.value) chosenColor = colorPicker.value;
    await joinRoom();
    // لو كان المستخدم موجودًا سابقاً فابدأ heartbeat (إذا لم يبدأ في save)
    startPresenceHeartbeat();
    startHostCleanupIfNeeded();
  }
});
