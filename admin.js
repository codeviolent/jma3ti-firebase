import { auth } from './firebase.js';
import paymentSystem from './payment.js';

// عناصر الواجهة
const transactionsList = document.getElementById('transactions-list');
const logoutBtn = document.getElementById('logout-btn');
const pendingCount = document.getElementById('pending-count');

// تحميل المعاملات
function loadTransactions() {
  return paymentSystem.watchAllTransactions((transactions) => {
    pendingCount.textContent = transactions.length;
    transactionsList.innerHTML = '';
    
    if (transactions.length === 0) {
      transactionsList.innerHTML = `
        <tr>
          <td colspan="7" class="px-6 py-4 text-center text-gray-500">
            لا توجد معاملات قيد الانتظار
          </td>
        </tr>
      `;
      return;
    }
    
    transactions.forEach((transaction) => {
      const row = document.createElement('tr');
      row.className = 'transaction-row';
      
      const date = transaction.createdAt?.toDate() || new Date();
      const formattedDate = date.toLocaleString('ar-EG');
      
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap font-mono">${transaction.id}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex items-center">
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900">${transaction.userName || 'مستخدم'}</div>
              <div class="text-sm text-gray-500">${transaction.userId}</div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${transaction.senderNumber}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-600">${transaction.amount} د.ج</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${getPlanName(transaction.planId)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formattedDate}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button data-id="${transaction.id}" class="verify-btn px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-2">
            <i class="fas fa-check mr-1"></i> تحقق
          </button>
          <button data-id="${transaction.id}" class="reject-btn px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">
            <i class="fas fa-times mr-1"></i> رفض
          </button>
        </td>
      `;
      
      transactionsList.appendChild(row);
    });

    // إضافة معالجات الأحداث للأزرار
    document.querySelectorAll('.verify-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من التحقق من هذه المعاملة؟')) {
          const transactionId = btn.getAttribute('data-id');
          const result = await paymentSystem.verifyTransaction(transactionId, auth.currentUser.uid);
          
          if (result.success) {
            alert('تم التحقق من المعاملة بنجاح');
          } else {
            alert(`حدث خطأ: ${result.error}`);
          }
        }
      });
    });

    document.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من رفض هذه المعاملة؟')) {
          const transactionId = btn.getAttribute('data-id');
          const transactionRef = doc(db, "transactions", transactionId);
          
          try {
            await updateDoc(transactionRef, {
              status: "rejected",
              rejectedAt: serverTimestamp(),
              rejectedBy: auth.currentUser.uid
            });
            alert('تم رفض المعاملة بنجاح');
          } catch (error) {
            alert(`حدث خطأ: ${error.message}`);
          }
        }
      });
    });
  });
}

function getPlanName(planId) {
  const plans = {
    'basic': 'الباقة الأساسية',
    'pro': 'الباقة الاحترافية',
    'premium': 'الباقة المميزة'
  };
  return plans[planId] || planId;
}

// تسجيل الخروج
logoutBtn.addEventListener('click', () => {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  });
});

// مراقبة حالة المصادقة
auth.onAuthStateChanged((user) => {
  if (user) {
    // تحقق إذا كان المستخدم مشرفاً
    const isAdmin = user.email === 'admin@example.com'; // استبدل بالإيميل الخاص بك
    
    if (!isAdmin) {
      alert('ليس لديك صلاحية الدخول إلى هذه الصفحة');
      window.location.href = 'index.html';
    } else {
      const unsubscribe = loadTransactions();
      
      // تنظيف المشاهدات عند مغادرة الصفحة
      window.addEventListener('beforeunload', () => {
        unsubscribe();
      });
    }
  } else {
    window.location.href = 'index.html';
  }
});