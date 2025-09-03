// تهيئة Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA3vUkDU4rLDxcIfY0ZYXzvw8GznlG9gc8",
  authDomain: "bechar-8b049.firebaseapp.com",
  projectId: "bechar-8b049",
  storageBucket: "bechar-8b049.appspot.com",
  messagingSenderId: "394161915136",
  appId: "1:394161915136:web:23da8f9f82393f66af5fe5"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// الحصول على معلمات URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

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

// تهيئة الغرفة
document.getElementById('room-code').textContent = roomId;
const roomRef = db.collection("rooms").doc(roomId);
let timerInterval;
let currentUser = null;

// الانضمام إلى الغرفة
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

// بدء جولة جديدة
async function startRound() {
  try {
    startRoundBtn.disabled = true;
    startRoundBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> جاري البدء...';
    
    const roomSnap = await roomRef.get();
    const roomData = roomSnap.data();
    
    if (roomData.players.length < 2) {
      alert("يجب أن يكون هناك لاعبين على الأقل لبدء الجولة!");
      startRoundBtn.disabled = false;
      startRoundBtn.innerHTML = '<i class="fas fa-play mr-2"></i> بدء الجولة';
      return;
    }
    
    // اختيار سؤال عشوائي
    const randomQuestionIndex = Math.floor(Math.random() * roomData.questions.length);
    const question = roomData.questions[randomQuestionIndex];
    
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

// مؤقت الجولة
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

// إنهاء الجولة
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

// تخطي السؤال الحالي
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

// إرسال رسالة دردشة
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  if (!currentUser) {
    alert('يجب تسجيل الدخول أولاً');
    return;
  }
  
  try {
    // 1. إنشاء كائن الرسالة أولاً
    const newMessage = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'مستخدم',
      senderAvatar: currentUser.photoURL || 'https://i.imgur.com/8Km9tLL.png',
      text: message,
      
    };

    // 2. إضافة الكامل إلى المصفوفة
    await roomRef.update({
      chat: firebase.firestore.FieldValue.arrayUnion(newMessage)
    });
    
    chatInput.value = "";
  } catch (error) {
    console.error("Error sending message:", error);
    alert("حدث خطأ أثناء إرسال الرسالة: " + error.message);
  }
}

// مغادرة الغرفة
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
    }
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error leaving room:", error);
    alert("حدث خطأ أثناء مغادرة الغرفة: " + error.message);
  }
}

// تحديثات مباشرة للغرفة
roomRef.onSnapshot((docSnap) => {
  if (!docSnap.exists) {
    alert("تم إغلاق هذه الغرفة!");
    window.location.href = "index.html";
    return;
  }

  const data = docSnap.data();
  
  // تحديث قائمة اللاعبين
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  data.players.forEach(player => {
    const playerElement = document.createElement('div');
    playerElement.className = 'flex items-center space-x-3 bg-white p-3 rounded-lg shadow';
    
    playerElement.innerHTML = `
      <img src="${player.avatar}" alt="${player.name}" class="w-10 h-10 rounded-full">
      <span class="font-bold ${player.id === (currentUser?.uid || '') ? 'text-amber-600' : 'text-gray-800'}">${player.name}</span>
      ${player.id === data.creator ? '<span class="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded">المضيف</span>' : ''}
    `;
    
    playersList.appendChild(playerElement);
  });
  
  document.getElementById('players-count').textContent = data.players.length;
  
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
    // ترتيب الرسائل حسب الوقت
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
});


// ====================== الدردشة الصوتية (WebRTC + Firestore) ======================

const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const audioContainer = document.getElementById('audio-container');

let localStream = null;
let peerConnections = {};

// تشغيل / إيقاف المايك
toggleAudioBtn.addEventListener('click', async () => {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      addAudioStream(currentUser.uid, localStream, true);
      toggleAudioBtn.textContent = "🔇 إيقاف الميكروفون";

      // مشاركة الصوت مع الآخرين
      createOffer();
    } catch (err) {
      console.error("Mic error:", err);
      alert("فشل تشغيل الميكروفون: " + err.message);
    }
  } else {
    stopAudio();
  }
});

function stopAudio() {
  localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  const audioEl = document.getElementById(`audio-${currentUser.uid}`);
  if (audioEl) audioEl.remove();
  toggleAudioBtn.textContent = "🎤 تشغيل الميكروفون";
}

// إضافة عنصر صوت
function addAudioStream(userId, stream, isLocal = false) {
  let audioEl = document.getElementById(`audio-${userId}`);
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.id = `audio-${userId}`;
    audioEl.autoplay = true;
    audioEl.controls = false;
    audioEl.className = "w-full";
    if (isLocal) audioEl.muted = true;
    audioContainer.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
}

// إنشاء اتصال
function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection();
  peerConnections[peerId] = pc;

  // إضافة الصوت
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // استقبال الصوت
  pc.ontrack = (event) => {
    addAudioStream(peerId, event.streams[0]);
  };

  // مشاركة ICE
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      roomRef.collection("candidates").add({
        from: currentUser.uid,
        to: peerId,
        candidate: event.candidate.toJSON()
      });
    }
  };

  return pc;
}

// إنشاء Offer
async function createOffer() {
  const roomSnap = await roomRef.get();
  const data = roomSnap.data();

  for (let player of data.players) {
    if (player.id === currentUser.uid) continue;
    const pc = createPeerConnection(player.id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await roomRef.collection("offers").doc(`${currentUser.uid}_${player.id}`).set({
      from: currentUser.uid,
      to: player.id,
      sdp: offer
    });
  }
}

// الاستماع للـ Offers
roomRef.collection("offers").where("to", "==", auth.currentUser?.uid || "").onSnapshot(async (snapshot) => {
  for (const change of snapshot.docChanges()) {
    if (change.type === "added") {
      const offer = change.doc.data();
      const pc = createPeerConnection(offer.from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await roomRef.collection("answers").doc(`${auth.currentUser.uid}_${offer.from}`).set({
        from: auth.currentUser.uid,
        to: offer.from,
        sdp: answer
      });
    }
  }
});

// الاستماع للـ Answers
roomRef.collection("answers").where("to", "==", auth.currentUser?.uid || "").onSnapshot(async (snapshot) => {
  for (const change of snapshot.docChanges()) {
    if (change.type === "added") {
      const answer = change.doc.data();
      const pc = peerConnections[answer.from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer.sdp));
      }
    }
  }
});

// الاستماع للـ ICE Candidates
roomRef.collection("candidates").where("to", "==", auth.currentUser?.uid || "").onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === "added") {
      const data = change.doc.data();
      const pc = peerConnections[data.from];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding ICE candidate:", e);
        }
      }
    }
  });
});

// تعيين معالج الأحداث
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

// السماح بالضغط على Enter في الدردشة
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// مراقبة حالة المصادقة
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (!user) {
    window.location.href = "index.html";
  } else {
    joinRoom();
  }
});