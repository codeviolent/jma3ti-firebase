// room.js — نسخة مُنقحة مع إصلاح المضيف، منع تكرار الحزم، وضمان عرض اللاعب المختار

// ================ تهيئة Firebase =================
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

// ================ عناصر DOM =======================
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'default-room';
const roomRef = db.collection('rooms').doc(roomId);

const roomCodeEl = document.getElementById('room-code');
const playersListEl = document.getElementById('players-list');
const playersCountEl = document.getElementById('players-count');
const questionTextEl = document.getElementById('question-text');
const timerContainer = document.getElementById('timer-container');
const timerEl = document.getElementById('timer');
const startRoundBtn = document.getElementById('start-round-btn');
const skipQuestionBtn = document.getElementById('skip-question-btn');
const currentPlayerEl = document.getElementById('current-player');

const chatBox = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const typingIndicator = document.getElementById('typing-indicator');

const modal = document.getElementById('customize-modal');
const emojiBtns = document.querySelectorAll('.emoji-btn');
const colorPicker = document.getElementById('color-picker');
const saveCustomizationBtn = document.getElementById('save-customization');

const packContainer = document.getElementById('pack-choice-container');
const packSelect = document.getElementById('pack-select');

if (roomCodeEl) roomCodeEl.textContent = roomId;

// ================ حالات محلية =====================
let currentUser = null;
let currentRoomData = null;
let typingTimeout = null;
let timerInterval = null;
let chosenEmoji = null;
let chosenColor = colorPicker ? colorPicker.value : '#d97706';
let presenceInterval = null;

let userDocUnsub = null;
let roomUnsub = null;
let chatUnsub = null;
let typingUnsub = null;

// ================ دوال مساعدة =====================
function escapeHtml(text){
  if (text === undefined || text === null) return '';
  return String(text).replace(/[&<>"'`=\/]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[s]));
}

// هل uid هو اللاعب المختار الآن؟ (يتعامل مع string أو object)
function isCurrentPlayerUid(uid){
  if (!currentRoomData || !currentRoomData.currentPlayer) return false;
  const cp = currentRoomData.currentPlayer;
  if (typeof cp === 'string') return cp === uid;
  if (cp && typeof cp === 'object') {
    if (cp.id) return cp.id === uid;
    if (cp.uid) return cp.uid === uid;
  }
  return false;
}

// ================ modal اختيار الإيموجي واللون =========
emojiBtns.forEach(btn=>{
  btn.addEventListener('click', () => {
    emojiBtns.forEach(b => b.classList.remove('emoji-selected'));
    btn.classList.add('emoji-selected');
    chosenEmoji = btn.textContent.trim();
  });
});
if (colorPicker) {
  colorPicker.addEventListener('input', (e) => chosenColor = e.target.value);
}
if (saveCustomizationBtn) {
  saveCustomizationBtn.addEventListener('click', async () => {
    if (!chosenEmoji) chosenEmoji = '🙂';
    if (!chosenColor) chosenColor = '#d97706';
    modal.classList.add('hidden');
    await savePlayerData();
    startPresenceHeartbeat();
  });
}

// ================ مراقبة user doc ===================
function subscribeToUserDoc(uid){
  if (userDocUnsub) userDocUnsub();
  userDocUnsub = db.collection('users').doc(uid).onSnapshot(doc => {
    // whenever users doc changes نحدّث قائمة الحزم
    if (doc.exists) loadOwnedPacks(uid);
  });
}

// ================ تحميل الحزم المملوكة (بدون تكرار) ======
async function loadOwnedPacks(uid){
  if (!packContainer || !packSelect) return;
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) { packContainer.classList.add('hidden'); return; }
    // استخدم Set لإزالة التكرار
    const ownedRaw = doc.data().ownedPacks || [];
    const owned = Array.from(new Set(ownedRaw || []));
    if (!owned.length) { packContainer.classList.add('hidden'); return; }

    packContainer.classList.remove('hidden');
    packSelect.innerHTML = '<option value="default">الأسئلة الافتراضية</option>';

    for (const pid of owned) {
      try {
        const pdoc = await db.collection('questionPacks').doc(pid).get();
        if (pdoc.exists) {
          const p = pdoc.data();
          const opt = document.createElement('option');
          opt.value = pid;
          opt.textContent = `${p.name} (${(p.questions||[]).length} سؤال)`;
          packSelect.appendChild(opt);
        }
      } catch (e) {
        console.warn('failed load pack', pid, e);
      }
    }
  } catch (e) {
    console.warn('loadOwnedPacks error', e);
    packContainer.classList.add('hidden');
  }
}

// ================ الانضمام للغرفة =====================
async function joinRoom(){
  currentUser = auth.currentUser;
  if (!currentUser) { window.location.href = 'index.html'; return; }

  subscribeToUserDoc(currentUser.uid);

  const snap = await roomRef.get();
  if (!snap.exists) {
    alert('هذه الغرفة غير موجودة!');
    window.location.href = 'index.html';
    return;
  }
  currentRoomData = snap.data() || {};

  // إذا لا يوجد creator نعيّنه باستخدام set مع merge (أمن أكثر)
  try {
    if (!currentRoomData.creator) {
      await roomRef.set({ creator: currentUser.uid }, { merge: true });
    }
  } catch (e) {
    console.warn('set creator failed', e);
  }

  // تأكد وجود users doc
  const userRef = db.collection('users').doc(currentUser.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      name: currentUser.displayName || 'مستخدم',
      phone: '',
      plan: 'free',
      ownedPacks: []
    }, { merge: true });
  }

  // إذا اللاعب غير موجود في players أعرض المودال للحفظ
  const players = currentRoomData.players || [];
  const exists = players.find(p => p.id === currentUser.uid);
  if (!exists) {
    chosenEmoji = '🙂';
    chosenColor = '#333';
    modal.classList.remove('hidden');
    // الحفظ يحدث عند الضغط على زر حفظ في المودال
  } else {
    chosenEmoji = exists.emoji || '🙂';
    chosenColor = exists.color || chosenColor;
    startPresenceHeartbeat();
  }
}

// ================ حفظ بيانات اللاعب ===================
async function savePlayerData(){
  if (!currentUser) return;
  try {
    const rSnap = await roomRef.get();
    const data = rSnap.exists ? rSnap.data() : {};
    const players = data.players || [];
    const filtered = players.filter(p => p.id !== currentUser.uid);
    const playerObj = {
      id: currentUser.uid,
      name: currentUser.displayName || 'مستخدم',
      avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
      emoji: chosenEmoji || '🙂',
      color: chosenColor || '#d97706'
    };
    filtered.push(playerObj);
    await roomRef.update({ players: filtered });
    await roomRef.collection('presence').doc(currentUser.uid).set({ uid: currentUser.uid, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
  } catch (e) {
    console.error('savePlayerData error', e);
  }
}

// ================ حضور (presence) ====================
function startPresenceHeartbeat(){
  stopPresenceHeartbeat();
  if (!currentUser) return;
  roomRef.collection('presence').doc(currentUser.uid).set({ uid: currentUser.uid, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
  presenceInterval = setInterval(() => {
    roomRef.collection('presence').doc(currentUser.uid).set({ uid: currentUser.uid, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
  }, 15000);
}
function stopPresenceHeartbeat(){
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = null;
}

// ================ إزالة اللاعب عند الخروج ===================
async function removeSelfFromPlayers(){
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
    await roomRef.collection('presence').doc(currentUser.uid).delete().catch(()=>{});
    await roomRef.collection('typing').doc(currentUser.uid).delete().catch(()=>{});
  } catch (e) {
    console.warn('removeSelfFromPlayers failed', e);
  }
}

// ================ مؤشر الكتابة ======================
function setTyping(isTyping){
  if (!currentUser) return;
  // خزّن uid و name لتكون المقارنة بالـ uid موثوقة
  roomRef.collection('typing').doc(currentUser.uid).set({
    uid: currentUser.uid,
    name: currentUser.displayName || 'مستخدم',
    typing: isTyping,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.warn('setTyping failed', e));
}

// ================ إرسال رسالة =======================
async function sendMessage(){
  const text = chatInput.value.trim();
  if (!text) return;

  // استخدم الدالة المساعدة لاكتشاف اللاعب المختار (مرنة)
  const isActiveAnswer = currentRoomData?.currentQuestion && isCurrentPlayerUid(currentUser.uid);
  const type = isActiveAnswer ? 'answer' : 'chat';
  const question = type === 'answer' ? currentRoomData.currentQuestion : null;

  try {
    await roomRef.collection('chat').add({
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'مستخدم',
      senderEmoji: getPlayerEmoji(currentUser.uid),
      senderColor: getPlayerColor(currentUser.uid),
      type,
      question,
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    chatInput.value = '';
    setTyping(false);
  } catch (e) {
    console.error('sendMessage error', e);
    alert('حدث خطأ أثناء إرسال الرسالة.');
  }
}

function getPlayerEmoji(uid){
  const players = currentRoomData?.players || [];
  const p = players.find(x => x.id === uid);
  return p?.emoji || '🙂';
}
function getPlayerColor(uid){
  const players = currentRoomData?.players || [];
  const p = players.find(x => x.id === uid);
  return p?.color || '#333';
}

// ================ بدء الجولة (تخزين currentPlayer كامل) ============
async function startRound(){
  try {
    const rSnap = await roomRef.get();
    if (!rSnap.exists) { alert('الغرفة غير موجودة'); return; }
    const data = rSnap.data() || {};

    if (data.creator && data.creator !== currentUser.uid) {
      alert('فقط المضيف يمكنه بدء الجولة.');
      return;
    }

    const players = data.players || [];
    if (players.length < 2) { alert('يجب أن يكون هناك لاعبين على الأقل'); return; }

    // اختر لاعب عشوائي، تجنب نفس currentPlayer إن أمكن
    let available = players;
    if (data.currentPlayer && (data.currentPlayer.id || typeof data.currentPlayer === 'string')) {
      const curId = typeof data.currentPlayer === 'string' ? data.currentPlayer : (data.currentPlayer.id || data.currentPlayer.uid);
      const filtered = players.filter(p => p.id !== curId);
      if (filtered.length) available = filtered;
    }
    const randPlayer = available[Math.floor(Math.random() * available.length)];

    // اختر سؤال من الحزمة إن اختيرت، وإلا من room.questions
    let question = null;
    if (packSelect && packSelect.value && packSelect.value !== 'default') {
      try {
        const packSnap = await db.collection('questionPacks').doc(packSelect.value).get();
        if (packSnap.exists) {
          const pack = packSnap.data();
          if (pack.questions && pack.questions.length) question = pack.questions[Math.floor(Math.random() * pack.questions.length)];
        }
      } catch (e) { console.warn('failed to fetch selected pack', e); }
    }
    if (!question) {
      const roomQs = data.questions || [];
      question = roomQs.length ? roomQs[Math.floor(Math.random() * roomQs.length)] : 'سؤال افتراضي';
    }

    const currentPlayerObj = {
      id: randPlayer.id,
      name: randPlayer.name || randPlayer.id,
      emoji: randPlayer.emoji || '🙂',
      color: randPlayer.color || '#333'
    };

    console.log('startRound -> chosen player:', currentPlayerObj);

    await roomRef.update({
      currentQuestion: question,
      currentPlayer: currentPlayerObj,
      status: 'playing',
      questionStartTime: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('startRound error', err);
    alert('حدث خطأ أثناء بدء الجولة.');
  }
}

async function skipQuestion(){
  try {
    await roomRef.update({ currentQuestion: null, currentPlayer: null, status: 'waiting' });
    stopTimer();
  } catch (e) { console.warn('skipQuestion failed', e); }
}

async function endRound(){
  try {
    await roomRef.update({ status: 'waiting', currentQuestion: null, currentPlayer: null });
    stopTimer();
  } catch (e) { console.warn('endRound failed', e); }
}

// ================ مؤقت متزامن ===========================
function startTimer(seconds){
  clearInterval(timerInterval);
  let remaining = seconds;
  if (timerContainer) timerContainer.classList.remove('hidden');
  if (timerEl) timerEl.textContent = remaining;
  timerInterval = setInterval(() => {
    remaining--;
    if (timerEl) timerEl.textContent = remaining;
    if (remaining <= 5 && timerEl) timerEl.classList.add('text-red-500');
    if (remaining <= 0) { clearInterval(timerInterval); endRound(); }
  }, 1000);
}
function stopTimer(){
  clearInterval(timerInterval);
  if (timerContainer) timerContainer.classList.add('hidden');
  if (timerEl) { timerEl.classList.remove('text-red-500'); timerEl.textContent = '60'; }
}

// ================ مستمعو Firestore ======================
function attachRoomListeners(){
  if (roomUnsub) roomUnsub();
  roomUnsub = roomRef.onSnapshot(doc => {
    if (!doc.exists) return;
    currentRoomData = doc.data() || {};

    // عرض اللاعبين والقيمة (المضيف يظهر بجانب اسمه)
    const players = currentRoomData.players || [];
    playersListEl.innerHTML = '';
    players.forEach(p => {
      const wrapper = document.createElement('div');
      wrapper.className = 'flex items-center gap-2 p-2 border-b';
      wrapper.innerHTML = `<span style="font-size:18px">${escapeHtml(p.emoji||'🙂')}</span>
                           <div class="font-bold" style="color:${escapeHtml(p.color||'#ff8c11ff')}">${escapeHtml(p.name)}</div>`;
      // إذا كان مضيف أضف علامة (المضيف)
      if (currentRoomData.creator === p.id) {
        const hostTag = document.createElement('span');
        hostTag.className = 'text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded mr-2';
        hostTag.innerText = 'المضيف';
        // ضع العلامة على اليمين أمام الاسم
        wrapper.appendChild(hostTag);
      }
      playersListEl.appendChild(wrapper);
    });
    if (playersCountEl) playersCountEl.textContent = players.length;

    // سؤال
    if (questionTextEl) questionTextEl.textContent = currentRoomData.currentQuestion || 'لم يتم اختيار سؤال بعد.';

    // عرض اللاعب الحالي في خانة current-player (مرن مع string أو object)
    if (currentPlayerEl) {
      const cp = currentRoomData.currentPlayer;
      let displayName = '---';
      let displayEmoji = '';
      if (cp) {
        if (typeof cp === 'string') {
          // ابحث في players للحصول على التفاصيل
          const found = (currentRoomData.players || []).find(p => p.id === cp);
          displayName = found?.name || cp;
          displayEmoji = found?.emoji || displayEmoji;
        } else if (typeof cp === 'object') {
          displayName = cp.name || cp.id || 'مستخدم';
          displayEmoji = cp.emoji || displayEmoji;
        }
      }
      currentPlayerEl.textContent = `${displayEmoji} ${displayName}`;
    }

    // مزامنة المؤقت
    if (currentRoomData.status === 'playing' && currentRoomData.questionStartTime) {
      try {
        const startTs = currentRoomData.questionStartTime.toDate().getTime();
        const elapsed = Math.floor((Date.now() - startTs) / 1000);
        const remaining = 60 - elapsed;
        if (remaining > 0) startTimer(remaining);
        else stopTimer();
      } catch (e) { console.warn('timer parse error', e); }
    } else if (currentRoomData.status === 'waiting') {
      stopTimer();
    }

    // تفعيل زر البدء فقط للمضيف
    if (currentRoomData.creator && currentUser) startRoundBtn.disabled = currentRoomData.creator !== currentUser.uid;

    // زر التخطي
    if (currentRoomData.currentQuestion) skipQuestionBtn.classList.remove('hidden'); else skipQuestionBtn.classList.add('hidden');
  });
}

function attachChatListener(){
  if (chatUnsub) chatUnsub();
  chatUnsub = roomRef.collection('chat').orderBy('timestamp').onSnapshot(snap => {
    chatBox.innerHTML = '';
    snap.forEach(doc => {
      const m = doc.data();
      const isMe = currentUser && m.senderId === currentUser.uid;

      let content = '';
      if (m.type === 'answer') {
        content = `
          <div class="font-bold text-sm" style="color:${escapeHtml(m.senderColor||'#333')}">
            ${escapeHtml(m.senderEmoji||'🙂')} ${escapeHtml(m.senderName)}
          </div>
          <div class="text-gray-600 mt-1">❓ ${escapeHtml(m.question||'')}</div>
          <div class="mt-2">${escapeHtml(m.text)}</div>
        `;
      } else {
        content = `
          <div class="font-bold text-sm" style="color:${escapeHtml(m.senderColor||'#333')}">
            ${escapeHtml(m.senderEmoji||'🙂')} ${escapeHtml(m.senderName)}
          </div>
          <div class="mt-1">${escapeHtml(m.text)}</div>
        `;
      }

      const wrapper = document.createElement('div');
      wrapper.className = `my-1 flex ${isMe ? 'justify-end' : 'justify-start'}`;

      const bubble = document.createElement('div');
      bubble.className = `p-2 rounded-lg shadow max-w-[70%] break-words ${
        isMe ? 'bg-amber-100 text-right' : 'bg-white text-left'
      }`;
      bubble.innerHTML = content;

      wrapper.appendChild(bubble);
      chatBox.appendChild(wrapper);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}


function attachTypingListener(){
  if (typingUnsub) typingUnsub();
  typingUnsub = roomRef.collection('typing').onSnapshot(snap => {
    const typingUsers = [];
    snap.forEach(doc => {
      const d = doc.data();
      // الآن نعتمد uid للمقارنة (أكثر دقة)
      if (d && d.typing && d.uid && currentUser && d.uid !== currentUser.uid) {
        typingUsers.push(d.name || 'مستخدم');
      }
    });
    if (typingUsers.length) {
      typingIndicator.textContent = typingUsers.join(', ') + ' يكتب...';
      typingIndicator.classList.remove('hidden');
    } else {
      typingIndicator.classList.add('hidden');
    }
  });
}

// ================ أحداث واجهة ==========================
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('input', () => {
  setTyping(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTyping(false), 2000);
});
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }});
startRoundBtn.addEventListener('click', startRound);
skipQuestionBtn.addEventListener('click', skipQuestion);

// نسخ معرف الغرفة
const copyBtn = document.getElementById('copy-room-id');
if (copyBtn) copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId).then(()=> {
    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(()=> copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 1500);
  }).catch(()=>{});
});

// زر الخروج
const leaveBtn = document.getElementById('leave-room-btn');
if (leaveBtn) leaveBtn.addEventListener('click', async () => {
  try { await removeSelfFromPlayers(); } catch (e) {}
  stopPresenceHeartbeat();
  window.location.href = 'index.html';
});

// تنظيف عند الإغلاق (best-effort)
window.addEventListener('beforeunload', () => {
  try {
    if (currentUser) {
      roomRef.get().then(snap => {
        if (!snap.exists) return;
        const players = (snap.data().players || []).filter(p => p.id !== currentUser.uid);
        roomRef.update({ players }).catch(()=>{});
      });
      roomRef.collection('presence').doc(currentUser.uid).delete().catch(()=>{});
      roomRef.collection('typing').doc(currentUser.uid).delete().catch(()=>{});
    }
  } catch (e) {}
});

// ================ auth & تشغيل المستمعين ====================
auth.onAuthStateChanged(async user => {
  currentUser = user;
  if (!user) { window.location.href = 'index.html'; return; }

  subscribeToUserDoc(currentUser.uid);
  await joinRoom();

  attachRoomListeners();
  attachChatListener();
  attachTypingListener();
  loadOwnedPacks(currentUser.uid);

  // ابدأ presence إذا كان اللاعب مدرجًا في القائمة
  try {
    const s = await roomRef.get();
    const players = s.exists ? (s.data().players || []) : [];
    if (players.find(p => p.id === currentUser.uid)) startPresenceHeartbeat();
  } catch (e) { console.warn(e); }
});
