import React, { useState, useEffect, useRef } from 'react';
import { 
  User, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Layout, 
  Loader2, FileText, Eye, ShieldCheck, GraduationCap, ClipboardList, 
  Stethoscope, Clock, AlertCircle, FileSearch, Timer, Plus, 
  RefreshCw, Trash2, BookOpen, Lock, Unlock, EyeOff, ArrowLeft, ArrowRight,
  Trophy, Settings, Key, AlertTriangle
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, 
  deleteDoc, updateDoc, query
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';

// --- КОНФИГУРАЦИЯ FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCgoD4vZCEU2W_w3TzE3102JcnlXnocmMg",
  authDomain: "surgery-app-89c4c.firebaseapp.com",
  projectId: "surgery-app-89c4c",
  storageBucket: "surgery-app-89c4c.firebasestorage.app",
  messagingSenderId: "1026236136369",
  appId: "1:1026236136369:web:11807c6845c4719a939b90",
  measurementId: "G-1P2WMCMEMC"
};

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
const ADMIN_PASSWORD_SECRET = "601401";

const App = () => {
  const [view, setView] = useState('welcome'); 
  const [user, setUser] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [debugLog, setDebugLog] = useState(""); 

  const [sessionGeminiKey, setSessionGeminiKey] = useState("");

  useEffect(() => {
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_KEY) {
        setSessionGeminiKey(import.meta.env.VITE_GEMINI_KEY);
      }
    } catch (e) {}
  }, []);

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
      if (!u) signInAnonymously(auth).catch(e => console.error(e));
      else setUser(u);
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
      setResults(data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    });
    return () => unsubscribe();
  }, [user, isAdminAuthenticated]);

  useEffect(() => {
    if (view === 'quiz' && activeMaterial?.questions) {
      const totalSeconds = activeMaterial.questions.length * 120;
      setTimeLeft(totalSeconds);
      if (timerRef.current) clearInterval(timerRef.current);
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
    setTimeout(() => setToastMessage(null), 5000);
  };

  const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
  };

  // --- ЛОГИКА ГЕНЕРАЦИИ (ПРЯМОЙ ЗАПРОС) ---
  const handleGenerateTest = async (existing = null) => {
    setDebugLog(""); 
    const text = existing ? existing.content : inputText;
    const title = existing ? existing.title : inputTitle;
    
    if (!text.trim() || !title.trim()) return showToast("Заполните поля!");
    if (!sessionGeminiKey) return showToast("ВВЕДИТЕ КЛЮЧ В ЗЕЛЕНОЕ ПОЛЕ!");

    setIsLoading(true);

    // Используем ТОЛЬКО одну, самую вероятную модель
    // v1beta - это важно для бесплатных ключей
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${sessionGeminiKey}`;

    const prompt = `
      You are a medical professor. 
      Generate exactly 30 multiple-choice questions in Russian based on the text.
      
      STRICT JSON FORMAT ONLY. No markdown.
      [{"text": "Question?", "options": ["A", "B", "C", "D"], "correctIndex": 0}]

      TEXT:
      ${text.substring(0, 45000)}
    `;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await res.json();
      
      if (!res.ok) {
        // Показываем ПОЛНЫЙ текст ошибки, чтобы понять причину
        const errorDetails = JSON.stringify(data.error, null, 2);
        setDebugLog(`API ERROR (${res.status}): ${errorDetails}`);
        throw new Error(data.error?.message || "Ошибка API");
      }

      let rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      const start = rawContent.indexOf('[');
      const end = rawContent.lastIndexOf(']') + 1;
      
      if (start === -1 || end <= 0) {
          setDebugLog("Ответ ИИ не содержит JSON: " + rawContent.substring(0, 100));
          throw new Error("Неверный формат ответа");
      }
      
      const cleanJson = rawContent.substring(start, end);
      const questions = JSON.parse(cleanJson);
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', existing?.id || crypto.randomUUID()), { 
        title, content: text, questions, updatedAt: Date.now(), isVisible: existing?.isVisible ?? false 
      });
      
      showToast("Тест создан!");
      setView('admin-materials');
      setInputText(''); setInputTitle('');
    } catch (e) { 
      console.error(e);
      if (!debugLog) setDebugLog(e.message); 
      showToast("ОШИБКА (См. красный лог)");
    } finally { setIsLoading(false); }
  };

  const handleSaveTasks = async () => {
    if (!inputText.trim() || !inputTitle.trim()) return showToast("Заполните поля!");
    setIsLoading(true);
    try {
      const blocks = inputText.split(/задача/i).filter(b => b.trim().length > 10);
      const tasks = blocks.map((b, i) => {
        const parts = b.split(/ответ/i);
        return { id: i + 1, text: parts[0]?.trim(), answer: parts[1]?.trim() || "Не указан" };
      });
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', crypto.randomUUID()), { title: inputTitle, tasks, createdAt: Date.now(), isVisible: false, isAnswersEnabled: false });
      showToast("Задачи сохранены!");
      setView('admin-tasks-list');
    } catch (e) { showToast("Ошибка сохранения"); } finally { setIsLoading(false); }
  };

  const finishQuiz = async () => {
    if (!activeMaterial) return;
    clearInterval(timerRef.current);
    const score = studentAnswers.reduce((acc, ans, idx) => acc + (ans === activeMaterial.questions[idx].correctIndex ? 1 : 0), 0);
    const total = activeMaterial.questions.length;
    await addDoc(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results'), { 
      studentName, materialTitle: activeMaterial.title, score, total, percentage: Math.round((score/total)*100), spentTime: formatTime((total*120)-timeLeft), timestamp: Date.now(), dateString: new Date().toLocaleString('ru-RU') 
    });
    setView('result');
  };

  const renderCurrentView = () => {
    if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-black animate-pulse uppercase tracking-widest text-center">Подключение...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl text-center flex flex-col items-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mb-6 flex items-center justify-center shadow-xl"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-10 opacity-70 text-center">Аттестационный портал</p>
            <div className="space-y-4 w-full">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 text-slate-800 text-center font-bold" />
              <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase">Войти</button>
              <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-4 block w-full text-center">Администрирование</button>
            </div>
          </div>
        </div>
      );
      case 'menu': return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-12 text-center">
          <h2 className="text-white text-4xl font-black uppercase tracking-tighter text-center">Меню</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl text-center">
            <button onClick={() => setView('student-select-test')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all group flex flex-col items-center">
              <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform"><ClipboardList className="text-emerald-600 w-8 h-8" /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Тестирование</h3>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all group flex flex-col items-center">
              <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform"><Stethoscope className="text-blue-600 w-8 h-8" /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Задачи</h3>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 hover:text-white uppercase font-black text-xs tracking-[0.3em] flex items-center gap-2 transition-colors"><ArrowLeft className="w-4 h-4"/> Выход</button>
        </div>
      );
      case 'admin-login': return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl flex flex-col items-center text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10 text-center" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 font-black text-center text-slate-900 tracking-[1em] text-3xl mb-10 shadow-inner text-center" />
            <button onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Ошибка")} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl">Войти</button>
          </div>
        </div>
      );
      case 'admin': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
          <div className="max-w-7xl w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-16 text-center">
              <div className="text-left"><h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Управление</h1></div>
              <div className="flex flex-wrap gap-4 justify-center">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-lg hover:bg-blue-700 flex items-center gap-2"><Stethoscope className="w-5 h-5" /> Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-sm hover:bg-slate-50 flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-xl hover:bg-emerald-700 flex items-center gap-2"><Plus className="w-5 h-5" /> Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-5 rounded-xl text-[10px] font-black border-2 border-slate-100">Выход</button>
              </div>
            </div>
            
            <div className="bg-emerald-950 p-8 rounded-[3rem] mb-12 shadow-2xl flex flex-col md:flex-row items-center gap-6 border-4 border-emerald-500/20 text-center">
                <div className="bg-emerald-500 p-4 rounded-2xl"><Key className="text-white w-8 h-8" /></div>
                <div className="flex-1 text-left">
                    <h3 className="text-white font-black uppercase text-sm mb-1 text-left">Ключ Gemini API</h3>
                    <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest text-left">Введите ваш рабочий ключ здесь.</p>
                </div>
                <input type="password" value={sessionGeminiKey} onChange={(e) => setSessionGeminiKey(e.target.value)} placeholder="AIzaSy..." className="flex-1 p-5 bg-white/10 border-2 border-white/10 rounded-2xl text-white font-mono text-sm outline-none focus:border-emerald-500" />
            </div>

            {debugLog && (
                <div className="bg-red-950 p-6 rounded-2xl mb-10 border-2 border-red-500 text-left text-red-200 font-mono text-xs overflow-auto max-w-4xl mx-auto">
                    <div className="font-bold mb-2">ПОСЛЕДНЯЯ ОШИБКА:</div>
                    {debugLog}
                </div>
            )}

            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col text-left">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-xs tracking-[0.3em]">Журнал результатов</div>
              <div className="overflow-x-auto p-10">
                <table className="w-full text-left min-w-[950px]">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black text-left">
                    <tr><th className="px-10 py-8">Курсант</th><th className="px-10 py-8">Тема</th><th className="px-10 py-8 text-center">Результат %</th><th className="px-10 py-8 text-right">Статус</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm font-bold text-left">
                    {results.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-10 py-8 text-left"><div className="flex items-center gap-5 text-left"><div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl border-2 ${r.percentage >= 70 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-600'}`}>{r.studentName?.charAt(0)}</div><div className="text-left"><p className="font-black text-slate-900 text-lg uppercase text-left">{r.studentName}</p><p className="text-[10px] font-bold text-slate-400 uppercase text-left">{r.dateString}</p></div></div></td>
                        <td className="px-10 py-8 text-slate-600 uppercase truncate max-w-[200px] text-left">{r.materialTitle}</td>
                        <td className="px-10 py-8 text-center font-black text-3xl text-slate-900">{r.percentage}%</td>
                        <td className="px-10 py-8 text-right"><span className={`inline-block px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-50 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      );
      case 'setup-test': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center flex flex-col items-center">
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="bg-emerald-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center text-center"><Plus className="w-12 h-12 text-emerald-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Создание ИИ Теста</h2>
                <div className="space-y-6 text-left w-full mt-10">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Тема теста" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] shadow-emerald-500/20 text-xl flex items-center justify-center gap-6 text-center">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center"/> : <RefreshCw className="w-8 h-8 text-center"/>} 
                  {isLoading ? "ГЕНЕРАЦИЯ..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );
      case 'admin-materials': return <div className="p-10 bg-slate-50 min-h-screen text-center flex flex-col items-center"><button onClick={() => setView('admin')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2 self-start"><ArrowLeft className="w-4 h-4" /> Назад</button><div className="grid gap-4 max-w-4xl w-full">{materials.map(m => <div key={m.id} className="bg-white p-6 rounded-2xl shadow flex justify-between items-center text-left"><h4 className="font-black text-slate-900 uppercase text-left">{m.title}</h4><div className="flex gap-4"><button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), {isVisible: !m.isVisible})} className={`p-4 rounded-xl ${m.isVisible ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{m.isVisible ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}</button><button onClick={() => deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id))} className="p-4 bg-red-50 text-red-500 rounded-xl"><Trash2 className="w-5 h-5"/></button></div></div>)}</div></div>;
      case 'admin-tasks-list': return <div className="p-10 bg-slate-50 min-h-screen text-center flex flex-col items-center"><button onClick={() => setView('admin')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2 self-start"><ArrowLeft className="w-4 h-4" /> Назад</button><button onClick={() => setView('setup-tasks')} className="mb-6 w-full max-w-4xl bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-xs">Добавить задачи</button><div className="grid gap-4 max-w-4xl w-full">{taskSections.map(s => <div key={s.id} className="bg-white p-6 rounded-2xl shadow flex justify-between items-center text-left"><h4 className="font-black text-slate-900 uppercase text-left">{s.title}</h4><div className="flex gap-4"><button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), {isVisible: !s.isVisible})} className={`p-4 rounded-xl ${s.isVisible ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{s.isVisible ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}</button><button onClick={() => deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id))} className="p-4 bg-red-50 text-red-500 rounded-xl"><Trash2 className="w-5 h-5"/></button></div></div>)}</div></div>;
      case 'setup-tasks': return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4"><div className="max-w-4xl w-full bg-white p-10 rounded-[3rem] text-center flex flex-col items-center"><button onClick={() => setView('admin-tasks-list')} className="mb-8 text-slate-400 font-black uppercase text-xs flex items-center gap-2 self-start"><ArrowLeft className="w-4 h-4" /> Назад</button><h2 className="text-3xl font-black uppercase mb-6">Новые задачи</h2><input value={inputTitle} onChange={e => setInputTitle(e.target.value)} className="w-full p-6 bg-slate-50 rounded-2xl mb-4 font-bold text-center" placeholder="Название темы" /><textarea value={inputText} onChange={e => setInputText(e.target.value)} className="w-full h-64 p-6 bg-slate-50 rounded-2xl mb-6 font-bold text-left" placeholder="Задача [ТЕКСТ] Ответ [ЭТАЛОН]..." /><button onClick={handleSaveTasks} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase">Загрузить</button></div></div>;
      case 'student-select-test': return <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center"><div className="max-w-4xl w-full text-left"><button onClick={() => setView('menu')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Назад</button><h2 className="text-white text-3xl font-black uppercase mb-8">Тесты</h2><div className="grid gap-4">{materials.filter(m => m.isVisible).map(m => <button key={m.id} onClick={() => { setActiveMaterial(m); setStudentAnswers([]); setCurrentQuestionIndex(0); setView('quiz'); }} className="bg-white/10 p-8 rounded-3xl border-2 border-slate-800 text-white font-black text-left flex justify-between items-center uppercase">{m.title}<ChevronRight className="text-slate-600"/></button>)}</div></div></div>;
      case 'student-select-tasks': return <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center"><div className="max-w-4xl w-full text-left"><button onClick={() => setView('menu')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Назад</button><h2 className="text-white text-3xl font-black uppercase mb-8">Задачи</h2><div className="grid gap-4">{taskSections.filter(t => t.isVisible).map(t => <button key={t.id} onClick={() => { setActiveTaskSection(t); setCurrentTaskIndex(0); setShowAnswerLocally(false); setView('task-viewer'); }} className="bg-white/10 p-8 rounded-3xl border-2 border-slate-800 text-white font-black text-left flex justify-between items-center uppercase">{t.title}<ChevronRight className="text-slate-600"/></button>)}</div></div></div>;
      case 'quiz': 
        if (!activeMaterial) return null;
        const q_quiz = activeMaterial.questions[currentQuestionIndex];
        const isAns_quiz = studentAnswers[currentQuestionIndex] !== undefined;
        return <div className="min-h-screen bg-slate-950 flex flex-col items-center text-center"><div className="w-full p-5 bg-slate-900 border-b border-slate-800 flex justify-between px-10 text-white font-black tabular-nums"><span>{formatTime(timeLeft)}</span><span>{currentQuestionIndex + 1} / {activeMaterial.questions.length}</span></div><div className="max-w-4xl w-full p-6 flex-1 flex flex-col justify-center text-left"><div className="bg-white p-12 rounded-[4rem] shadow-2xl mb-8"><h2 className="text-2xl font-bold text-slate-900 mb-8">{q_quiz?.text}</h2><div className="grid gap-4">{q_quiz?.options.map((opt, idx) => { const isSel = studentAnswers[currentQuestionIndex] === idx; const isCorr = idx === q_quiz.correctIndex; let cls = 'bg-slate-50 border-2 border-slate-100 text-slate-600'; if (isAns_quiz) { if (isSel) cls = isCorr ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-black' : 'bg-red-50 border-red-500 text-red-700 font-black'; else cls = isCorr ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700' : 'opacity-30 grayscale'; } return <button key={idx} disabled={isAns_quiz} onClick={() => { const a = [...studentAnswers]; a[currentQuestionIndex] = idx; setStudentAnswers(a); }} className={`w-full text-left p-6 rounded-2xl font-bold ${cls}`}>{opt}</button>})}</div></div><div className="flex justify-between px-4">{currentQuestionIndex === (activeMaterial.questions.length - 1) ? <button onClick={finishQuiz} disabled={!isAns_quiz} className="bg-emerald-600 text-white px-12 py-5 rounded-2xl font-black uppercase">Завершить</button> : <button onClick={() => setCurrentQuestionIndex(p => p + 1)} disabled={!isAns_quiz} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase">Далее</button>}</div></div></div>;
      case 'task-viewer':
        if (!activeTaskSection) return null;
        const t_case = activeTaskSection.tasks[currentTaskIndex];
        return <div className="min-h-screen bg-slate-950 flex flex-col items-center"><div className="w-full p-5 bg-slate-900 border-b border-slate-800 flex justify-between px-10 text-white font-black uppercase text-xs tracking-widest text-center"><button onClick={() => setView('student-select-tasks')} className="bg-slate-800 p-2 rounded-lg"><ArrowLeft className="w-4 h-4"/></button><span className="truncate max-w-[200px]">{activeTaskSection.title}</span><span>{currentTaskIndex + 1} / {activeTaskSection.tasks.length}</span></div><div className="max-w-4xl w-full p-6 flex-1 flex flex-col justify-center text-left text-left text-left"><div className="bg-white p-12 rounded-[4rem] shadow-2xl"><p className="text-xl font-bold text-slate-800 leading-relaxed mb-8">{t_case?.text}</p>{activeTaskSection.isAnswersEnabled && (showAnswerLocally ? <div className="bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[2.5rem] animate-in slide-in-from-top-4 shadow-inner text-left"><p className="text-emerald-900 font-bold text-xl italic">{t_case?.answer}</p></div> : <button onClick={() => setShowAnswerLocally(true)} className="w-full py-8 border-4 border-dashed border-emerald-100 text-emerald-600 rounded-[2.5rem] font-black uppercase text-xs">Показать эталон</button>)}</div><div className="flex justify-between mt-8"><button disabled={currentTaskIndex === 0} onClick={() => { setCurrentTaskIndex(p => p - 1); setShowAnswerLocally(false); }} className="bg-slate-800 p-6 rounded-3xl text-white font-black"><ArrowLeft className="w-4 h-4" /></button><button disabled={currentTaskIndex === activeTaskSection.tasks.length - 1} onClick={() => { setCurrentTaskIndex(p => p + 1); setShowAnswerLocally(false); }} className="bg-blue-600 p-6 rounded-3xl text-white font-black"><ArrowRight className="w-4 h-4" /></button></div></div></div>;
      case 'result': return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center"><div className="max-w-2xl w-full bg-white rounded-[5rem] p-20 shadow-2xl relative text-center flex flex-col items-center"><Trophy className="w-20 h-20 text-emerald-600 mb-10" /><h1 className="text-4xl font-black uppercase mb-10">Готово!</h1><div className="grid grid-cols-2 gap-8 mb-12 w-full text-center"><div className="bg-emerald-50 p-10 rounded-[3rem] border border-emerald-100"><p className="text-[10px] font-black text-emerald-400 uppercase mb-4">Баллы</p><p className="text-5xl font-black text-emerald-600">{(results[0]?.score || 0)}</p></div><div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100"><p className="text-[10px] font-black text-slate-400 uppercase mb-4">Успех</p><p className="text-5xl font-black text-slate-900">{(results[0]?.percentage || 0)}%</p></div></div><button onClick={() => setView('menu')} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black uppercase text-lg">На главную</button></div></div>;
      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col selection:bg-emerald-100 bg-slate-950 items-center justify-center text-left">
      {renderCurrentView()}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-12 py-6 rounded-[2.5rem] font-black shadow-2xl z-[100] border-2 border-slate-700 uppercase text-xs animate-in fade-in slide-in-from-bottom-4 text-center text-center text-center">
          {toastMessage}
        </div>
      )}
      {debugError && (
          <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-red-900 text-white px-10 py-5 rounded-2xl shadow-2xl z-[110] border-2 border-red-500 font-mono text-xs max-w-lg">
              <div className="font-bold mb-2">ОШИБКА API:</div>
              {debugError}
          </div>
      )}
    </div>
  );
};

export default App;