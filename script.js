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

// عناصر الواجهة
const authBtn = document.getElementById('auth-btn');
const authBtnLarge = document.getElementById('auth-btn-large');
const userSection = document.getElementById('user-section');
const guestSection = document.getElementById('guest-section');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');

// مصادقة جوجل
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then((result) => {
      updateUI();
    })
    .catch((error) => {
      console.error("Error signing in:", error);
      alert("حدث خطأ أثناء تسجيل الدخول: " + error.message);
    });
}

// تسجيل الخروج
function signOut() {
  auth.signOut()
    .then(() => {
      updateUI();
    })
    .catch((error) => {
      console.error("Error signing out:", error);
    });
}

// تحديث واجهة المستخدم
function updateUI() {
  const user = auth.currentUser;
  if (user) {
    userAvatar.src = user.photoURL || 'https://i.imgur.com/8Km9tLL.png';
    userName.textContent = user.displayName || 'مستخدم';

    userSection.classList.remove('hidden');
    guestSection.classList.add('hidden');

    authBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i> تسجيل الخروج';
    authBtn.onclick = signOut;
  } else {
    userSection.classList.add('hidden');
    guestSection.classList.remove('hidden');

    authBtn.innerHTML = '<i class="fab fa-google mr-2"></i> تسجيل الدخول باستخدام جوجل';
    authBtn.onclick = signInWithGoogle;
  }
}

// إنشاء غرفة جديدة
async function createRoom() {
  if (!auth.currentUser) {
    alert('يجب تسجيل الدخول أولاً');
    return;
  }

  createRoomBtn.disabled = true;
  createRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> جاري الإنشاء...';

  try {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const user = auth.currentUser;
    
    await db.collection("rooms").doc(roomId).set({
      creator: user.uid,
      players: [{
        id: user.uid,
        name: user.displayName || 'مستخدم',
        avatar: user.photoURL || 'https://i.imgur.com/8Km9tLL.png'
      }],
      chat: [],
      currentQuestion: null,
      currentPlayer: null,
      questions: [
        "ما هو أكبر سر تخفيه عن أصدقائك؟",
        "هل سبق أن خنت ثقة شخص ما؟",
        "ما أكثر شيء تندم عليه في حياتك؟",
        "من هو الشخص الذي لا تستطيع العيش بدونه؟",
        "لو خيروك بين الصدق والأمانة، ماذا تختار؟",
        "ما هي العادة السيئة التي لا تستطيع التخلص منها؟",
        "هل سبق أن وقعت في حب شخص غير مناسب؟",
        "ما أكثر شيء ندمت عليه في حياتك؟",
"هل كذبت يومًا على شخص تحبه؟",
"هل سبق وخنت ثقة أحد؟",
"من هو الشخص الذي تندم على معرفته؟",
"ما هو أكبر سر تخفيه؟",
"هل لديك صديق لا تثق به؟",
"هل سبق وأن أحببت شخصًا لا يبادلك نفس الشعور؟",
"هل سبق وأن دخلت علاقة فقط بدافع النسيان؟",
"هل أنت راضٍ عن شكلك الخارجي؟",
"هل سبق وأن تعرضت للخذلان من أقرب شخص؟",
"ما هو أسوأ شيء فعلته في لحظة غضب؟",
"هل تحب نفسك حقًا؟",
"ما الشيء الذي تخفيه عن أقرب أصدقائك؟",
"هل سبق وأن فكرت في إنهاء حياتك؟",
"هل تثق بالناس بسهولة؟",
"هل أنت غيور بطبعك؟",
"ما هي أكبر كذبة قلتها؟",
"هل سبق وندمت على حب شخص؟",
"هل كنت الطرف السام في علاقة ما؟",
"ما هو السبب الحقيقي وراء آخر فشل مررت به؟",
"من هو الشخص الذي تتمنى لو لم تقابله أبدًا؟",
"هل تعتبر نفسك ناضجًا عاطفيًا؟",
"هل تستطيع مسامحة من خانك؟",
"هل تمنيت يومًا أن تكون شخصًا آخر؟",
"ما هو أسوأ شيء قلته لشخص في لحظة صدق؟",
"هل سبق وفكرت بالعودة إلى علاقة قديمة؟",
"هل تحب السيطرة في العلاقة؟",
"هل خنت أحد في يوم من الأيام؟",
"ما هو أكثر شيء يجعلك تبكي؟",
"هل سبق وأحببت شخصًا ولم تخبره؟",
"ما هو الشيء الذي لا يمكن أن تسامح عليه أبدًا؟",
"هل أنت سعيد في حياتك الحالية؟",
"من هو الشخص الذي تفكر فيه قبل النوم؟",
"هل تظن أن الحب يدوم للأبد؟",
"ما هو الشيء الذي لا يعرفه عنك أحد؟",
"هل سبق وأن قُطعت علاقتك بأحد بسبب الغيرة؟",
"ما أكثر شيء تخاف من فقدانه؟",
"هل تظن أنك محبوب من الناس؟",
"هل تفضل الحب أم الكرامة؟",
"هل أنت شخص انتقامي؟",
"هل سبق وقلت 'أحبك' وأنت لا تقصدها؟",
"هل تشعر بالفراغ العاطفي؟",
"هل أنت وفيّ لمن تحب؟",
"هل تمنيت يومًا إيذاء شخص؟",
"هل تثق في الحب من أول نظرة؟",
"هل تعتبر نفسك شخصًا صادقًا دائمًا؟",
"هل سبق وحطمت قلب أحد؟",
"ما هو أكثر شيء تخاف الناس أن يعرفوه عنك؟",
"هل تحكم على الناس من أول لقاء؟",
"هل لديك شخص تتمنى العودة إليه؟",
"هل تفضل أن تُكسر أم أن تكسر قلب غيرك؟",
"هل سبق وأن كرهت شخصًا كنت تحبه؟",
"ما أكثر شيء يجعلك تشعر بالذنب؟",
"هل تتجاهل مشاعرك أحيانًا؟",
"هل تخفي ألمك بابتسامة؟",
"هل سبق وادعيت السعادة وأنت لست كذلك؟",
"هل تفتقد شخصًا في هذه اللحظة؟",
"هل سبق وخذلك أحد تثق به ثقة عمياء؟",
"هل من السهل عليك الاعتذار؟",
"هل تخاف من الوحدة؟",
"هل سبق ونكرت شعورك تجاه أحد؟",
"هل تخاف من الارتباط؟",
"هل كرهت نفسك في وقت ما؟",
"هل تعتقد أن الناس تغيروا أم أنك تغيرت؟",
"هل تفضل أن تكون محبوبًا أم محترمًا؟",
"ما هو الشيء الذي لا تستطيع تقبله في شريك حياتك؟",
"هل يمكنك العيش بدون حب؟",
"هل تفكر كثيرًا في المستقبل؟",
"هل تشعر بأنك مهمش؟",
"هل سبق وأن استغلك أحد عاطفيًا؟",
"هل سبق وخنت شخصًا لأنك شعرت بالإهمال؟",
"هل مررت بتجربة حب من طرف واحد؟",
"هل يمكنك مسامحة شريكك إن أخطأ؟",
"هل تعتقد أن الحب يكفي لإنجاح العلاقة؟",
"ما هو أكثر تصرف ندمت عليه في علاقتك السابقة؟",
"هل تحب أن تكون دائمًا المسيطر في العلاقة؟",
"ما هو أكبر خطأ في حياتك العاطفية؟",
"هل تكذب في العلاقات لتجنب المشاكل؟",
"هل مررت بعلاقة مؤذية نفسيًا؟",
"هل تعتقد أنك تستحق الحب؟",
"ما أكثر شيء تبحث عنه في شريكك؟",
"هل تحب الاهتمام الزائد أم تعتبره إزعاجًا؟",
"هل جربت الغيرة المفرطة؟",
"هل تثق في الحب عبر الإنترنت؟",
"هل سبق ورفضت شخصًا ثم ندمت؟",
"ما هو أكثر شيء تفكر فيه قبل النوم؟",
"هل تخاف من الفشل العاطفي؟",
"هل تتعلق بسرعة؟",
"هل سبق وأن استغليت مشاعر شخص؟",
"هل تعتقد أن الحب عذاب؟",
"هل أنت مستعد للتضحية من أجل الحب؟",
"هل سبق وأن تعرضت للخيانة؟",
"ما هي نظرتك للحب الحقيقي؟",
"هل تؤمن بالفرص الثانية؟",
"ما أصعب شيء في الانفصال؟",
"هل سبق وأن أحببت شخصًا مرتبطًا؟",
"هل جربت أن تكون بديلًا في حياة أحد؟",
"هل تخاف أن تكون وحيدًا في النهاية؟",
"هل يمكنك الاستمرار في علاقة بدون حب؟",
"هل سبق وحطمت قلب شخص دون قصد؟",
"هل تتحمل المسؤولية في العلاقة؟",
"ما هو أكثر شيء يجذبك في الطرف الآخر؟",
"هل تعتقد أن الماضي يؤثر على الحب؟",
"هل تشعر بالغيرة من علاقات الآخرين؟",
"هل تظن أنك شخص يستحق الثقة؟",
"هل سبق وخذلت نفسك؟",
"هل تخفي مشاعرك عن الجميع؟",
"هل تتمنى أن يحبك شخص محدد؟",
"هل جرحت أحد بكلماتك؟",
"هل شعرت يومًا بأنك غير كافٍ؟",
"هل تعيش من أجل الآخرين أم من أجل نفسك؟",
"هل سبق وأنكرت حبك لشخص بسبب الخوف؟",
"ما هو أكثر شيء يجعلك تنسحب من العلاقة؟",
"هل تؤمن أن الوقت كفيل بنسيان من نحب؟",
"هل لديك شخص تعتبره حب حياتك؟",
"هل تنسى بسهولة من أذاك؟",
"ما هو أكثر موقف محرج مررت به؟",
"هل تحب أن تكون وحيدًا أحيانًا؟",
"هل سبق وتمنيت الرجوع لشخص رحل؟",
"ما هو أسوأ شعور مررت به؟",
"هل أنت قوي من الداخل كما تبدو من الخارج؟",
"هل تخاف من التعبير عن مشاعرك؟",
"ما الشيء الذي تتمنى تغييره في نفسك؟",
"هل سبق وخذلت شخصًا يحبك؟",
"هل علاقتك الأخيرة كانت تجربة جميلة أم مؤلمة؟",
"هل تؤمن أن الحب يمكن أن يتحول إلى كره؟",
"ما هو أكثر تصرف طفولي قمت به؟",
"هل تفكر في الانتقام ممن أذاك؟",
"هل تخفي حزنك عن المقربين؟",
"هل تعتقد أن الصراحة دائمًا أفضل؟",
"هل تعيش الماضي أم الحاضر؟",
"ما أكثر شيء تفقد السيطرة عليه؟",
"هل يمكنك مسامحة شخص كذب عليك؟",
"هل سبق وأبكيت أحد بقصد؟",
"هل تؤمن أن الحب يغير الأشخاص؟",
"هل سبق وتمنيت زوال النعمة من أحد؟",
"هل تعاني من تقلبات مزاجية؟",
"ما هو أصعب قرار اتخذته؟",
"هل سبق وأن شعرت بالوحدة وأنت بين الناس؟",
"هل تثق في من تحب بسرعة؟",
"هل خيالك أحيانًا يسبب لك مشاكل؟",
"هل تحكم على مشاعر غيرك؟",
"هل تفضل الصراحة أم المجاملة؟",
"هل تؤمن أن بعض الأسئلة لا تستحق الإجابة؟",
"هل تؤمن أن الغيرة دليل حب؟",
"هل تفضل أن تُحب أكثر أم تُحِب أكثر؟",
"هل سبق وأحرجك شخص أمام الآخرين؟",
"هل تحب أن تبقى علاقاتك الخاصة سرية؟",
"ما أكثر شيء يجعلك تغضب؟",
"هل أنت شخص انتقائي في الحب؟",
"هل تعتقد أن الحب أحيانًا مؤلم أكثر مما هو جميل؟",
"هل سبق وأن شعرت أن لا أحد يفهمك؟",
"هل تثق أن قلبك يمكن أن يحب مرة أخرى بعد الانكسار؟",
"ما هو الشيء الذي تتمناه في شريك حياتك؟",
"هل سبق وتمنيت لو أنك لم تحب يومًا؟",
"هل تعتقد أنك مستعد لدخول علاقة جديدة؟",
"هل تشعر أنك تحتاج للعزلة أحيانًا؟",
"ما أكثر شيء يثير غيرتك؟",
"هل أنت شخص مزاجي في الحب؟",
"ما هي فكرتك عن الزواج؟",
"هل تؤمن أن الحب يمكن أن يشفى؟",
"هل تعرضت يومًا لخذلان غير متوقع؟",
"هل تتظاهر بالقوة وأنت ضعيف؟",
"هل سبق وشعرت أنك فقدت نفسك في علاقة؟",
"هل سبق وخفت أن تعترف بمشاعرك؟",
"ما الشيء الذي لا تريد تكراره في علاقة قادمة؟",
"هل سبق وتجاهلت مشاعر شخص لأنك لا تبادله الشعور؟",
"هل تعتقد أن الحب وحده يكفي لبناء علاقة؟",
"ما هو أكثر شيء يجعلك تثق بشخص؟",
"هل تؤمن أن القلوب تتلاقى مهما فرقتها المسافات؟",
"هل يمكنك أن تحب أكثر من مرة بنفس القوة؟",
"ما هو أصعب شيء واجهته في علاقتك الأخيرة؟",
"هل تحب أن تبوح بكل شيء لشريكك؟",
"هل تخاف من أن تُرفض؟",
"هل شعرت يومًا أنك تخسر نفسك وأنت تحاول إرضاء غيرك؟",
"ما هو أكثر شيء تخشاه في الحب؟"
      ],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "waiting"
    });
    
    window.location.href = `room.html?room=${roomId}`;
  } catch (error) {
    console.error("Error creating room:", error);
    alert("حدث خطأ أثناء إنشاء الغرفة: " + error.message);
    createRoomBtn.disabled = false;
    createRoomBtn.innerHTML = '<i class="fas fa-plus-circle mr-2"></i> إنشاء غرفة';
  }
}

// الانضمام إلى غرفة موجودة
async function joinRoom() {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode || roomCode.length !== 6) {
    alert("الرجاء إدخال رمز غرفة صحيح (6 أحرف)");
    return;
  }

  if (!auth.currentUser) {
    alert('يجب تسجيل الدخول أولاً');
    return;
  }

  joinRoomBtn.disabled = true;
  joinRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const roomRef = db.collection("rooms").doc(roomCode);
    const roomDoc = await roomRef.get();
    
    if (!roomDoc.exists) {
      throw new Error("لا توجد غرفة بهذا الرمز");
    }
    
    window.location.href = `room.html?room=${roomCode}`;
  } catch (error) {
    console.error("Error joining room:", error);
    alert("حدث خطأ أثناء الانضمام: " + error.message);
  } finally {
    joinRoomBtn.disabled = false;
    joinRoomBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
  }
}

// تعيين معالج الأحداث
if (createRoomBtn) createRoomBtn.addEventListener('click', createRoom);
if (joinRoomBtn) joinRoomBtn.addEventListener('click', joinRoom);
if (authBtn) authBtn.addEventListener('click', signInWithGoogle);
if (authBtnLarge) authBtnLarge.addEventListener('click', signInWithGoogle);

// السماح بالضغط على Enter في حقل الانضمام
if (roomCodeInput) {
  roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinRoom();
    }
  });
}

// مراقبة حالة المصادقة
auth.onAuthStateChanged((user) => {
  updateUI();
});