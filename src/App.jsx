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
// ШАГ 1: КОНФИГУРАЦИЯ FIREBASE (ЭТО БЕЗОПАСНО)
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

// --- Инициализация ---
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

  // Динамический ключ ИИ (не хранится в коде!)
  const [sessionGeminiKey, setSessionGeminiKey] = useState('');

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
    const unsubM = onSnapshot(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials'), (s) => setMaterials(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubT = onSnapshot(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections'), (s) => setTaskSections(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubM(); unsubT(); };
  }, [user]);

  useEffect(() => {
    if (!user || !isAdminAuthenticated || !db) return;
    const unsubR = onSnapshot(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results'), (s) => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        setResults(data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    });
    return () => unsubR();
  }, [user, isAdminAuthenticated]);

  useEffect(() => {
    if (view === 'quiz' && activeMaterial?.questions) {
      setTimeLeft(activeMaterial.questions.length * 120);
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

  const handleGenerateTest = async (existing = null) => {
    const text = (existing ? existing.content : inputText) || "";
    const title = (existing ? existing.title : inputTitle) || "";
    
    if (!text.trim() || !title.trim()) return showToast("Заполните название и текст!");
    if (!sessionGeminiKey) return showToast("Сначала введите API Ключ в поле выше!");
    
    setIsLoading(true);
    const safeText = text.substring(0, 120000); 

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${sessionGeminiKey}`;
      
      const payload = {
        contents: [{ parts: [{ text: `ROLE: Medical Professor. TASK: Create 30 MCQs based on text. Output ONLY raw JSON array: [{"text":"Q","options":["A","B","C","D"],"correctIndex":0}]. TEXT: ${safeText}` }] }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.message || "Ошибка API");

      const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const questions = JSON.parse(rawContent);
      const id = existing ? existing.id : crypto.randomUUID();
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', id), { 
        title, content: text, questions, updatedAt: Date.now(), isVisible: false 
      });
      
      showToast("Тест создан успешно!");
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
      showToast("Задачи сохранены!");
      setView('admin-tasks-list');
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
    if (!user) return <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center text-white font-black animate-pulse">ПОДКЛЮЧЕНИЕ...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl text-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-xl"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-10 opacity-70">Аттестационный портал</p>
            <div className="space-y-4">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 font-bold text-slate-800 text-center transition-all" />
              <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-sm">Войти</button>
              <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-4 block w-full tracking-widest">Панель управления</button>
            </div>
          </div>
        </div>
      );

      case 'menu': return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 gap-12 text-center">
          <h2 className="text-white text-4xl font-black uppercase tracking-tighter">Выберите раздел</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl text-left">
            <button onClick={() => setView('student-select-test')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all group flex flex-col items-center">
              <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform"><ClipboardList className="text-emerald-600 w-8 h-8" /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Тестирование</h3>
              <p className="text-slate-400 font-bold text-xs uppercase mt-3">Контроль по протоколам</p>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all group flex flex-col items-center">
              <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform"><Stethoscope className="text-blue-600 w-8 h-8" /></div>
              <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Задачи</h3>
              <p className="text-slate-400 font-bold text-xs uppercase mt-3">Клинические кейсы</p>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 hover:text-white uppercase font-black text-xs tracking-[0.3em] flex items-center gap-2 transition-colors"><ArrowLeft className="w-4 h-4"/> Выход</button>
        </div>
      );

      case 'admin-login': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl flex flex-col items-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 font-black text-center text-slate-900 tracking-[1em] text-3xl mb-10 shadow-inner" />
            <button 
              onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Код неверен")} 
              className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl active:scale-95 transition-all text-xs tracking-widest text-center"
            >
              Войти в систему
            </button>
            <button onClick={() => setView('welcome')} className="text-slate-400 font-black uppercase text-[10px] mt-8 block w-full tracking-widest hover:text-slate-900 text-center">Отмена</button>
          </div>
        </div>
      );

      case 'admin': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
          <div className="max-w-7xl w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-16">
              <div className="text-left"><h1 className="text-5xl font-black text-slate-900 uppercase leading-none tracking-tighter">Панель контроля</h1><p className="text-emerald-600 font-black uppercase text-[10px] mt-4 tracking-widest">Госпитальная хирургия</p></div>
              <div className="flex flex-wrap gap-4 justify-center">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-3 shadow-lg hover:bg-blue-700 transition-all text-center"><Stethoscope className="w-5 h-5 text-center" /> Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-3 shadow-sm hover:bg-slate-50 transition-all text-center"><ClipboardList className="text-white w-5 h-5 text-center" /> Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-3 shadow-xl hover:bg-emerald-700 transition-all text-center"><Plus className="w-5 h-5 text-center" /> Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-5 rounded-xl text-[10px] font-black border-2 border-slate-100 text-center">Выход</button>
              </div>
            </div>
            
            {/* БЕЗОПАСНЫЙ ВВОД КЛЮЧА API */}
            <div className="bg-emerald-950 p-8 rounded-[2.5rem] mb-12 shadow-2xl flex flex-col md:flex-row items-center gap-6 border-4 border-emerald-500/20">
                <div className="bg-emerald-500 p-4 rounded-2xl"><Key className="text-white w-8 h-8" /></div>
                <div className="flex-1 text-left">
                    <h3 className="text-white font-black uppercase text-sm mb-1">Ключ Gemini API (Для ИИ)</h3>
                    <p className="text-emerald-400 text-[10px] font-bold uppercase">Вставьте новый ключ здесь. Он не сохраняется на GitHub!</p>
                </div>
                <input 
                    type="password" 
                    value={sessionGeminiKey} 
                    onChange={(e) => setSessionGeminiKey(e.target.value)}
                    placeholder="AIzaSy..." 
                    className="flex-1 p-5 bg-white/10 border-2 border-white/10 rounded-2xl text-white font-mono text-sm outline-none focus:border-emerald-500"
                />
            </div>

            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-xs tracking-[0.3em] text-center">Журнал результатов</div>
              <div className="overflow-x-auto p-10">
                <table className="w-full text-left min-w-[950px]">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-widest text-left">
                    <tr><th className="px-10 py-8">Курсант / Дата</th><th className="px-10 py-8">Тема</th><th className="px-10 py-8 text-center">Результат %</th><th className="px-10 py-8 text-center text-center">Ошибки</th><th className="px-10 py-8 text-center text-center">Время</th><th className="px-10 py-8 text-right">Статус</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm font-bold text-left">
                    {results.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-10 py-8"><div className="flex items-center gap-5 text-left"><div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl border-2 ${r.percentage >= 70 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-600'}`}>{r.studentName?.charAt(0)}</div><div className="text-left"><p className="font-black text-slate-900 text-lg uppercase leading-tight">{r.studentName}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1">{r.dateString}</p></div></div></td>
                        <td className="px-10 py-8 text-slate-600 uppercase truncate max-w-[200px]">{r.materialTitle}</td>
                        <td className="px-10 py-8 text-center font-black text-3xl text-slate-900">{r.percentage}%</td>
                        <td className="px-10 py-8 text-center font-black text-red-500 text-lg">{(r.total || 0) - (r.score || 0)} <span className="text-slate-300 font-normal text-xs ml-1">из {r.total}</span></td>
                        <td className="px-10 py-8 text-center font-black text-slate-500 tabular-nums">{r.spentTime}</td>
                        <td className="px-10 py-8 text-right"><span className={`inline-block px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
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
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
            <div className="max-w-6xl w-full">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black text-[10px] uppercase mb-12 flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-16 tracking-tighter text-left">Библиотека тестов</h2>
                <div className="grid gap-6">
                    {materials.map(m => (
                        <div key={m.id} className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row justify-between items-center gap-10 group hover:border-emerald-300 transition-all text-left">
                            <div className="flex items-center gap-8 flex-1 text-left">
                                <div onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), { isVisible: !m.isVisible })} className={`cursor-pointer w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all ${m.isVisible ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'}`}>{m.isVisible ? <Unlock className="w-8 h-8" /> : <Lock className="w-8 h-8" />}</div>
                                <div className="text-left text-left text-left"><h4 className="font-black text-2xl text-slate-900 uppercase leading-none mb-4 text-left">{m.title}</h4><div className="flex gap-6 items-center text-left text-left"><span className="text-[10px] font-black text-slate-400 uppercase text-left">{m.questions?.length} вопросов</span><span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${m.isVisible ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{m.isVisible ? "ОТКРЫТ" : "СКРЫТ"}</span></div></div>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                                <button disabled={isLoading} onClick={() => handleGenerateTest(m)} className="px-8 py-5 bg-slate-100 text-slate-600 rounded-[1.5rem] font-black text-[10px] uppercase flex items-center gap-3 active:scale-95 hover:bg-emerald-50 border border-slate-200">{isLoading ? <Loader2 className="animate-spin w-4 h-4"/> : <RefreshCw className="w-4 h-4"/>} ОБНОВИТЬ ИИ</button>
                                <button onClick={() => { if(confirm("Удалить этот тест?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id)); }} className="p-6 bg-red-50 text-red-500 rounded-[1.5rem] hover:bg-red-500 hover:text-white transition-all text-center"><Trash2 className="w-6 h-6" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );

      case 'admin-tasks-list': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left flex flex-col items-center">
            <div className="max-w-6xl w-full">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black text-[10px] uppercase mb-12 flex items-center gap-3 hover:text-slate-900 transition-all self-start"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-16 gap-6">
                  <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter text-left">Библиотека задач</h2>
                  <button onClick={() => setView('setup-tasks')} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase flex items-center gap-3 active:scale-95 shadow-2xl transition-all text-center"><Plus className="w-5 h-5" /> Добавить задачи</button>
                </div>
                <div className="grid gap-6 text-left">
                    {taskSections.map(s => (
                        <div key={s.id} className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl flex flex-col md:flex-row justify-between items-center gap-10 group hover:border-blue-300 transition-all text-left">
                            <div className="flex items-center gap-8 flex-1 text-left text-left">
                                <div onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isVisible: !s.isVisible })} className={`cursor-pointer w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all ${s.isVisible ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'}`}>{s.isVisible ? <Unlock className="w-8 h-8 text-center" /> : <Lock className="w-8 h-8 text-center" />}</div>
                                <div className="text-left text-left"><h4 className="font-black text-2xl text-slate-900 uppercase leading-none mb-4 text-left">{s.title}</h4><div className="flex gap-6 items-center text-left"><span className="text-[10px] font-black text-slate-400 uppercase text-left">{s.tasks?.length} задач</span><span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${s.isAnswersEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-300'}`}>{s.isAnswersEnabled ? "ОТВЕТЫ ВКЛЮЧЕНЫ" : "ОТВЕТЫ ВЫКЛЮЧЕНЫ"}</span></div></div>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                                <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isAnswersEnabled: !s.isAnswersEnabled })} className={`p-6 rounded-2xl transition-all ${s.isAnswersEnabled ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{s.isAnswersEnabled ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}</button>
                                <button onClick={() => { if(confirm("Удалить блок задач?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id)); }} className="p-6 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all text-center"><Trash2 className="w-6 h-6 text-center" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );

      case 'setup-test': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-center">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center animate-in slide-in-from-bottom-10 flex flex-col items-center">
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5 text-left" /> Назад</button>
                <div className="bg-emerald-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center"><Plus className="w-12 h-12 text-emerald-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Создание ИИ Теста</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-12 text-center text-center">Вставьте текст лекции (до 30 страниц), и нейросеть создаст 30 вопросов</p>
                <div className="space-y-6 text-left w-full text-left">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Тема теста" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl placeholder:text-blue-200" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] shadow-emerald-500/20 text-xl flex items-center justify-center gap-6">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center"/> : <RefreshCw className="w-8 h-8 text-center"/>} 
                  {isLoading ? "ИИ АНАЛИЗИРУЕТ ТЕКСТ (30-60 сек)..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );

      case 'setup-tasks': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-center">
            <div className="max-w-5xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center animate-in slide-in-from-bottom-10 flex flex-col items-center">
                <button onClick={() => setView('admin-tasks-list')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="bg-blue-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center"><Stethoscope className="w-12 h-12 text-blue-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Новый раздел задач</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-12 text-center text-center">Добавьте ситуационные задачи с эталонами ответов</p>
                <div className="space-y-6 text-left w-full text-left">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название раздела" className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:bg-white focus:border-blue-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl placeholder:text-slate-300" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Формат: Задача [ТЕКСТ] Ответ [ЭТАЛОН]..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-slate-100 rounded-[3rem] focus:bg-white focus:border-blue-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={handleSaveTasks} className="w-full mt-10 bg-blue-600 hover:bg-blue-700 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] text-xl">ЗАГРУЗИТЬ В БАЗУ ДАННЫХ</button>
            </div>
        </div>
      );

      case 'quiz':
        if (!activeMaterial) return null;
        const q_quiz = activeMaterial.questions[currentQuestionIndex];
        const isAns_quiz = studentAnswers[currentQuestionIndex] !== undefined;
        return (
          <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center">
            <div className="w-full bg-slate-800/80 p-5 border-b border-slate-700 flex justify-between px-10 text-white sticky top-0 z-50 backdrop-blur-lg text-center">
              <div className={`flex items-center gap-3 px-6 py-2 rounded-2xl font-black ${timeLeft < 60 ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}>
                <Clock className="w-5 h-5 text-center" /><span className="tabular-nums text-center">{formatTime(timeLeft)}</span>
              </div>
              <div className="font-black text-emerald-400 text-xl text-center">{currentQuestionIndex + 1} <span className="text-slate-500 font-normal">/ {activeMaterial.questions.length}</span></div>
            </div>
            <div className="max-w-4xl w-full p-6 flex-1 flex flex-col justify-center text-left">
              <div className="bg-white rounded-[3.5rem] p-12 md:p-16 shadow-2xl relative mb-10 overflow-hidden text-left">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[5rem] -mr-10 -mt-10 opacity-50 text-left" />
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-12 leading-tight relative z-10 text-left">{q_quiz?.text}</h2>
                <div className="grid gap-4 relative z-10 text-left text-left">
                  {q_quiz?.options.map((opt, idx) => {
                    const isSel = studentAnswers[currentQuestionIndex] === idx;
                    const isCorr = idx === q_quiz.correctIndex;
                    let cls = 'border-slate-100 bg-slate-50 text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left';
                    if (isAns_quiz) {
                      if (isSel) cls = isCorr ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-black scale-[1.02] text-left' : 'border-red-500 bg-red-50 text-red-700 font-black text-left';
                      else cls = isCorr ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700 text-left' : 'opacity-40 grayscale text-left';
                    }
                    return (
                      <button key={idx} disabled={isAns_quiz} onClick={() => { const a = [...studentAnswers]; a[currentQuestionIndex] = idx; setStudentAnswers(a); }} className={`w-full text-left p-6 md:p-8 rounded-2xl border-2 font-bold text-lg shadow-sm ${cls}`}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between items-center px-4 w-full max-w-4xl text-left">
                <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(p => p - 1)} className="text-slate-400 font-black uppercase text-xs flex items-center gap-2 hover:text-white transition-all text-left"><ArrowLeft className="w-4 h-4" /> Назад</button>
                {currentQuestionIndex === (activeMaterial.questions.length - 1) 
                  ? <button onClick={finishQuiz} disabled={!isAns_quiz} className="bg-emerald-600 text-white px-12 py-5 rounded-2xl font-black shadow-xl active:scale-95 transition-all uppercase tracking-widest text-sm text-center">Завершить</button>
                  : <button onClick={() => setCurrentQuestionIndex(p => p + 1)} disabled={!isAns_quiz} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black shadow-xl active:scale-95 transition-all uppercase tracking-widest text-sm flex items-center gap-3 text-center">Далее <ArrowRight className="w-5 h-5" /></button>
                }
              </div>
            </div>
          </div>
        );

      case 'task-viewer':
        if (!activeTaskSection) return null;
        const task = activeTaskSection.tasks[currentTaskIndex];
        return (
            <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center text-left text-left">
                <div className="w-full bg-slate-800/80 p-5 border-b border-slate-700 flex justify-between px-10 text-white uppercase font-black text-[10px] sticky top-0 z-50 backdrop-blur-lg text-center">
                    <button onClick={() => setView('student-select-tasks')} className="bg-slate-700 p-2 rounded-xl text-center"><ArrowLeft className="w-5 h-5 text-white" /></button>
                    <span className="truncate max-w-[250px] tracking-widest opacity-60 flex items-center text-center">{activeTaskSection.title}</span>
                    <span className="text-blue-400 text-lg flex items-center text-center">{currentTaskIndex + 1} <span className="text-slate-500 mx-1 text-center">/</span> {activeTaskSection.tasks.length}</span>
                </div>
                <div className="max-w-5xl w-full p-6 flex-1 flex flex-col justify-center text-left">
                    <div className="bg-white rounded-[4rem] p-12 md:p-16 shadow-2xl min-h-[450px] relative text-left">
                        <div className="flex items-center gap-3 mb-10 text-left">
                          <span className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black text-xs uppercase shadow-lg text-left">Задача {task?.id}</span>
                        </div>
                        <p className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap mb-12 text-left">{task?.text}</p>
                        {activeTaskSection.isAnswersEnabled && (
                            <div className="mt-12 pt-12 border-t border-slate-50 text-left">
                                {showAnswerLocally 
                                    ? <div className="bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[2.5rem] animate-in slide-in-from-top-4 shadow-inner text-left">
                                        <p className="text-emerald-600 font-black uppercase text-[10px] mb-4 tracking-widest flex items-center gap-2 text-left text-left"><CheckCircle2 className="w-4 h-4 text-left"/> Эталон ответа:</p>
                                        <p className="text-emerald-900 font-bold text-xl leading-relaxed italic text-left">{task?.answer}</p>
                                      </div>
                                    : <button onClick={() => setShowAnswerLocally(true)} className="w-full py-8 border-4 border-dashed border-emerald-100 text-emerald-600 rounded-[2.5rem] font-black uppercase text-sm hover:bg-emerald-50 hover:border-emerald-200 transition-all flex items-center justify-center gap-4 group text-center">
                                        <Eye className="w-6 h-6 group-hover:scale-110 transition-transform text-center" /> Показать правильный ответ
                                      </button>
                                }
                            </div>
                        )}
                    </div>
                    <div className="flex justify-between items-center px-4 mt-10 text-left text-left">
                        <button disabled={currentTaskIndex === 0} onClick={() => { setCurrentTaskIndex(p => p - 1); setShowAnswerLocally(false); }} className="bg-slate-800 p-6 rounded-3xl text-white font-black uppercase text-xs flex items-center gap-3 hover:bg-slate-700 transition-all shadow-xl text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                        <button disabled={currentTaskIndex === activeTaskSection.tasks.length - 1} onClick={() => { setCurrentTaskIndex(p => p + 1); setShowAnswerLocally(false); }} className="bg-blue-600 p-6 rounded-3xl text-white font-black uppercase text-xs flex items-center gap-3 shadow-2xl shadow-blue-500/20 active:scale-95 transition-all text-left">Вперед <ArrowRight className="w-5 h-5" /></button>
                    </div>
                </div>
            </div>
        );

      case 'result': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 text-center">
          <div className="max-w-2xl w-full bg-white rounded-[5rem] p-20 shadow-2xl relative text-center animate-in zoom-in duration-500 flex flex-col items-center">
            <div className="bg-emerald-100 w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-10 shadow-xl text-center">
              <Trophy className="w-16 h-16 text-emerald-600 text-center" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4 uppercase tracking-tighter leading-none text-center">Тест завершен</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-12 text-center text-center">Ваш результат сохранен в базе данных</p>
            <div className="grid grid-cols-2 gap-8 mb-16 w-full text-center">
              <div className="bg-emerald-50 p-10 rounded-[3rem] border border-emerald-100 shadow-sm text-center text-center">
                <p className="text-[10px] font-black text-emerald-400 uppercase mb-4 tracking-widest text-center">Баллы</p>
                <p className="text-6xl font-black text-emerald-600 text-center">{(results[0]?.score || 0)} <span className="text-2xl text-emerald-300 font-normal text-center">/ {(results[0]?.total || 0)}</span></p>
              </div>
              <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 shadow-sm text-center text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest text-center">Процент</p>
                <p className="text-6xl font-black text-slate-900 text-center">{(results[0]?.percentage || 0)}<span className="text-2xl font-normal opacity-30 text-center">%</span></p>
              </div>
            </div>
            <button onClick={() => setView('menu')} className="w-full bg-slate-900 text-white font-black py-8 rounded-[2.5rem] shadow-2xl hover:bg-slate-800 transition-all uppercase active:scale-95 text-lg text-center">Вернуться в меню</button>
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col selection:bg-emerald-100 selection:text-emerald-900 bg-slate-950 items-center justify-center">
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