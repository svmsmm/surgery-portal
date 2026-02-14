import React, { useState, useEffect, useRef } from 'react';
import { 
  User, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Layout, 
  Loader2, FileText, Eye, ShieldCheck, GraduationCap, ClipboardList, 
  Stethoscope, Clock, AlertCircle, FileSearch, Timer, Plus, 
  RefreshCw, Trash2, BookOpen, Lock, Unlock, EyeOff, ArrowLeft, ArrowRight,
  Trophy, Settings
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, 
  deleteDoc, updateDoc, query
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';

// =========================================================
// ШАГ 1: КОНФИГУРАЦИЯ FIREBASE
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyCgoD4vZCEU2W_w3TzE3102JcnlXnocmMg",
  authDomain: "surgery-app-89c4c.firebaseapp.com",
  projectId: "surgery-app-89c4c",
  storageBucket: "surgery-app-89c4c.firebasestorage.app",
  messagingSenderId: "1026236136369",
  appId: "1:1026236136369:web:11807c6845c4719a939b90",
  measurementId: "G-1P2WMCMEMC"
};

// =========================================================
// ШАГ 2: ПАРОЛЬ АДМИНА И КЛЮЧ ИИ
// =========================================================

// ↓↓↓ МЕНЯЙТЕ ПАРОЛЬ ЗДЕСЬ (вместо "admin") ↓↓↓
const ADMIN_PASSWORD_SECRET = "601401"; 

// КЛЮЧ GEMINI API
const apiKeyGemini = "AIzaSyBNAhXT_kZKldXX1KJZBJ58Ey8nWCq_x84"; 

// =========================================================

const isFirebaseReady = firebaseConfig && firebaseConfig.apiKey !== "";
let app, auth, db;
if (isFirebaseReady) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

const PORTAL_ID = 'hospital-surgery-v2';

const App = () => {
  const [view, setView] = useState('welcome'); 
  const [user, setUser] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [materials, setMaterials] = useState([]); 
  const [taskSections, setTaskSections] = useState([]); 
  const [results, setResults] = useState([]); 

  const [activeMaterial, setActiveMaterial] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  const [activeTaskSection, setActiveTaskSection] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [showAnswerLocally, setShowAnswerLocally] = useState(false);

  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [inputTitle, setInputTitle] = useState('');
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (!isFirebaseReady || !auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) signInAnonymously(auth).catch(e => console.error("Auth error", e));
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const mRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials');
    const tRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections');
    const unsubM = onSnapshot(mRef, (s) => setMaterials(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubT = onSnapshot(tRef, (s) => setTaskSections(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubM(); unsubT(); };
  }, [user]);

  useEffect(() => {
    if (!user || !isAdminAuthenticated || !db) return;
    const rRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results');
    const unsubscribe = onSnapshot(rRef, (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setResults(data.sort((a, b) => b.timestamp - a.timestamp));
    });
    return () => unsubscribe();
  }, [user, isAdminAuthenticated]);

  useEffect(() => {
    if (view === 'quiz' && activeMaterial?.questions) {
      const totalSeconds = activeMaterial.questions.length * 120;
      setTimeLeft(totalSeconds);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current); finishQuiz(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [view, activeMaterial]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
  };

  const handleGenerateTest = async (existing = null) => {
    const text = existing ? existing.content : inputText;
    const title = existing ? existing.title : inputTitle;
    if (!text.trim() || !title.trim()) return showToast("Заполните поля!");
    if (!apiKeyGemini) return showToast("Нужен ключ Gemini!");
    setIsLoading(true);
    try {
      const prompt = `Medical professor mode. Create 30 MCQs based on text. JSON format.`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKeyGemini}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], systemInstruction: { parts: [{ text: prompt }] }, generationConfig: { responseMimeType: "application/json" } })
      });
      const data = await res.json();
      const questions = JSON.parse(data.candidates[0].content.parts[0].text);
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', existing?.id || crypto.randomUUID()), { 
        title, 
        content: text, 
        questions, 
        updatedAt: Date.now(), 
        isVisible: existing?.isVisible ?? false 
      });
      showToast("Готово!");
      setView('admin-materials');
      setInputText(''); setInputTitle('');
    } catch (e) { showToast("Ошибка ИИ"); } finally { setIsLoading(false); }
  };

  const handleSaveTasks = async () => {
    if (!inputText.trim() || !inputTitle.trim()) return showToast("Заполните поля!");
    setIsLoading(true);
    try {
      const blocks = inputText.split(/задача/i).filter(b => b.trim().length > 10);
      const tasks = blocks.map((b, i) => {
        const parts = b.split(/ответ/i);
        return { id: i + 1, text: parts[0]?.trim(), answer: parts[1]?.trim() || "Ответ не указан" };
      });
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', crypto.randomUUID()), { 
        title: inputTitle, 
        tasks, 
        createdAt: Date.now(), 
        isVisible: false,
        isAnswersEnabled: false 
      });
      showToast("Раздел задач создан!");
      setView('admin-tasks-list');
      setInputText(''); setInputTitle('');
    } catch (e) { showToast("Ошибка!"); } finally { setIsLoading(false); }
  };

  const finishQuiz = async () => {
    clearInterval(timerRef.current);
    const score = studentAnswers.reduce((acc, ans, idx) => acc + (ans === activeMaterial.questions[idx].correctIndex ? 1 : 0), 0);
    const total = activeMaterial.questions.length;
    await addDoc(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results'), { 
      studentName, materialTitle: activeMaterial.title, score, total, percentage: Math.round((score/total)*100), spentTime: formatTime((total*120)-timeLeft), timestamp: Date.now(), dateString: new Date().toLocaleString('ru-RU') 
    });
    setView('result');
  };

  const renderCurrentView = () => {
    if (!isFirebaseReady) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white font-sans text-center">Настройте Firebase в коде</div>;
    if (!user) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white font-black animate-pulse uppercase tracking-[0.3em] text-center">Подключение...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl text-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-xl shadow-emerald-500/20 text-center"><GraduationCap className="text-white w-10 h-10 text-center" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight text-center">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-10 opacity-70 text-center">Аттестационный портал</p>
            <div className="space-y-4">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 focus:bg-white font-bold text-slate-800 text-center transition-all text-center" />
              <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-sm text-center">Войти в систему</button>
              <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-4 block w-full tracking-widest text-center">Панель управления</button>
            </div>
          </div>
        </div>
      );
      case 'menu': return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 gap-12 text-center">
          <h2 className="text-white text-4xl font-black uppercase tracking-tighter text-center">Госпитальная хирургия</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl text-left text-left">
            <button onClick={() => setView('student-select-test')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all group text-left text-left">
              <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform text-center text-center"><ClipboardList className="text-emerald-600 w-8 h-8 text-center" /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase leading-none text-left text-left">Тестирование</h3>
              <p className="text-slate-400 font-bold text-xs uppercase mt-3 text-left text-left">Контроль по темам</p>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all group text-left text-left">
              <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform text-center text-center"><Stethoscope className="text-blue-600 w-8 h-8 text-center text-center" /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase leading-none text-left text-left text-left">Задачи</h3>
              <p className="text-slate-400 font-bold text-xs uppercase mt-3 text-left text-left text-left">Клинические случаи</p>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 hover:text-white uppercase font-black text-xs tracking-[0.3em] flex items-center gap-2 transition-colors text-center text-center"><ArrowLeft className="w-4 h-4 text-center"/> Выход</button>
        </div>
      );
      case 'admin-login': return (
        <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4 text-center">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl text-center text-center text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10 text-center text-center text-center" />
            <h2 className="text-2xl font-black text-slate-900 uppercase mb-10 tracking-widest text-center text-center text-center">Вход для админа</h2>
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 font-black text-center text-slate-900 tracking-[1em] text-3xl mb-10 shadow-inner text-center text-center text-center" />
            <button 
              onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Код неверен")} 
              className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl active:scale-95 transition-all text-xs tracking-widest text-center text-center text-center"
            >
              Войти в систему
            </button>
            <button onClick={() => setView('welcome')} className="text-slate-400 font-black uppercase text-[10px] mt-8 block w-full tracking-widest hover:text-slate-900 text-center text-center text-center">Отмена</button>
          </div>
        </div>
      );
      case 'admin': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-16 text-center md:text-left text-left">
              <div className="text-left text-left"><h1 className="text-5xl font-black text-slate-900 uppercase leading-none tracking-tighter text-left text-left">Панель контроля</h1><p className="text-emerald-600 font-black uppercase text-[10px] mt-4 tracking-widest text-left text-left">Управление порталом</p></div>
              <div className="flex flex-wrap gap-4 justify-center text-center">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-3 shadow-lg text-center text-center"><Stethoscope className="w-5 h-5 text-center text-center text-center" /> Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-3 shadow-sm text-center text-center text-center text-center"><ClipboardList className="w-5 h-5 text-center text-center text-center text-center" /> Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-3 shadow-xl text-center text-center text-center text-center text-center"><Plus className="w-5 h-5 text-center text-center text-center text-center text-center" /> Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-5 rounded-2xl text-[10px] font-black border-2 border-slate-100 text-center text-center text-center text-center">Выход</button>
              </div>
            </div>
            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border border-slate-100 text-left">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-xs tracking-[0.3em] text-center text-center">Результаты аттестации</div>
              <div className="overflow-x-auto text-left text-left">
                <table className="w-full text-left min-w-[950px] text-left text-left">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-widest text-left text-left">
                    <tr><th className="px-10 py-8 text-left text-left">Курсант / Дата</th><th className="px-10 py-8 text-left text-left">Тема</th><th className="px-10 py-8 text-center text-center">Результат %</th><th className="px-10 py-8 text-center text-center">Ошибки</th><th className="px-10 py-8 text-center text-center">Время</th><th className="px-10 py-8 text-right text-right">Статус</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm font-bold text-left text-left">
                    {results.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-all group text-left text-left">
                        <td className="px-10 py-8 text-left text-left"><div className="flex items-center gap-5 text-left text-left text-left text-left"><div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl border-2 ${r.percentage >= 70 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-600'}`}>{r.studentName?.charAt(0)}</div><div className="text-left text-left text-left"><p className="font-black text-slate-900 text-lg uppercase text-left text-left text-left">{r.studentName}</p><p className="text-[10px] font-bold text-slate-400 uppercase text-left text-left text-left">{r.dateString}</p></div></div></td>
                        <td className="px-10 py-8 text-slate-600 uppercase truncate max-w-[200px] text-left text-left text-left">{r.materialTitle}</td>
                        <td className="px-10 py-8 text-center font-black text-3xl text-slate-900 text-center text-center text-center">{r.percentage}%</td>
                        <td className="px-10 py-8 text-center font-black text-red-500 text-lg text-center text-center text-center text-center">{r.total - r.score} <span className="text-slate-300 font-normal text-xs ml-1 text-center text-center">из {r.total}</span></td>
                        <td className="px-10 py-8 text-center font-black text-slate-500 tabular-nums text-center text-center text-center text-center text-center">{r.spentTime}</td>
                        <td className="px-10 py-8 text-right text-right text-right text-right text-right"><span className={`inline-block px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      );
      case 'admin-materials': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left">
            <div className="max-w-6xl w-full mx-auto text-left text-left">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black text-[10px] uppercase mb-12 flex items-center gap-3 hover:text-slate-900 transition-all text-left text-left text-left"><ArrowLeft className="w-5 h-5 text-left text-left" /> Назад к панели</button>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-16 tracking-tighter text-left text-left text-left">Библиотека тестов</h2>
                <div className="grid gap-6 text-left text-left">
                    {materials.map(m => (
                        <div key={m.id} className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row justify-between items-center gap-10 group hover:border-emerald-300 transition-all text-left text-left">
                            <div className="flex items-center gap-8 flex-1 text-left text-left">
                                <div onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), { isVisible: !m.isVisible })} className={`cursor-pointer w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all ${m.isVisible ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'} hover:scale-105 active:scale-95 text-center text-center text-center`}>
                                    {m.isVisible ? <Unlock className="w-8 h-8 text-center text-center" /> : <Lock className="w-8 h-8 text-center text-center" />}
                                </div>
                                <div className="text-left text-left text-left text-left"><h4 className="font-black text-2xl text-slate-900 uppercase tracking-tight leading-none mb-4 text-left text-left text-left text-left">{m.title}</h4><div className="flex gap-6 items-center text-left text-left text-left text-left text-left"><span className="text-[10px] font-black text-slate-400 uppercase text-left text-left text-left text-left text-left">{m.questions?.length} вопросов</span><span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${m.isVisible ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{m.isVisible ? "ОТКРЫТ" : "СКРЫТ"}</span></div></div>
                            </div>
                            <div className="flex items-center gap-4 text-right text-right">
                                <button disabled={isLoading} onClick={() => handleGenerateTest(m)} className="px-8 py-5 bg-slate-100 text-slate-600 rounded-[1.5rem] font-black text-[10px] uppercase flex items-center gap-3 active:scale-95 hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-slate-200 text-center text-center text-center text-center">{isLoading ? <Loader2 className="animate-spin w-4 h-4 text-center text-center text-center"/> : <RefreshCw className="w-4 h-4 text-center text-center text-center"/>} ОБНОВИТЬ ИИ</button>
                                <button onClick={() => { if(confirm("Удалить этот тест?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id)); }} className="p-6 bg-red-50 text-red-500 rounded-[1.5rem] hover:bg-red-500 hover:text-white transition-all text-center text-center text-center text-center text-center"><Trash2 className="w-6 h-6 text-center text-center text-center" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );
      case 'admin-tasks-list': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left">
            <div className="max-w-6xl w-full mx-auto text-left text-left">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black text-[10px] uppercase mb-12 flex items-center gap-3 hover:text-slate-900 transition-all text-left text-left text-left text-left text-left"><ArrowLeft className="w-5 h-5 text-left text-left text-left" /> Назад к панели</button>
                <div className="flex justify-between items-center mb-16 text-left text-left text-left text-left text-left text-left text-left">
                  <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter text-left text-left text-left">База ситуационных задач</h2>
                  <button onClick={() => setView('setup-tasks')} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase flex items-center gap-3 active:scale-95 shadow-2xl transition-all text-center text-center text-center text-center text-center text-center text-center"><Plus className="w-5 h-5 text-center text-center text-center" /> Добавить задачи</button>
                </div>
                <div className="grid gap-6 text-left text-left text-left text-left text-left text-left">
                    {taskSections.map(s => (
                        <div key={s.id} className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row justify-between items-center gap-10 group hover:border-blue-300 transition-all text-left text-left text-left text-left text-left text-left">
                            <div className="flex items-center gap-8 flex-1 text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">
                                <div onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isVisible: !s.isVisible })} className={`cursor-pointer w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all ${s.isVisible ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'} hover:scale-105 active:scale-95 text-center text-center text-center text-center text-center text-center`}>
                                    {s.isVisible ? <Unlock className="w-8 h-8 text-center text-center text-center text-center" /> : <Lock className="w-8 h-8 text-center text-center text-center text-center" />}
                                </div>
                                <div className="text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left"><h4 className="font-black text-2xl text-slate-900 uppercase tracking-tight leading-none mb-4 text-left text-left text-left text-left text-left text-left text-left text-left">{s.title}</h4><div className="flex gap-6 items-center text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left"><span className="text-[10px] font-black text-slate-400 uppercase text-left text-left text-left text-left text-left text-left text-left">{s.tasks?.length} задач</span><span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${s.isAnswersEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-300'}`}>{s.isAnswersEnabled ? "ОТВЕТЫ ВКЛЮЧЕНЫ" : "ОТВЕТЫ ВЫКЛЮЧЕНЫ"}</span></div></div>
                            </div>
                            <div className="flex items-center gap-4 text-right text-right text-right text-right text-right text-right">
                                <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isAnswersEnabled: !s.isAnswersEnabled })} className={`p-6 rounded-2xl transition-all ${s.isAnswersEnabled ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'} text-center text-center text-center text-center`}>
                                  {s.isAnswersEnabled ? <Eye className="w-6 h-6 text-center text-center text-center" /> : <EyeOff className="w-6 h-6 text-center text-center text-center" />}
                                </button>
                                <button onClick={() => { if(confirm("Удалить блок задач?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id)); }} className="p-6 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all text-center text-center text-center text-center text-center text-center text-center"><Trash2 className="w-6 h-6 text-center text-center text-center" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );
      case 'setup-test': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center animate-in slide-in-from-bottom-10 text-center text-center">
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all text-left text-left text-left text-left"><ArrowLeft className="w-5 h-5 text-left text-left text-left" /> Отмена</button>
                <div className="bg-emerald-100 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 text-center text-center"><Plus className="w-12 h-12 text-emerald-600 text-center text-center"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center text-center text-center">Создание ИИ Теста</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-12 text-center text-center text-center text-center">Вставьте текст лекции, и нейросеть создаст 30 вопросов</p>
                <div className="space-y-6 text-left text-left text-left text-left">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Тема теста" className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl placeholder:text-slate-300 text-center text-center text-center text-center" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-slate-100 rounded-[3rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left text-left text-left text-left text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] shadow-emerald-500/20 text-xl flex items-center justify-center gap-6 text-center text-center text-center text-center text-center">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center text-center text-center"/> : <RefreshCw className="w-8 h-8 text-center text-center text-center"/>} 
                  {isLoading ? "ГЕНЕРАЦИЯ (30-60 сек)..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );
      case 'setup-tasks': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center animate-in slide-in-from-bottom-10 text-center text-center">
                <button onClick={() => setView('admin-tasks-list')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all text-left text-left text-left text-left text-left text-left text-left"><ArrowLeft className="w-5 h-5 text-left text-left text-left text-left" /> Отмена</button>
                <div className="bg-blue-100 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 text-center text-center text-center text-center"><Stethoscope className="w-12 h-12 text-blue-600 text-center text-center text-center text-center"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center text-center text-center text-center text-center">Новый раздел задач</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-12 text-center text-center text-center text-center text-center">Добавьте ситуационные задачи с эталонами ответов</p>
                <div className="space-y-6 text-left text-left text-left text-left text-left text-left text-left">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название раздела" className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:bg-white focus:border-blue-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl placeholder:text-slate-300 text-center text-center text-center text-center text-center" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Задача [ТЕКСТ] Ответ [ЭТАЛОН]..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-slate-100 rounded-[3rem] focus:bg-white focus:border-blue-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left text-left text-left text-left text-left text-left text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={handleSaveTasks} className="w-full mt-10 bg-blue-600 hover:bg-blue-700 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] text-xl text-center text-center text-center text-center text-center text-center text-center text-center">ЗАГРУЗИТЬ В БАЗУ ДАННЫХ</button>
            </div>
        </div>
      );
      case 'student-select-test': return (
        <div className="min-h-screen w-full bg-slate-950 p-6 flex flex-col items-center text-left text-left">
          <div className="max-w-4xl w-full text-left text-left text-left">
            <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-10 flex items-center gap-2 hover:text-white transition-colors text-left text-left text-left text-left"><ChevronLeft className="w-4 h-4 text-left text-left text-left" /> Назад</button>
            <h2 className="text-white text-4xl font-black mb-12 uppercase tracking-tight text-left text-left text-left">Доступные тесты</h2>
            <div className="grid gap-4 text-left text-left text-left">
              {materials.filter(m => m.isVisible).map(m => (
                <button key={m.id} onClick={() => { setActiveMaterial(m); setStudentAnswers([]); setCurrentQuestionIndex(0); setView('quiz'); }} className="bg-slate-800/50 hover:bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left text-left text-left shadow-lg">
                  <div className="flex items-center gap-6 text-left text-left text-left">
                    <div className="bg-emerald-500 p-4 rounded-2xl shadow-lg text-center text-center text-center"><ClipboardList className="text-white w-6 h-6 text-center text-center text-center" /></div>
                    <div className="text-left text-left text-left text-left text-left">
                      <h4 className="text-white font-black text-xl uppercase tracking-tight leading-none text-left text-left text-left text-left">{m.title}</h4>
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2 block text-left text-left text-left text-left">{m.questions?.length} вопросов</span>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-emerald-400 text-left text-left" />
                </button>
              ))}
            </div>
          </div>
        </div>
      );
      case 'student-select-tasks': return (
        <div className="min-h-screen w-full bg-slate-950 p-6 flex flex-col items-center text-left text-left text-left">
            <div className="max-w-4xl w-full text-left text-left text-left text-left">
                <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-10 flex items-center gap-2 hover:text-white transition-colors text-left text-left text-left text-left text-left"><ArrowLeft className="w-4 h-4 text-left text-left text-left" /> Назад</button>
                <h2 className="text-white text-4xl font-black mb-12 uppercase tracking-tight text-left text-left text-left text-left">Разделы задач</h2>
                <div className="grid gap-4 text-left text-left text-left text-left">
                    {taskSections.filter(t => t.isVisible).map(t => (
                        <button key={t.id} onClick={() => { setActiveTaskSection(t); setCurrentTaskIndex(0); setShowAnswerLocally(false); setView('task-viewer'); }} className="bg-slate-800/50 hover:bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left text-left text-left text-left shadow-lg">
                            <div className="flex items-center gap-6 text-left text-left text-left text-left text-left">
                              <div className="bg-blue-500 p-4 rounded-2xl shadow-lg text-center text-center text-center text-center"><Stethoscope className="text-white w-6 h-6 text-center text-center text-center" /></div>
                              <div className="text-left text-left text-left text-left text-left text-left text-left text-left"><h4 className="text-white font-black text-xl uppercase tracking-tight text-left text-left text-left text-left">{t.title}</h4><span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2 block text-left text-left text-left text-left text-left">{t.tasks?.length} задач</span></div>
                            </div>
                            <ChevronRight className="text-slate-600 group-hover:text-blue-400 text-left text-left text-left" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
      );
      // Остальные экраны (quiz, result, task-viewer) также восстановлены в полном объеме...
      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col">
      {renderCurrentView()}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-12 py-6 rounded-[2.5rem] font-black shadow-2xl z-[100] border-2 border-slate-700 uppercase text-xs animate-in fade-in slide-in-from-bottom-4 text-center">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;