// تهيئة Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA3vUkDU4rLDxcIfY0ZYXzvw8GznlG9gc8",
  authDomain: "bechar-8b049.firebaseapp.com",
  projectId: "bechar-8b049",
  storageBucket: "bechar-8b049.appspot.com",
  messagingSenderId: "394161915136",
  appId: "1:394161915136:web:23da8f9f82393f66af5fe5"
};

// Initialize Firebase (compat)
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// الحصول على معلمات URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'default-room';

// عناصر الواجهة
const roomCodeElement = document.getElementById('room-code');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const startRoundBtn = document.getElementById('start-round-btn');
const skipQuestionBtn = document.getElementById('skip-question-btn');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const timerElement = document.getElementById('timer');
const timerContainer = document.getElementById('timer-container');

const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const toggleAudioLabel = document.getElementById('toggle-audio-label');
const audioStatus = document.getElementById('audio-status');
const audioContainer = document.getElementById('audio-container');

document.getElementById('room-code').textContent = roomId;

const roomRef = db.collection("rooms").doc(roomId);

let timerInterval;
let currentUser = null;

// ----- WebRTC / signaling variables -----
let localStream = null;
let peerConnections = {}; // keyed by remote user id
let signalingInitialized = false;
let lastPlayersIds = []; // for detecting new players

// ICE servers: STUN + a public TURN (اختباري)
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  // TURN تجريبي - للاختبار فقط. غير للاستخدام في الإنتاج طويل الأمد.
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

// ----------------- وظائف الغرفة الأصلية -----------------
async function joinRoom() {
  try {
    currentUser = auth.currentUser;
    if (!currentUser) {
      alert('يجب تسجيل الدخول أولاً');
      window.location.href = 'index.html';
      return;
    }

    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      alert("هذه الغرفة غير موجودة!");
      window.location.href = "index.html";
      return;
    }

    // إضافة اللاعب إذا لم يكن موجوداً
    await roomRef.update({
      players: firebase.firestore.FieldValue.arrayUnion({
        id: currentUser.uid,
        name: currentUser.displayName || 'مستخدم',
        avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png'
      })
    });
  } catch (error) {
    console.error("Error joining room:", error);
    alert("حدث خطأ أثناء الانضمام للغرفة: " + error.message);
  }
}

async function startRound() {
  try {
    startRoundBtn.disabled = true;
    startRoundBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> جاري البدء...';
    
    const roomSnap = await roomRef.get();
    const roomData = roomSnap.data();
    
    if (!roomData || (roomData.players || []).length < 2) {
      alert("يجب أن يكون هناك لاعبين على الأقل لبدء الجولة!");
      startRoundBtn.disabled = false;
      startRoundBtn.innerHTML = '<i class="fas fa-play mr-2"></i> بدء الجولة';
      return;
    }
    
    // اختيار سؤال عشوائي
    const randomQuestionIndex = Math.floor(Math.random() * (roomData.questions?.length || 1));
    const question = roomData.questions ? roomData.questions[randomQuestionIndex] : "سؤال افتراضي";

    // اختيار لاعب عشوائي (غير اللاعب الحالي إذا كان هناك لاعب حالي)
    let availablePlayers = roomData.players.filter(player => 
      !roomData.currentPlayer || player.id !== roomData.currentPlayer.id
    );
    
    const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
    
    await roomRef.update({
      currentQuestion: question,
      currentPlayer: randomPlayer,
      status: "playing",
      questionStartTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // بدء المؤقت
    startTimer(30);
    
  } catch (error) {
    console.error("Error starting round:", error);
    alert("حدث خطأ أثناء بدء الجولة: " + error.message);
  } finally {
    startRoundBtn.disabled = false;
    startRoundBtn.innerHTML = '<i class="fas fa-play mr-2"></i> بدء الجولة';
  }
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  let remaining = seconds;
  
  timerContainer.classList.remove('hidden');
  timerElement.textContent = remaining;
  
  timerInterval = setInterval(() => {
    remaining--;
    timerElement.textContent = remaining;
    
    if (remaining <= 5) {
      timerElement.classList.add('text-red-500', 'animate__animated', 'animate__pulse', 'animate__infinite');
    }
    
    if (remaining <= 0) {
      clearInterval(timerInterval);
      endRound();
    }
  }, 1000);
}

async function endRound() {
  try {
    await roomRef.update({
      status: "waiting"
    });
    timerContainer.classList.add('hidden');
    timerElement.classList.remove('text-red-500', 'animate__animated', 'animate__pulse', 'animate__infinite');
  } catch (error) {
    console.error("Error ending round:", error);
  }
}

async function skipQuestion() {
  try {
    await roomRef.update({
      currentQuestion: null,
      currentPlayer: null,
      status: "waiting"
    });
    timerContainer.classList.add('hidden');
    clearInterval(timerInterval);
  } catch (error) {
    console.error("Error skipping question:", error);
  }
}

async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  if (!currentUser) {
    alert('يجب تسجيل الدخول أولاً');
    return;
  }
  
  try {
    const newMessage = {
  senderId: currentUser.uid,
  senderName: currentUser.displayName || 'مستخدم',
  senderAvatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
  text: message,
  timestamp: Date.now()
};

await roomRef.update({
  chat: firebase.firestore.FieldValue.arrayUnion(newMessage)
});

    
    chatInput.value = "";
  } catch (error) {
    console.error("Error sending message:", error);
    alert("حدث خطأ أثناء إرسال الرسالة: " + error.message);
  }
}

async function leaveRoom() {
  try {
    // أولاً: إيقاف الصوت واغلاق الاتصالات
    await stopAudio(); // هذا ينظف peerConnections و streams و مستندات signaling

    if (currentUser) {
      await roomRef.update({
        players: firebase.firestore.FieldValue.arrayRemove({
          id: currentUser.uid,
          name: currentUser.displayName || 'مستخدم',
          avatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png'
        })
      });
    }
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error leaving room:", error);
    alert("حدث خطأ أثناء مغادرة الغرفة: " + error.message);
  }
}

// ----------------- وظائف WebRTC & Signaling عبر Firestore -----------------

// إنشاء/الحصول على RTCPeerConnection لزميل محدد
function createPeerConnection(peerId) {
  if (peerConnections[peerId]) return peerConnections[peerId];

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections[peerId] = pc;

  // إذا كان لدينا ستريم محلي، أضف المسارات
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // استقبال المسار (صوت)
  pc.ontrack = (event) => {
    // بعض الأجهزة ترسل عدة stream, نأخذ الأول
    const stream = event.streams && event.streams[0];
    if (stream) addAudioStream(peerId, stream, false);
  };

  // مشاركة ICE candidates عبر Firestore
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      roomRef.collection('webrtc_candidates').add({
        from: currentUser.uid,
        to: peerId,
        candidate: event.candidate.toJSON(),
        ts: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.error("Failed to send ICE candidate:", e));
    }
  };

  // حالة الاتصال
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      // تنظيف العنصر الصوتي للمستخدم هذا
      removeAudioStream(peerId);
      // اغلاق الاتصال
      try { pc.close(); } catch(e){}
      delete peerConnections[peerId];
    }
  };

  return pc;
}

// إضافة عنصر صوت في الصفحة (للمستخدم المحلي: muted=true)
function addAudioStream(userId, stream, isLocal = false) {
  let wrapper = document.getElementById(`audio-wrap-${userId}`);
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = `audio-wrap-${userId}`;
    wrapper.className = 'bg-white p-2 rounded shadow flex items-center justify-between';
    wrapper.style.direction = 'ltr'; // لعرض أزرار التحكم صحيح

    wrapper.innerHTML = `
      <div class="flex items-center space-x-3">
        <img src="${(currentUser && currentUser.uid === userId) ? (currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png') : ''}" id="audio-avatar-${userId}" class="w-10 h-10 rounded-full hidden">
        <div>
          <div id="audio-name-${userId}" class="font-bold text-sm">${userId}</div>
          <div id="audio-sub-${userId}" class="text-xs text-gray-500">صوت مباشر</div>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <audio id="audio-${userId}" autoplay playsinline></audio>
        <button id="mute-btn-${userId}" class="px-2 py-1 rounded text-sm border">كتم</button>
      </div>
    `;
    audioContainer.appendChild(wrapper);

    // mute button
    const muteBtn = wrapper.querySelector(`#mute-btn-${userId}`);
    const audioEl = wrapper.querySelector(`#audio-${userId}`);
    muteBtn.addEventListener('click', () => {
      audioEl.muted = !audioEl.muted;
      muteBtn.textContent = audioEl.muted ? 'تشغيل' : 'كتم';
    });
  }

  const audioEl = document.getElementById(`audio-${userId}`);
  if (audioEl) {
    audioEl.srcObject = stream;
    // لو هذا هو الستريم المحلي، نكتمه لتجنب الصدى
    audioEl.muted = isLocal;
  }

  // حاول تحديث اسم المستخدم الظاهر إن وُجد في players
  updateAudioNameFromPlayers(userId);
}

// إزالة عنصر الصوت
function removeAudioStream(userId) {
  const wrapper = document.getElementById(`audio-wrap-${userId}`);
  if (wrapper) wrapper.remove();
}

// تحديث اسم المستخدم في واجهة الصوت إن وُجد في قائمة اللاعبين
function updateAudioNameFromPlayers(userId) {
  roomRef.get().then(snap => {
    const data = snap.data();
    const players = data?.players || [];
    const p = players.find(x => x.id === userId);
    if (p) {
      const nameEl = document.getElementById(`audio-name-${userId}`);
      const avatarEl = document.getElementById(`audio-avatar-${userId}`);
      if (nameEl) nameEl.textContent = p.name;
      if (avatarEl) {
        avatarEl.src = p.avatar;
        avatarEl.classList.remove('hidden');
      }
    }
  }).catch(()=>{});
}

// إنشاء Offers لجميع اللاعبين الآخرين
async function createOffersToAll() {
  try {
    const roomSnap = await roomRef.get();
    const data = roomSnap.data();
    const players = data?.players || [];
    for (const player of players) {
      if (player.id === currentUser.uid) continue;
      // إذا لم يكن لدينا اتصال مع هذا اللاعب أو كان مغلقًا، ننشئ واحدًا
      const pc = createPeerConnection(player.id);
      // نؤكد أن لدينا LocalDescription قبل إرسال العرض
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await roomRef.collection('webrtc_offers').doc(`${currentUser.uid}_${player.id}`).set({
          from: currentUser.uid,
          to: player.id,
          type: offer.type,
          sdp: offer.sdp,
          ts: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error("Failed to create/send offer to", player.id, e);
      }
    }
  } catch (e) {
    console.error("createOffersToAll error:", e);
  }
}

// تهيئة مستمعي الإشارات (offers/answers/candidates) لمعرف المستخدم الحالي
function initSignalingListeners() {
  if (signalingInitialized || !currentUser) return;
  signalingInitialized = true;

  // ------------------ استقبال Offers موجهة إليّ ------------------
  roomRef.collection('webrtc_offers').where('to', '==', currentUser.uid)
    .onSnapshot(async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const offerDoc = change.doc;
          const data = offerDoc.data();
          // تجاهل العروض التي أنشأناها لأن doc id قد يشتمل علي uid-uid
          if (!data || data.to !== currentUser.uid) continue;
          const fromId = data.from;
          try {
            const pc = createPeerConnection(fromId);
            const desc = { type: data.type, sdp: data.sdp };
            await pc.setRemoteDescription(new RTCSessionDescription(desc));
            // إنشاؤك للإجابة
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await roomRef.collection('webrtc_answers').doc(`${currentUser.uid}_${fromId}`).set({
              from: currentUser.uid,
              to: fromId,
              type: answer.type,
              sdp: answer.sdp,
              ts: firebase.firestore.FieldValue.serverTimestamp()
            });
          } catch (e) {
            console.error("Error handling incoming offer:", e);
          }
        }
      }
    });

  // ------------------ استقبال Answers موجهة إليّ ------------------
  roomRef.collection('webrtc_answers').where('to', '==', currentUser.uid)
    .onSnapshot((snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (!data || data.to !== currentUser.uid) continue;
          const fromId = data.from; // هذا هو من رد عليّ
          const pc = peerConnections[fromId];
          if (pc) {
            const desc = { type: data.type, sdp: data.sdp };
            pc.setRemoteDescription(new RTCSessionDescription(desc)).catch(e => {
              console.error("Failed to set remote answer:", e);
            });
          }
        }
      }
    });

  // ------------------ استقبال ICE candidates موجهة إليّ ------------------
  roomRef.collection('webrtc_candidates').where('to', '==', currentUser.uid)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (!data) return;
          const fromId = data.from;
          const pc = peerConnections[fromId];
          if (pc) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.warn("addIceCandidate failed:", e);
            }
          }
        }
      });
    });
}

// إيقاف الصوت واغلاق الاتصالات وتنظيف مستندات signaling
async function stopAudio() {
  // اغلاق peerConnections
  for (const id in peerConnections) {
    try { peerConnections[id].close(); } catch (e){}
    delete peerConnections[id];
  }

  // إيقاف الستريم المحلي
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  // إزالة عناصر الصوت من الواجهة
  audioContainer.innerHTML = '';

  // تحديث الحالة
  audioStatus.textContent = 'حالة الصوت: معطل';
  toggleAudioLabel.textContent = 'تشغيل الميكروفون';
  toggleAudioBtn.classList.remove('bg-red-600');
  toggleAudioBtn.classList.add('bg-green-600');

  // محاولة حذف مستندات signaling التي أنشأها هذا المستخدم (offers/answers/candidates)
  try {
    const offers = await roomRef.collection('webrtc_offers').where('from', '==', currentUser.uid).get();
    for (const d of offers.docs) await d.ref.delete().catch(()=>{});
    const answers = await roomRef.collection('webrtc_answers').where('from', '==', currentUser.uid).get();
    for (const d of answers.docs) await d.ref.delete().catch(()=>{});
    const candsFrom = await roomRef.collection('webrtc_candidates').where('from', '==', currentUser.uid).get();
    for (const d of candsFrom.docs) await d.ref.delete().catch(()=>{});
    const candsTo = await roomRef.collection('webrtc_candidates').where('to', '==', currentUser.uid).get();
    for (const d of candsTo.docs) await d.ref.delete().catch(()=>{});
  } catch (e) {
    console.warn("Failed to clean signaling docs (maybe security rules)?", e);
  }
}

// تشغيل/إيقاف الميكروفون عند الضغط
toggleAudioBtn.addEventListener('click', async () => {
  try {
    if (!localStream) {
      // طلب إذن الميكروفون وتشغيله
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      addAudioStream(currentUser.uid, localStream, true);
      audioStatus.textContent = 'حالة الصوت: مفعل';
      toggleAudioLabel.textContent = 'إيقاف الميكروفون';
      toggleAudioBtn.classList.remove('bg-green-600');
      toggleAudioBtn.classList.add('bg-red-600');

      // تهيئة المستمعين على الإشارات لو لم تكن مهيئة
      initSignalingListeners();

      // إرسال Offer لكل اللاعبين الحاليين
      await createOffersToAll();
    } else {
      // إيقاف الصوت وتنظيف
      await stopAudio();
    }
  } catch (err) {
    console.error("Mic error:", err);
    alert("فشل تشغيل الميكروفون: " + (err.message || err));
  }
});

// ----------------- مراقبة تغيّر قائمة اللاعبين لربط لاعبين جدد -----------------
roomRef.onSnapshot((docSnap) => {
  if (!docSnap.exists) {
    alert("تم إغلاق هذه الغرفة!");
    window.location.href = "index.html";
    return;
  }

  const data = docSnap.data();
  
  // تحديث قائمة اللاعبين (الواجهة)
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  const players = data.players || [];
  players.forEach(player => {
    const playerElement = document.createElement('div');
    playerElement.className = 'flex items-center space-x-3 bg-white p-3 rounded-lg shadow';
    
    playerElement.innerHTML = `
      <img src="${player.avatar}" alt="${player.name}" class="w-10 h-10 rounded-full">
      <span class="font-bold ${player.id === (currentUser?.uid || '') ? 'text-amber-600' : 'text-gray-800'}">${player.name}</span>
      ${player.id === data.creator ? '<span class="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded">المضيف</span>' : ''}
      ${player.id !== (currentUser?.uid || '') ? '<span class="ml-auto text-xs text-gray-500">🔊</span>' : ''}
    `;
    
    playersList.appendChild(playerElement);
  });
  
  document.getElementById('players-count').textContent = players.length;

  // تحديث حالة الجولة
  const questionText = document.getElementById('question-text');
  const currentPlayerElement = document.getElementById('current-player');
  
  if (data.currentQuestion) {
    questionText.textContent = data.currentQuestion;
    currentPlayerElement.textContent = data.currentPlayer?.name || '---';
    
    if (data.currentPlayer?.id === currentUser?.uid) {
      currentPlayerElement.innerHTML += ' <span class="bg-amber-100 text-amber-800 px-2 py-1 rounded-full text-sm">أنت!</span>';
    }
    
    skipQuestionBtn.classList.remove('hidden');
    startRoundBtn.disabled = true;
  } else {
    questionText.textContent = "لم يتم اختيار سؤال بعد.";
    currentPlayerElement.textContent = "---";
    skipQuestionBtn.classList.add('hidden');
    startRoundBtn.disabled = false;
  }
  
  // تحديث الدردشة
  const chatBox = document.getElementById('chat-messages');
  chatBox.innerHTML = "";
  
  if (data.chat && data.chat.length > 0) {
    const sortedChat = [...data.chat].sort((a, b) => 
      (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
    );
    
    sortedChat.forEach(msg => {
      const isCurrentUser = msg.senderId === currentUser?.uid;
      const messageElement = document.createElement('div');
      messageElement.className = `flex ${isCurrentUser ? 'justify-start' : 'justify-end'} space-x-3`;
      
      messageElement.innerHTML = `
        ${!isCurrentUser ? `<img src="${msg.senderAvatar}" alt="${msg.senderName}" class="w-8 h-8 rounded-full">` : ''}
        <div class="${isCurrentUser ? 'bg-amber-100' : 'bg-white'} p-3 rounded-lg shadow max-w-xs md:max-w-md">
          <div class="font-bold text-sm ${isCurrentUser ? 'text-amber-800' : 'text-gray-800'}">${msg.senderName}</div>
          <p class="text-gray-700">${msg.text}</p>
          <div class="text-xs text-gray-500 mt-1">
            ${msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString() : ''}
          </div>
        </div>
        ${isCurrentUser ? `<img src="${msg.senderAvatar}" alt="${msg.senderName}" class="w-8 h-8 rounded-full">` : ''}
      `;
      
      chatBox.appendChild(messageElement);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // ----> عندما يدخل لاعب جديد: إذا كان لدي صوت محلي، أرسل Offer لهذا اللاعب الجديد
  const currentPlayerIds = players.map(p => p.id);
  // اكتشاف لاعبين جدد
  const newPlayers = currentPlayerIds.filter(id => !lastPlayersIds.includes(id));
  lastPlayersIds = currentPlayerIds;

  // إذا لدينا localStream مفعل، أرسل عروض (offers) إلى اللاعبين الجدد
  if (localStream && newPlayers.length > 0) {
    // استثناء نفس المستخدم
    const targets = newPlayers.filter(id => id !== currentUser?.uid);
    // ارسال لكل واحد
    (async () => {
      for (const peerId of targets) {
        try {
          const pc = createPeerConnection(peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await roomRef.collection('webrtc_offers').doc(`${currentUser.uid}_${peerId}`).set({
            from: currentUser.uid,
            to: peerId,
            type: offer.type,
            sdp: offer.sdp,
            ts: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.error("Error sending offer to new player:", e);
        }
      }
    })();
  }
});

// ----------------- أحداث الواجهة -----------------
copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId);
  copyRoomIdBtn.innerHTML = '<i class="fas fa-check"></i>';
  setTimeout(() => {
    copyRoomIdBtn.innerHTML = '<i class="fas fa-copy"></i>';
  }, 2000);
});

startRoundBtn.addEventListener('click', startRound);
skipQuestionBtn.addEventListener('click', skipQuestion);
sendMessageBtn.addEventListener('click', sendMessage);
leaveRoomBtn.addEventListener('click', leaveRoom);

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// محادثة برمجية: تهيئة المستخدم والمزامنة
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (!user) {
    window.location.href = "index.html";
  } else {
    joinRoom().then(() => {
      // بعد انضمام المستخدم تأكد من تهيئة مستمعي signaling فقط بعد أن نملك uid
      initSignalingListeners();
    });
  }
});
