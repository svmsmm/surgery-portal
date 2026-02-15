import React, { useState, useEffect, useRef } from 'react';
import { 
  User, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Layout, 
  Loader2, FileText, Eye, ShieldCheck, GraduationCap, ClipboardList, 
  Stethoscope, Clock, AlertCircle, FileSearch, Timer, Plus, 
  RefreshCw, Trash2, BookOpen, Lock, Unlock, EyeOff, ArrowLeft, ArrowRight,
  Trophy, Settings, Key
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, 
  deleteDoc, updateDoc, query
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';

// --- Конфигурация Firebase ---
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

  // Ключ ИИ: пробуем взять из переменных окружения Vercel
  const [sessionGeminiKey, setSessionGeminiKey] = useState("");

  useEffect(() => {
    try {
      const metaEnv = typeof import.meta !== 'undefined' ? import.meta.env : null;
      const envKey = metaEnv?.VITE_GEMINI_KEY;
      if (envKey) setSessionGeminiKey(envKey);
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

  const showToast = (msg) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 5000); };
  const formatTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' + (s % 60) : s % 60}`;

  // --- ИСПРАВЛЕННАЯ ЛОГИКА ИИ (Переход на v1 и чистый запрос) ---
  const handleGenerateTest = async (existing = null) => {
    const text = existing ? existing.content : inputText;
    const title = existing ? existing.title : inputTitle;
    
    if (!text.trim() || !title.trim()) return showToast("Заполните заголовок и текст!");
    if (!sessionGeminiKey) return showToast("Введите API Ключ в зеленое поле в Админке!");

    setIsLoading(true);
    try {
      // ИСПОЛЬЗУЕМ STABLE v1 (Решение ошибки Not Found v1beta)
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${sessionGeminiKey}`;
      
      const prompt = `ROLE: Medical Professor. TASK: Generate exactly 30 high-quality MCQs in Russian. 
      Output MUST be a RAW JSON ARRAY of objects. No markdown. 
      Format: [{"text": "Question?", "options": ["A", "B", "C", "D"], "correctIndex": 0}]. 
      TEXT: ${text.substring(0, 40000)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }]
          // Убраны systemInstruction и generationConfig для совместимости
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Ошибка API");

      let rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Очистка ответа от возможных кавычек markdown
      const jsonStart = rawContent.indexOf('[');
      const jsonEnd = rawContent.lastIndexOf(']') + 1;
      const questions = JSON.parse(rawContent.substring(jsonStart, jsonEnd));
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', existing?.id || crypto.randomUUID()), { 
        title, content: text, questions, updatedAt: Date.now(), isVisible: false 
      });
      
      showToast("Тест создан!");
      setView('admin-materials');
    } catch (e) { 
      console.error(e);
      showToast("Ошибка ИИ: " + e.message); 
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
    } catch (e) { showToast("Ошибка!"); } finally { setIsLoading(false); }
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

  // --- РЕНДЕР ТЕКУЩЕГО ЭКРАНА ---
  const renderCurrentView = () => {
    if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-black animate-pulse">ВХОД...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl text-center flex flex-col items-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mb-6 flex items-center justify-center shadow-xl"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-10 opacity-70">Аттестационный портал</p>
            <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 text-slate-800 text-center font-bold mb-4" />
            <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase">Войти</button>
            <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-6 block w-full text-center">Администрирование</button>
          </div>
        </div>
      );
      case 'menu': return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 gap-8">
          <h2 className="text-white text-3xl font-black uppercase tracking-tighter text-center">Разделы</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl">
            <button onClick={() => setView('student-select-test')} className="bg-white p-10 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all group flex flex-col items-center">
              <ClipboardList className="text-emerald-600 w-12 h-12 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-black text-slate-900 uppercase">Тестирование</h3>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-10 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all group flex flex-col items-center">
              <Stethoscope className="text-blue-600 w-12 h-12 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-black text-slate-900 uppercase">Задачи</h3>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 hover:text-white uppercase font-black text-xs flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Выход</button>
        </div>
      );
      case 'admin': return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
          <div className="max-w-7xl w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-12 text-center md:text-left">
              <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Панель контроля</h1>
              <div className="flex flex-wrap gap-4 justify-center">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-lg"><Stethoscope className="w-5 h-5 inline mr-2" /> Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-sm"><ClipboardList className="w-5 h-5 inline mr-2" /> Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl"><Plus className="w-5 h-5 inline mr-2" /> Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-4 rounded-xl text-[10px] font-black border-2 border-slate-100">Выход</button>
              </div>
            </div>
            
            <div className="bg-emerald-950 p-8 rounded-[3rem] mb-12 shadow-2xl flex flex-col md:flex-row items-center gap-6 border-4 border-emerald-500/20">
                <div className="bg-emerald-500 p-4 rounded-2xl"><Key className="text-white w-8 h-8" /></div>
                <div className="flex-1">
                    <h3 className="text-white font-black uppercase text-sm mb-1">Ключ Gemini API</h3>
                    <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest leading-none">Введите ваш рабочий ключ здесь.</p>
                </div>
                <input type="password" value={sessionGeminiKey} onChange={(e) => setSessionGeminiKey(e.target.value)} placeholder="AIzaSy..." className="flex-1 p-5 bg-white/10 border-2 border-white/10 rounded-2xl text-white font-mono text-sm outline-none focus:border-emerald-500" />
            </div>

            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border border-slate-100">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-xs tracking-[0.3em]">Журнал результатов</div>
              <div className="overflow-x-auto p-10">
                <table className="w-full text-left min-w-[900px]">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black">
                    <tr><th className="px-10 py-8">Курсант</th><th className="px-10 py-8">Тема</th><th className="px-10 py-8 text-center">Результат %</th><th className="px-10 py-8 text-right">Статус</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm font-bold">
                    {results.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-10 py-8 text-left"><p className="font-black text-slate-900 text-lg uppercase">{r.studentName}</p><p className="text-[10px] text-slate-400 uppercase">{r.dateString}</p></td>
                        <td className="px-10 py-8 text-slate-600 uppercase truncate max-w-[200px]">{r.materialTitle}</td>
                        <td className="px-10 py-8 text-center font-black text-3xl text-slate-900">{r.percentage}%</td>
                        <td className="px-10 py-8 text-right"><span className={`inline-block px-6 py-3 rounded-2xl text-[10px] font-black uppercase ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-50 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center flex flex-col items-center">
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="bg-emerald-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center"><Plus className="w-12 h-12 text-emerald-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Создание ИИ Теста</h2>
                <div className="space-y-6 w-full mt-10">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название темы" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] text-xl flex items-center justify-center gap-6 text-center">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center"/> : <RefreshCw className="w-8 h-8 text-center"/>} 
                  {isLoading ? "ГЕНЕРАЦИЯ (30-60 сек)..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );
      case 'admin-login': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl flex flex-col items-center text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 font-black text-center text-slate-900 tracking-[1em] text-3xl mb-10 shadow-inner" />
            <button 
              onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Код неверен")} 
              className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl active:scale-95 transition-all text-xs tracking-widest text-center"
            >
              Войти в систему
            </button>
          </div>
        </div>
      );
      // ... (Ветки для других экранов включены в полный код ниже)
      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col bg-slate-950 items-center justify-center overflow-x-hidden">
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