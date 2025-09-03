import { db, serverTimestamp } from './firebase.js';
import { doc, setDoc, updateDoc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const paymentSystem = {
  // إضافة معاملة جديدة
  async addTransaction(userId, transactionData) {
    try {
      const transactionRef = doc(collection(db, "transactions"), transactionData.transactionId);
      await setDoc(transactionRef, {
        ...transactionData,
        userId: userId,
        status: "pending",
        createdAt: serverTimestamp(),
        verified: false
      });
      return { success: true, transactionId: transactionRef.id };
    } catch (error) {
      console.error("Error adding transaction:", error);
      return { success: false, error: error.message };
    }
  },

  // التحقق من المعاملة
  async verifyTransaction(transactionId, adminId) {
    try {
      const transactionRef = doc(db, "transactions", transactionId);
      await updateDoc(transactionRef, {
        status: "verified",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminId
      });
      
      // تحديث حالة المستخدم بعد التحقق
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        const transaction = transactionSnap.data();
        const userRef = doc(db, "users", transaction.userId);
        await updateDoc(userRef, {
          isPremium: true,
          planId: transaction.planId,
          premiumSince: serverTimestamp()
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error("Error verifying transaction:", error);
      return { success: false, error: error.message };
    }
  },

  // الحصول على حالة المعاملة
  async getTransactionStatus(transactionId) {
    try {
      const transactionRef = doc(db, "transactions", transactionId);
      const docSnap = await getDoc(transactionRef);
      
      if (docSnap.exists()) {
        return { success: true, data: docSnap.data() };
      } else {
        return { success: false, error: "Transaction not found" };
      }
    } catch (error) {
      console.error("Error getting transaction:", error);
      return { success: false, error: error.message };
    }
  },

  // مراقبة حالة المعاملة (للواجهة الأمامية)
  watchTransaction(transactionId, callback) {
    const transactionRef = doc(db, "transactions", transactionId);
    return onSnapshot(transactionRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      } else {
        callback(null);
      }
    });
  },

  // الحصول على جميع المعاملات (للوحة التحكم)
  watchAllTransactions(callback) {
    const q = query(collection(db, "transactions"), where("status", "==", "pending"));
    return onSnapshot(q, (snapshot) => {
      const transactions = [];
      snapshot.forEach((doc) => {
        transactions.push({ id: doc.id, ...doc.data() });
      });
      callback(transactions);
    });
  }
};

export default paymentSystem;