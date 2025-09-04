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

// ===================== عناصر الواجهة =====================
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

// ===================== متغيرات الحالة =====================
let currentUser = null;
let typingTimeout = null;
let timerInterval = null;

// ===================== دوال مساعدة =====================

// انضمام للغرفة وتعيين الـ creator إن لم يكن موجودا (الذي سيكون المضيف)
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

  // إذا ما فيه حقل creator في الدوك، عين هذا المستخدم كمضيف (أول داخل)
  if (!data.creator) {
    try {
      await roomRef.update({ creator: currentUser.uid });
    } catch (e) {
      // لو فشل التحديث بسبب قواعد الأمان، لا مشكلة - ربما أُنشئ المبدئ سابقًا
      console.warn('Failed to set creator (maybe already set):', e);
    }
  }

  // أضف اللاعب إلى مصفوفة اللاعبين إن لم يكن موجوداً
  await roomRef.update({
    players: firebase.firestore.FieldValue.arrayUnion({
      id: currentUser.uid,
      name: currentUser.displayName || 'مستخدم',
      avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png'
    })
  });
}

// بدء الجولة — يحق فقط للمضيف (creator) تشغيلها
async function startRound() {
  try {
    startRoundBtn.disabled = true;
    startRoundBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> جاري البدء...';

    const snap = await roomRef.get();
    const data = snap.data();

    // تحقق المضيف
    if (data.creator && data.creator !== currentUser.uid) {
      alert('فقط المضيف يمكنه بدء الجولة.');
      return;
    }

    const players = data.players || [];
    const questions = data.questions || [];

    if (players.length < 2) {
      alert('يجب أن يكون هناك لاعبين على الأقل لبدء الجولة!');
      return;
    }

    // اختر سؤال عشوائي
    const qIndex = Math.floor(Math.random() * (questions.length || 1));
    const question = questions.length ? questions[qIndex] : 'سؤال افتراضي';

    // اختر لاعب عشوائي - ليس نفس اللاعب الحالي (لو موجود)
    let available = players;
    if (data.currentPlayer && data.currentPlayer.id) {
      available = players.filter(p => p.id !== data.currentPlayer.id);
      if (available.length === 0) available = players; // لو الكل نفس اللاعب، ارجع القائمة كاملة
    }
    const randPlayer = available[Math.floor(Math.random() * available.length)];

    await roomRef.update({
      currentQuestion: question,
      currentPlayer: randPlayer,
      status: 'playing',
      questionStartTime: firebase.firestore.FieldValue.serverTimestamp()
    });

    // بدء المؤقت (محليًا أيضاً لعرض عد تنازلي)
    startTimer(30);

  } catch (e) {
    console.error('startRound error:', e);
    alert('حدث خطأ أثناء بدء الجولة.');
  } finally {
    startRoundBtn.disabled = false;
    startRoundBtn.innerHTML = '<i class="fas fa-play mr-2"></i> بدء الجولة';
  }
}

// تخطي السؤال
async function skipQuestion() {
  try {
    await roomRef.update({
      currentQuestion: null,
      currentPlayer: null,
      status: 'waiting'
    });
    stopTimer();
  } catch (e) {
    console.error('skipQuestion error:', e);
  }
}

// مؤقت الجولة عرض محلي
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

// نهاية الجولة
async function endRound() {
  try {
    await roomRef.update({ status: 'waiting' });
    stopTimer();
  } catch (e) {
    console.error('endRound error:', e);
  }
}

// مغادرة الغرفة وإزالة اللاعب
async function leaveRoom() {
  try {
    if (currentUser) {
      await roomRef.update({
        players: firebase.firestore.FieldValue.arrayRemove({
          id: currentUser.uid,
          name: currentUser.displayName || 'مستخدم',
          avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png'
        })
      });
      // حذف مؤشر الكتابة لهذا المستخدم (تنظيف)
      await roomRef.collection('typing').doc(currentUser.uid).delete().catch(()=>{});
    }
    window.location.href = 'index.html';
  } catch (e) {
    console.error('leaveRoom error:', e);
    window.location.href = 'index.html';
  }
}

// ===================== الدردشة (chat subcollection) =====================

// إرسال رسالة (يحفظ في subcollection chat)
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  try {
    await roomRef.collection('chat').add({
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'مستخدم',
      senderAvatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
      text: message,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    chatInput.value = '';
    setTyping(false);
  } catch (e) {
    console.error('sendMessage error:', e);
    alert('فشل إرسال الرسالة.');
  }
}

// مؤشر الكتابة
function setTyping(isTyping) {
  if (!currentUser) return;
  roomRef.collection('typing').doc(currentUser.uid).set({
    name: currentUser.displayName || 'مستخدم',
    typing: isTyping,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.warn('typing set failed:', e));
}

// ===================== المستمعون (listeners) =====================

// تحديث حالة الغرفة (لاعبين، سؤال، مضيف...)
roomRef.onSnapshot((doc) => {
  if (!doc.exists) {
    alert('تم إغلاق هذه الغرفة!');
    window.location.href = 'index.html';
    return;
  }

  const data = doc.data();
  const players = data.players || [];

  // قائمة اللاعبين
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  players.forEach(p => {
    const isMe = currentUser && p.id === currentUser.uid;
    const hostBadge = data.creator === p.id ? `<span class="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded mr-2">المضيف</span>` : '';
    const playerHtml = document.createElement('div');
    playerHtml.className = 'flex items-center space-x-3 bg-white p-3 rounded-lg shadow';
    playerHtml.innerHTML = `
      <img src="${p.avatar}" alt="${p.name}" class="w-10 h-10 rounded-full">
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <div class="font-bold ${isMe ? 'text-amber-600' : 'text-gray-800'}">${p.name}</div>
          <div>${hostBadge}</div>
        </div>
      </div>
    `;
    playersList.appendChild(playerHtml);
  });

  document.getElementById('players-count').textContent = players.length;

  // السؤال و اللاعب الحالي
  const qEl = document.getElementById('question-text');
  const cpEl = document.getElementById('current-player');

  if (data.currentQuestion) {
    qEl.textContent = data.currentQuestion;
    cpEl.textContent = data.currentPlayer?.name || '---';
    skipQuestionBtn.classList.remove('hidden');
    startRoundBtn.disabled = true;

    // إذا الحالة waiting -> لا مؤقت
  } else {
    qEl.textContent = 'لم يتم اختيار سؤال بعد.';
    cpEl.textContent = '---';
    skipQuestionBtn.classList.add('hidden');
    startRoundBtn.disabled = false;
  }

  // لو تم تغيير status إلى waiting نوقف المؤقت
  if (data.status === 'waiting') stopTimer();
});

// الاستماع لرسائل الشات (مرتبة بالزمن)
roomRef.collection('chat').orderBy('timestamp').onSnapshot((snap) => {
  const chatBox = document.getElementById('chat-messages');
  chatBox.innerHTML = '';

  snap.forEach(doc => {
    const msg = doc.data();
    const isMe = msg.senderId === (currentUser && currentUser.uid);
    const timeText = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString() : '';
    const wrapper = document.createElement('div');
    wrapper.className = `flex ${isMe ? 'justify-start' : 'justify-end'} space-x-2`;

    wrapper.innerHTML = `
      ${!isMe ? `<img src="${msg.senderAvatar}" class="w-8 h-8 rounded-full">` : ''}
      <div class="${isMe ? 'bg-amber-100' : 'bg-white'} p-3 rounded-lg shadow max-w-xs">
        <div class="font-bold text-sm">${msg.senderName}</div>
        <p class="whitespace-pre-wrap">${escapeHtml(msg.text)}</p>
        <div class="text-xs text-gray-400 mt-1">${timeText}</div>
      </div>
      ${isMe ? `<img src="${msg.senderAvatar}" class="w-8 h-8 rounded-full">` : ''}
    `;
    chatBox.appendChild(wrapper);
  });

  // Scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
});

// الاستماع لمؤشر الكتابة
roomRef.collection('typing').onSnapshot((snap) => {
  const typingUsers = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (!d) return;
    // تجاهل نفس المستخدم
    if (d.typing && currentUser && d.name && d.name !== currentUser.displayName) {
      typingUsers.push(d.name);
    }
  });

  if (typingUsers.length > 0) {
    typingIndicator.textContent = typingUsers.join(', ') + ' يكتب...';
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
});

// ===================== أحداث الواجهة =====================
sendMessageBtn.addEventListener('click', sendMessage);

// كتابة في الحقل -> مؤشر الكتابة (debounce)
chatInput.addEventListener('input', () => {
  setTyping(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTyping(false), 2000);
});

// Enter لإرسال
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// نسخ رمز الغرفة
copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId).then(() => {
    copyRoomIdBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => copyRoomIdBtn.innerHTML = '<i class="fas fa-copy"></i>', 1500);
  });
});

// بدء الجولة (زر)
startRoundBtn.addEventListener('click', startRound);
skipQuestionBtn.addEventListener('click', skipQuestion);

// مغادرة
leaveRoomBtn.addEventListener('click', leaveRoom);

// ===================== أمان / تنسيقات =====================

// وظيفة بسيطة للهروب من HTML داخل الرسائل لسلامة العرض
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

// ===================== المصادقة والبدء =====================
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (!user) {
    // إن لم يسجل الدخول تعيد إلى index
    window.location.href = 'index.html';
  } else {
    joinRoom().catch(e => console.error('joinRoom failed:', e));
  }
});
