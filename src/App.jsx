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

// --- Инициализация Firebase ---
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

  // Ключ ИИ: используем состояние для безопасного хранения
  const [sessionGeminiKey, setSessionGeminiKey] = useState("");

  // Безопасное получение ключа при загрузке
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

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
  };

  // --- ИСПРАВЛЕННАЯ ЛОГИКА ГЕНЕРАЦИИ (Фикс snake_case и парсинга) ---
  const handleGenerateTest = async (existing = null) => {
    const text = existing ? existing.content : inputText;
    const title = existing ? existing.title : inputTitle;
    
    if (!text.trim() || !title.trim()) return showToast("Заполните название и текст материала!");
    if (!sessionGeminiKey) return showToast("Сначала введите API Ключ в зеленое поле!");

    setIsLoading(true);
    try {
      // ИСПРАВЛЕНО: Используем v1 и корректный snake_case в конфиге
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${sessionGeminiKey}`;
      
      const prompt = `Medical Professor Mode. TASK: Based on the clinical text provided, generate exactly 30 high-quality MCQs in Russian. 
      Format: JSON ARRAY.
      Schema: [{"text": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0}]
      
      TEXT:
      ${text.substring(0, 50000)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            response_mime_type: "application/json" // ИСПРАВЛЕНО: snake_case вместо camelCase
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Ошибка сервера ИИ");
      }

      // Умная очистка ответа
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Удаляем возможные блоки ```json или просто лишние символы
      const jsonStart = rawText.indexOf('[');
      const jsonEnd = rawText.lastIndexOf(']') + 1;
      const cleanJson = rawText.substring(jsonStart, jsonEnd);
      
      const questions = JSON.parse(cleanJson);
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', existing?.id || crypto.randomUUID()), { 
        title, content: text, questions, updatedAt: Date.now(), isVisible: existing?.isVisible ?? false 
      });
      
      showToast("Тест успешно создан!");
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
        return { id: i + 1, text: parts[0]?.trim(), answer: parts[1]?.trim() || "Ответ не указан" };
      });
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', crypto.randomUUID()), { 
        title: inputTitle, tasks, createdAt: Date.now(), isVisible: false, isAnswersEnabled: false 
      });
      showToast("Задачи сохранены!");
      setView('admin-tasks-list');
      setInputText(''); setInputTitle('');
    } catch (e) { showToast("Ошибка сохранения"); } finally { setIsLoading(false); }
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
    if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-black animate-pulse">ВХОД В СИСТЕМУ...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl text-center flex flex-col items-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mb-6 flex items-center justify-center shadow-xl"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-10 opacity-70">Аттестационный портал</p>
            <div className="space-y-4 w-full">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 text-slate-800 text-center font-bold" />
              <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">ВОЙТИ</button>
              <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-4 block w-full text-center">Панель управления</button>
            </div>
          </div>
        </div>
      );

      case 'menu': return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-12 text-center">
          <h2 className="text-white text-4xl font-black uppercase tracking-tighter text-center">Выберите раздел</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl">
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
            <button 
              onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Код неверен")} 
              className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl active:scale-95 transition-all text-xs tracking-widest text-center"
            >
              Войти
            </button>
            <button onClick={() => setView('welcome')} className="text-slate-400 font-black uppercase text-[10px] mt-8 hover:text-slate-900">Отмена</button>
          </div>
        </div>
      );

      case 'admin': return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
          <div className="max-w-7xl w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-16">
              <div className="text-left"><h1 className="text-4xl font-black text-slate-900 uppercase leading-none tracking-tighter">Управление</h1></div>
              <div className="flex flex-wrap gap-4 justify-center">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-lg"><Stethoscope className="w-5 h-5 inline mr-2" /> Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-sm"><ClipboardList className="w-5 h-5 inline mr-2" /> Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-xl"><Plus className="w-5 h-5 inline mr-2" /> Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-5 rounded-xl text-[10px] font-black border-2 border-slate-100">Выход</button>
              </div>
            </div>
            
            <div className="bg-emerald-950 p-8 rounded-[3rem] mb-12 shadow-2xl flex flex-col md:flex-row items-center gap-6 border-4 border-emerald-500/20">
                <div className="bg-emerald-500 p-4 rounded-2xl"><Key className="text-white w-8 h-8" /></div>
                <div className="flex-1 text-left">
                    <h3 className="text-white font-black uppercase text-sm mb-1">Ключ Gemini API</h3>
                    <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Введите ваш рабочий ключ здесь.</p>
                </div>
                <input 
                    type="password" 
                    value={sessionGeminiKey} 
                    onChange={(e) => setSessionGeminiKey(e.target.value)}
                    placeholder="AIzaSy..." 
                    className="flex-1 p-5 bg-white/10 border-2 border-white/10 rounded-2xl text-white font-mono text-sm outline-none focus:border-emerald-500"
                />
            </div>

            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col text-left">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-xs tracking-[0.3em] text-center">Журнал результатов</div>
              <div className="overflow-x-auto p-10 text-left">
                <table className="w-full text-left min-w-[950px] text-left">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black text-left">
                    <tr><th className="px-10 py-8">Курсант / Дата</th><th className="px-10 py-8">Тема</th><th className="px-10 py-8 text-center text-center">Результат %</th><th className="px-10 py-8 text-right text-right">Статус</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm font-bold text-left">
                    {results.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-10 py-8 text-left text-left"><div className="flex items-center gap-5 text-left text-left"><div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl border-2 ${r.percentage >= 70 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-600 text-center'}`}>{r.studentName?.charAt(0)}</div><div className="text-left text-left"><p className="font-black text-slate-900 text-lg uppercase text-left">{r.studentName}</p><p className="text-[10px] font-bold text-slate-400 uppercase text-left">{r.dateString}</p></div></div></td>
                        <td className="px-10 py-8 text-slate-600 uppercase truncate max-w-[200px] text-left">{r.materialTitle}</td>
                        <td className="px-10 py-8 text-center font-black text-3xl text-slate-900 text-center">{r.percentage}%</td>
                        <td className="px-10 py-8 text-right text-right text-right"><span className={`inline-block px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-50 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
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
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="bg-emerald-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center text-center"><Plus className="w-12 h-12 text-emerald-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Создание ИИ Теста</h2>
                <div className="space-y-6 text-left w-full mt-10">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Тема теста" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase text-xl placeholder:text-blue-200 text-center" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] shadow-emerald-500/20 text-xl flex items-center justify-center gap-6 text-center">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center"/> : <RefreshCw className="w-8 h-8 text-center"/>} 
                  {isLoading ? "ГЕНЕРАЦИЯ (30-60 сек)..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );

      case 'admin-materials': return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
            <div className="max-w-6xl w-full">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black text-[10px] uppercase mb-12 flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-16 tracking-tighter text-left text-left">База тестов</h2>
                <div className="grid gap-6">
                    {materials.map(m => (
                        <div key={m.id} className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row justify-between items-center gap-10 group hover:border-emerald-300 transition-all text-left">
                            <div className="flex items-center gap-8 flex-1 text-left text-left">
                                <div onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), { isVisible: !m.isVisible })} className={`cursor-pointer w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all ${m.isVisible ? 'bg-emerald-500 text-white shadow-xl' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'} text-center`}>{m.isVisible ? <Unlock className="w-8 h-8" /> : <Lock className="w-8 h-8" />}</div>
                                <div className="text-left text-left text-left"><h4 className="font-black text-2xl text-slate-900 uppercase mb-4 text-left">{m.title}</h4><div className="flex gap-6 items-center text-left text-left"><span className="text-[10px] font-black text-slate-400 uppercase text-left">{m.questions?.length} вопросов</span></div></div>
                            </div>
                            <div className="flex items-center gap-4 text-right text-right">
                                <button disabled={isLoading} onClick={() => handleGenerateTest(m)} className="px-8 py-5 bg-slate-100 text-slate-600 rounded-[1.5rem] font-black text-[10px] uppercase flex items-center gap-3 active:scale-95 hover:bg-emerald-50 border border-slate-200 text-center">{isLoading ? <Loader2 className="animate-spin w-4 h-4 text-center"/> : <RefreshCw className="w-4 h-4 text-center"/>} ОБНОВИТЬ</button>
                                <button onClick={() => { if(confirm("Удалить?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id)); }} className="p-6 bg-red-50 text-red-500 rounded-[1.5rem] hover:bg-red-500 hover:text-white transition-all text-center"><Trash2 className="w-6 h-6" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );

      case 'admin-tasks-list': return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
            <div className="max-w-6xl w-full">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black text-[10px] uppercase mb-12 flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-16 gap-6">
                  <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter text-left">База задач</h2>
                  <button onClick={() => setView('setup-tasks')} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase flex items-center gap-3 active:scale-95 shadow-2xl transition-all text-center text-center"><Plus className="w-5 h-5" /> Добавить</button>
                </div>
                <div className="grid gap-6">
                    {taskSections.map(s => (
                        <div key={s.id} className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row justify-between items-center gap-10 group hover:border-blue-300 transition-all text-left text-left">
                            <div className="flex items-center gap-8 flex-1 text-left text-left text-left">
                                <div onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isVisible: !s.isVisible })} className={`cursor-pointer w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all ${s.isVisible ? 'bg-blue-600 text-white shadow-xl' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'} text-center text-center`}>{s.isVisible ? <Unlock className="w-8 h-8" /> : <Lock className="w-8 h-8" />}</div>
                                <div className="text-left text-left"><h4 className="font-black text-2xl text-slate-900 uppercase mb-4 text-left">{s.title}</h4><div className="flex gap-6 items-center text-left text-left text-left text-left"><span className="text-[10px] font-black text-slate-400 uppercase text-left">{s.tasks?.length} задач</span></div></div>
                            </div>
                            <div className="flex items-center gap-4 text-right text-right">
                                <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isAnswersEnabled: !s.isAnswersEnabled })} className={`p-6 rounded-2xl transition-all ${s.isAnswersEnabled ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'} text-center text-center`}>{s.isAnswersEnabled ? <Eye className="w-6 h-6 text-center" /> : <EyeOff className="w-6 h-6 text-center" />}</button>
                                <button onClick={() => { if(confirm("Удалить?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id)); }} className="p-6 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all text-center text-center text-center"><Trash2 className="w-6 h-6 text-center" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );

      case 'setup-tasks': return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center flex flex-col items-center">
                <button onClick={() => setView('admin-tasks-list')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Добавить задачи</h2>
                <div className="space-y-6 text-left w-full mt-10">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название раздела" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-blue-600 font-bold text-slate-900 text-center uppercase text-xl placeholder:text-blue-200 text-center" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Задача [ТЕКСТ] Ответ [ЭТАЛОН]..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-blue-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={handleSaveTasks} className="w-full mt-10 bg-blue-600 hover:bg-blue-700 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] text-xl text-center">ЗАГРУЗИТЬ</button>
            </div>
        </div>
      );

      case 'student-select-test': return (
        <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center">
          <div className="max-w-4xl w-full text-left text-left">
            <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-10 flex items-center gap-2 hover:text-white transition-colors text-left"><ChevronLeft className="w-4 h-4" /> Назад</button>
            <h2 className="text-white text-4xl font-black mb-12 uppercase tracking-tight text-left">Доступные тесты</h2>
            <div className="grid gap-4 text-left">
              {materials.filter(m => m.isVisible).map(m => (
                <button key={m.id} onClick={() => { setActiveMaterial(m); setStudentAnswers([]); setCurrentQuestionIndex(0); setView('quiz'); }} className="bg-slate-800/50 hover:bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left shadow-lg text-left">
                  <div className="flex items-center gap-6 text-left">
                    <div className="bg-emerald-500 p-4 rounded-2xl shadow-lg"><ClipboardList className="text-white w-6 h-6" /></div>
                    <h4 className="text-white font-black text-xl uppercase tracking-tight text-left">{m.title}</h4>
                  </div>
                  <ChevronRight className="text-slate-600 group-hover:text-emerald-400" />
                </button>
              ))}
              {materials.filter(m => m.isVisible).length === 0 && <p className="text-blue-300 font-bold text-center py-20 opacity-40 uppercase tracking-widest text-xs text-center">В данный момент активных тестов нет</p>}
            </div>
          </div>
        </div>
      );

      case 'student-select-tasks': return (
        <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center">
            <div className="max-w-4xl w-full text-left text-left">
                <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-10 flex items-center gap-2 hover:text-white transition-colors text-left"><ArrowLeft className="w-4 h-4" /> Назад</button>
                <h2 className="text-white text-4xl font-black mb-12 uppercase tracking-tight text-left">Разделы задач</h2>
                <div className="grid gap-4 text-left">
                    {taskSections.filter(t => t.isVisible).map(t => (
                        <button key={t.id} onClick={() => { setActiveTaskSection(t); setCurrentTaskIndex(0); setShowAnswerLocally(false); setView('task-viewer'); }} className="bg-slate-800/50 hover:bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left shadow-lg text-left">
                            <div className="flex items-center gap-6 text-left">
                              <div className="bg-blue-500 p-4 rounded-2xl shadow-lg"><Stethoscope className="text-white w-6 h-6" /></div>
                              <h4 className="text-white font-black text-xl uppercase tracking-tight text-left">{t.title}</h4>
                            </div>
                            <ChevronRight className="text-slate-600 group-hover:text-blue-400" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
      );

      case 'quiz':
        const q_quiz = activeMaterial?.questions[currentQuestionIndex];
        const isAns_quiz = studentAnswers[currentQuestionIndex] !== undefined;
        return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center">
            <div className="w-full bg-slate-800/80 p-5 border-b border-slate-700 flex justify-between px-10 text-white sticky top-0 z-50 backdrop-blur-lg">
              <div className={`flex items-center gap-3 px-6 py-2 rounded-2xl font-black ${timeLeft < 60 ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}>
                <Clock className="w-5 h-5 text-center" /><span className="tabular-nums text-center">{formatTime(timeLeft)}</span>
              </div>
              <div className="font-black text-emerald-400 text-xl tracking-tighter">{currentQuestionIndex + 1} <span className="text-slate-500 font-normal">/ {activeMaterial.questions.length}</span></div>
            </div>
            <div className="max-w-4xl w-full p-6 flex-1 flex flex-col justify-center text-left">
              <div className="bg-white rounded-[3.5rem] p-12 md:p-16 shadow-2xl relative mb-10 overflow-hidden text-left text-left">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-12 leading-tight relative z-10 text-left">{q_quiz?.text}</h2>
                <div className="grid gap-4 relative z-10 text-left text-left">
                  {q_quiz?.options.map((opt, idx) => {
                    const isSel = studentAnswers[currentQuestionIndex] === idx;
                    const isCorr = idx === q_quiz.correctIndex;
                    let cls = 'border-slate-100 bg-slate-50 text-slate-600 hover:border-emerald-400 transition-all text-left';
                    if (isAns_quiz) {
                      if (isSel) cls = isCorr ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-black scale-[1.02] text-left' : 'border-red-500 bg-red-50 text-red-700 font-black text-left';
                      else cls = isCorr ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700 text-left' : 'opacity-40 grayscale text-left';
                    }
                    return <button key={idx} disabled={isAns_quiz} onClick={() => { const a = [...studentAnswers]; a[currentQuestionIndex] = idx; setStudentAnswers(a); }} className={`w-full text-left p-6 md:p-8 rounded-2xl border-2 font-bold text-lg shadow-sm ${cls}`}>{opt}</button>
                  })}
                </div>
              </div>
              <div className="flex justify-between items-center px-4 w-full max-w-4xl">
                <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(p => p - 1)} className="text-slate-400 font-black uppercase text-xs flex items-center gap-2 hover:text-white transition-all text-left"><ArrowLeft className="w-4 h-4 text-left" /> Назад</button>
                {currentQuestionIndex === (activeMaterial.questions.length - 1) 
                  ? <button onClick={finishQuiz} disabled={!isAns_quiz} className="bg-emerald-600 text-white px-12 py-5 rounded-2xl font-black shadow-xl uppercase text-sm text-center">Завершить</button>
                  : <button onClick={() => setCurrentQuestionIndex(p => p + 1)} disabled={!isAns_quiz} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black shadow-xl uppercase text-sm flex items-center gap-3 text-center">Далее <ArrowRight className="w-5 h-5" /></button>
                }
              </div>
            </div>
          </div>
        );

      case 'task-viewer':
        if (!activeTaskSection) return null;
        const t_case = activeTaskSection.tasks[currentTaskIndex];
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center text-left text-left text-left">
                <div className="w-full bg-slate-800/80 p-5 border-b border-slate-700 flex justify-between px-10 text-white uppercase font-black text-[10px] sticky top-0 z-50 backdrop-blur-lg text-center">
                    <button onClick={() => setView('student-select-tasks')} className="bg-slate-700 p-2 rounded-xl text-center"><ArrowLeft className="w-5 h-5 text-white" /></button>
                    <span className="truncate max-w-[250px] tracking-widest opacity-60 flex items-center text-center">{activeTaskSection.title}</span>
                    <span className="text-blue-400 text-lg flex items-center text-center">{currentTaskIndex + 1} <span className="text-slate-500 mx-1 text-center">/</span> {activeTaskSection.tasks.length}</span>
                </div>
                <div className="max-w-5xl w-full p-6 flex-1 flex flex-col justify-center text-left text-left">
                    <div className="bg-white rounded-[4rem] p-12 md:p-16 shadow-2xl min-h-[450px] relative text-left text-left text-left">
                        <div className="flex items-center gap-3 mb-10 text-left">
                          <span className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black text-xs uppercase shadow-lg text-left">Задача {t_case?.id}</span>
                        </div>
                        <p className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap mb-12 text-left text-left">{t_case?.text}</p>
                        {activeTaskSection.isAnswersEnabled && (
                            <div className="mt-12 pt-12 border-t border-slate-50 text-left text-left">
                                {showAnswerLocally 
                                    ? <div className="bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[2.5rem] animate-in slide-in-from-top-4 shadow-inner text-left text-left">
                                        <p className="text-emerald-600 font-black uppercase text-[10px] mb-4 tracking-widest flex items-center gap-2 text-left text-left"><CheckCircle2 className="w-4 h-4 text-left text-left"/> Эталон ответа:</p>
                                        <p className="text-emerald-900 font-bold text-xl leading-relaxed italic text-left text-left">{t_case?.answer}</p>
                                      </div>
                                    : <button onClick={() => setShowAnswerLocally(true)} className="w-full py-8 border-4 border-dashed border-emerald-100 text-emerald-600 rounded-[2.5rem] font-black uppercase text-sm hover:bg-emerald-50 transition-all flex items-center justify-center gap-4 text-center">
                                        <Eye className="w-6 h-6 text-center" /> Показать ответ
                                      </button>
                                }
                            </div>
                        )}
                    </div>
                    <div className="flex justify-between items-center px-4 mt-10 text-left text-left">
                        <button disabled={currentTaskIndex === 0} onClick={() => { setCurrentTaskIndex(p => p - 1); setShowAnswerLocally(false); }} className="bg-slate-800 p-6 rounded-3xl text-white font-black uppercase text-xs flex items-center gap-3 hover:bg-slate-700 shadow-xl text-left text-left"><ArrowLeft className="w-5 h-5 text-left" /> Назад</button>
                        <button disabled={currentTaskIndex === activeTaskSection.tasks.length - 1} onClick={() => { setCurrentTaskIndex(p => p + 1); setShowAnswerLocally(false); }} className="bg-blue-600 p-6 rounded-3xl text-white font-black uppercase text-xs flex items-center gap-3 shadow-2xl active:scale-95 transition-all text-left text-left">Вперед <ArrowRight className="w-5 h-5 text-left" /></button>
                    </div>
                </div>
            </div>
        );

      case 'result': return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
          <div className="max-w-2xl w-full bg-white rounded-[5rem] p-20 shadow-2xl relative text-center flex flex-col items-center text-center">
            <Trophy className="w-20 h-20 text-emerald-600 mx-auto mb-10 text-center" />
            <h1 className="text-4xl font-black text-slate-900 mb-10 uppercase tracking-tighter text-center">Тест завершен</h1>
            <div className="grid grid-cols-2 gap-8 mb-12 w-full text-center">
              <div className="bg-emerald-50 p-10 rounded-[3rem] border border-emerald-100 shadow-sm text-center">
                <p className="text-[10px] font-black text-emerald-400 uppercase mb-4 tracking-widest text-center">Баллы</p>
                <p className="text-6xl font-black text-emerald-600 text-center">{(results[0]?.score || 0)} <span className="text-2xl text-emerald-300 font-normal text-center">/ {(results[0]?.total || 0)}</span></p>
              </div>
              <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 shadow-sm text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest text-center text-center">Успех</p>
                <p className="text-6xl font-black text-slate-900 text-center">{(results[0]?.percentage || 0)}%</p>
              </div>
            </div>
            <button onClick={() => setView('menu')} className="w-full bg-slate-900 text-white font-black py-8 rounded-[2.5rem] shadow-2xl hover:bg-slate-800 transition-all uppercase active:scale-95 text-lg text-center">На главную</button>
          </div>
        </div>
      );

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
    </div>
  );
};

export default App;