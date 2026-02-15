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

  const [sessionGeminiKey, setSessionGeminiKey] = useState("");

  useEffect(() => {
    try {
      const metaEnv = typeof import.meta !== 'undefined' ? import.meta.env : null;
      const envKey = metaEnv?.VITE_GEMINI_KEY;
      if (envKey) setSessionGeminiKey(envKey);
    } catch (e) {
      console.warn("Environment access failed, using manual key if provided.");
    }
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

  // 1. Авторизация
  useEffect(() => {
    if (!isFirebaseReady || !auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch(e => console.error("Auth error", e));
      } else {
        setUser(u);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Загрузка данных
  useEffect(() => {
    if (!user || !db) return;
    const mRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials');
    const tRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections');
    
    const unsubM = onSnapshot(mRef, (s) => setMaterials(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubT = onSnapshot(tRef, (s) => setTaskSections(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubM(); unsubT(); };
  }, [user]);

  // 3. Результаты для админа
  useEffect(() => {
    if (!user || !isAdminAuthenticated || !db) return;
    const rRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results');
    const unsubscribe = onSnapshot(rRef, (s) => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setResults(data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    });
    return () => unsubscribe();
  }, [user, isAdminAuthenticated]);

  // 4. Таймер
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

  const handleGenerateTest = async (existing = null) => {
    const text = existing ? existing.content : inputText;
    const title = existing ? existing.title : inputTitle;
    
    if (!text.trim() || !title.trim()) return showToast("Заполните название и текст материала!");
    if (!sessionGeminiKey) return showToast("Введите API Ключ!");

    setIsLoading(true);
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${sessionGeminiKey}`;
      const prompt = `Return ONLY a JSON array of 30 medical MCQs in Russian. Format: [{"text": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}]. TEXT: ${text.substring(0, 30000)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Ошибка API");

      let rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const start = rawResponse.indexOf('[');
      const end = rawResponse.lastIndexOf(']') + 1;
      if (start === -1 || end <= 0) throw new Error("Неверный формат ответа ИИ.");
      
      const cleanJson = rawResponse.substring(start, end);
      const questions = JSON.parse(cleanJson);
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', existing?.id || crypto.randomUUID()), { 
        title, content: text, questions, updatedAt: Date.now(), isVisible: existing?.isVisible ?? false 
      });
      
      showToast("Тест создан!");
      setView('admin-materials');
      setInputText(''); setInputTitle('');
    } catch (e) { 
      console.error(e);
      showToast("Ошибка: " + e.message); 
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
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', crypto.randomUUID()), { 
        title: inputTitle, tasks, createdAt: Date.now(), isVisible: false, isAnswersEnabled: false 
      });
      showToast("Загружено!");
      setView('admin-tasks-list');
      setInputText(''); setInputTitle('');
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

  const renderCurrentView = () => {
    if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-black animate-pulse uppercase">ЗАГРУЗКА...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl text-center flex flex-col items-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mb-6 flex items-center justify-center shadow-xl"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-10">Аттестационный портал</p>
            <div className="space-y-4 w-full">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 text-slate-800 text-center font-bold" />
              <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">ВОЙТИ</button>
              <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-4 block w-full">Управление</button>
            </div>
          </div>
        </div>
      );

      case 'menu': return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 gap-8">
          <h2 className="text-white text-3xl font-black uppercase tracking-tighter text-center">Разделы</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-4xl">
            <button onClick={() => setView('student-select-test')} className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all group flex flex-col items-center">
              <ClipboardList className="text-emerald-600 w-12 h-12 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-black text-slate-900 uppercase">Тестирование</h3>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all group flex flex-col items-center">
              <Stethoscope className="text-blue-600 w-12 h-12 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-black text-slate-900 uppercase">Задачи</h3>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 hover:text-white uppercase font-black text-xs tracking-[0.3em] flex items-center gap-2 transition-colors"><ArrowLeft className="w-4 h-4"/> Выход</button>
        </div>
      );

      case 'admin-login': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl flex flex-col items-center text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 font-black text-center text-slate-900 tracking-[1em] text-3xl mb-10 shadow-inner" />
            <button onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Ошибка")} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl active:scale-95 transition-all text-xs tracking-widest">Войти</button>
          </div>
        </div>
      );

      case 'admin': return (
        <div className="min-h-screen w-full bg-slate-50 p-4 md:p-10 flex flex-col items-center">
          <div className="max-w-7xl w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12 text-center md:text-left">
              <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Панель контроля</h1>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg"><Stethoscope className="w-4 h-4" /> Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-6 py-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm"><ClipboardList className="w-4 h-4" /> Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-xl"><Plus className="w-4 h-4" /> Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-4 rounded-2xl text-[10px] font-black border-2 border-slate-100">Выход</button>
              </div>
            </div>
            
            <div className="bg-emerald-950 p-6 md:p-8 rounded-[2.5rem] mb-10 shadow-2xl flex flex-col md:flex-row items-center gap-6 border-4 border-emerald-500/20">
                <div className="bg-emerald-500 p-4 rounded-2xl"><Key className="text-white w-6 h-6" /></div>
                <div className="flex-1">
                    <h3 className="text-white font-black uppercase text-sm mb-1">API Ключ ИИ</h3>
                    <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest leading-none">Введите ключ для генерации тестов</p>
                </div>
                <input type="password" value={sessionGeminiKey} onChange={(e) => setSessionGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full md:w-64 p-4 bg-white/10 border-2 border-white/10 rounded-2xl text-white font-mono text-xs outline-none focus:border-emerald-500" />
            </div>

            <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border border-slate-100">
              <div className="p-8 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-[10px] tracking-[0.3em]">Журнал результатов</div>
              <div className="overflow-x-auto w-full">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black">
                      <tr><th className="px-8 py-6">Студент</th><th className="px-8 py-6">Тема</th><th className="px-8 py-6 text-center">Результат</th><th className="px-8 py-6 text-right">Статус</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm font-bold">
                      {results.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition-all">
                          <td className="px-8 py-6"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black border-2 ${r.percentage >= 70 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-600'}`}>{r.studentName?.charAt(0)}</div><div><p className="text-slate-900 uppercase">{r.studentName}</p><p className="text-[10px] text-slate-400">{r.dateString}</p></div></div></td>
                          <td className="px-8 py-6 text-slate-600 uppercase truncate max-w-[150px]">{r.materialTitle}</td>
                          <td className="px-8 py-6 text-center font-black text-xl text-slate-900">{r.percentage}%</td>
                          <td className="px-8 py-6 text-right"><span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-50 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

      case 'setup-test': return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="max-w-5xl w-full bg-white rounded-[3.5rem] p-8 md:p-16 shadow-2xl relative text-center flex flex-col items-center">
                <button onClick={() => setView('admin')} className="absolute top-8 left-8 text-slate-400 font-black uppercase text-[10px] flex items-center gap-2 hover:text-slate-900 transition-all"><ArrowLeft className="w-4 h-4" /> Назад</button>
                <div className="bg-emerald-100 w-20 h-20 rounded-3xl mb-8 flex items-center justify-center"><Plus className="w-10 h-10 text-emerald-600"/></div>
                <h2 className="text-3xl font-black text-slate-900 uppercase mb-2 tracking-tight">Создание ИИ Теста</h2>
                <div className="space-y-6 w-full mt-8">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Тема теста" className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase shadow-inner text-lg" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[300px] md:h-[400px] p-8 bg-slate-50 border-2 border-transparent rounded-[2.5rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-md shadow-inner scrollbar-hide" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-8 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-7 rounded-[2rem] shadow-2xl active:scale-95 transition-all uppercase tracking-widest text-lg flex items-center justify-center gap-4">
                  {isLoading ? <Loader2 className="animate-spin w-6 h-6"/> : <RefreshCw className="w-6 h-6"/>} 
                  {isLoading ? "ГЕНЕРАЦИЯ..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );

      case 'student-select-test': return (
        <div className="min-h-screen w-full bg-slate-950 p-6 flex flex-col items-center">
          <div className="max-w-4xl w-full">
            <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-8 flex items-center gap-2 hover:text-white transition-colors"><ChevronLeft className="w-4 h-4" /> Назад</button>
            <h2 className="text-white text-3xl font-black mb-10 uppercase tracking-tight">Темы тестов</h2>
            <div className="grid gap-4">
              {materials.filter(m => m.isVisible).map(m => (
                <button key={m.id} onClick={() => { setActiveMaterial(m); setStudentAnswers([]); setCurrentQuestionIndex(0); setView('quiz'); }} className="bg-slate-800/50 hover:bg-slate-800 p-6 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left shadow-lg">
                  <div className="flex items-center gap-5">
                    <div className="bg-emerald-500 p-4 rounded-2xl"><ClipboardList className="text-white w-5 h-5" /></div>
                    <h4 className="text-white font-black text-lg uppercase">{m.title}</h4>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-emerald-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      );

      case 'quiz':
        const q = activeMaterial?.questions[currentQuestionIndex];
        const isAns = studentAnswers[currentQuestionIndex] !== undefined;
        return (
          <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center">
            <div className="w-full bg-slate-900/90 p-4 border-b border-slate-800 flex justify-between px-8 text-white sticky top-0 z-50 backdrop-blur-md">
              <div className={`flex items-center gap-3 px-5 py-2 rounded-xl font-black text-sm ${timeLeft < 60 ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}>
                <Clock className="w-4 h-4" /><span className="tabular-nums">{formatTime(timeLeft)}</span>
              </div>
              <div className="font-black text-emerald-400 uppercase text-sm tracking-widest">{currentQuestionIndex + 1} / {activeMaterial.questions.length}</div>
            </div>
            <div className="max-w-4xl w-full p-6 flex-1 flex flex-col justify-center">
              <div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl mb-8 relative overflow-hidden">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-8 leading-tight">{q?.text}</h2>
                <div className="grid gap-3">
                  {q?.options.map((opt, idx) => {
                    const isSel = studentAnswers[currentQuestionIndex] === idx;
                    const isCorr = idx === q.correctIndex;
                    let cls = 'border-slate-100 bg-slate-50 text-slate-600 hover:border-emerald-400';
                    if (isAns) {
                      if (isSel) cls = isCorr ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-black' : 'border-red-500 bg-red-50 text-red-700 font-black';
                      else cls = isCorr ? 'border-emerald-200 bg-emerald-50/30 text-emerald-700' : 'opacity-40 grayscale';
                    }
                    return <button key={idx} disabled={isAns} onClick={() => { const a = [...studentAnswers]; a[currentQuestionIndex] = idx; setStudentAnswers(a); }} className={`w-full text-left p-5 md:p-6 rounded-2xl border-2 font-bold transition-all shadow-sm ${cls}`}>{opt}</button>
                  })}
                </div>
              </div>
              <div className="flex justify-between items-center px-2">
                <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(p => p - 1)} className="text-slate-500 font-black uppercase text-[10px] flex items-center gap-1 hover:text-white transition-all"><ArrowLeft className="w-3 h-3" /> Назад</button>
                {currentQuestionIndex === (activeMaterial.questions.length - 1) 
                  ? <button onClick={finishQuiz} disabled={!isAns} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black shadow-xl uppercase text-xs">Завершить</button>
                  : <button onClick={() => setCurrentQuestionIndex(p => p + 1)} disabled={!isAns} className="bg-blue-600 text-white px-10 py-4 rounded-xl font-black shadow-xl uppercase text-xs">Далее</button>
                }
              </div>
            </div>
          </div>
        );

      case 'result': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-[4rem] p-12 md:p-16 shadow-2xl text-center">
            <Trophy className="w-16 h-16 text-emerald-600 mx-auto mb-8" />
            <h1 className="text-3xl font-black text-slate-900 mb-10 uppercase tracking-tighter">Результат сохранен</h1>
            <div className="grid grid-cols-2 gap-6 mb-10">
              <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100"><p className="text-[10px] font-black text-emerald-400 uppercase mb-2">Баллы</p><p className="text-4xl font-black text-emerald-600">{results[0]?.score || 0}</p></div>
              <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100"><p className="text-[10px] font-black text-slate-400 uppercase mb-2">Успех</p><p className="text-4xl font-black text-slate-900">{results[0]?.percentage || 0}%</p></div>
            </div>
            <button onClick={() => setView('menu')} className="w-full bg-slate-900 text-white font-black py-6 rounded-[2rem] shadow-xl hover:bg-slate-800 transition-all uppercase active:scale-95 text-md">На главную</button>
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col selection:bg-emerald-100 bg-slate-950 items-center justify-center overflow-x-hidden">
      <div className="w-full max-w-full overflow-x-hidden flex flex-col flex-1">
        {renderCurrentView()}
      </div>
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black shadow-2xl z-[100] border-2 border-slate-700 uppercase text-[10px] animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;