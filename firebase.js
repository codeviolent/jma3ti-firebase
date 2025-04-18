import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3vUkDU4rLDxcIfY0ZYXzvw8GznlG9gc8",
    authDomain: "bechar-8b049.firebaseapp.com",
    databaseURL: "https://bechar-8b049-default-rtdb.firebaseio.com",
    projectId: "bechar-8b049",
    storageBucket: "bechar-8b049.firebasestorage.app",
    messagingSenderId: "394161915136",
    appId: "1:394161915136:web:23da8f9f82393f66af5fe5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion };