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
// ШАГ 2: НАСТРОЙКИ (ПАРОЛЬ И API)
// =========================================================

// Пароль для входа в админку
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
      if (!u) {
        signInAnonymously(auth).catch(e => console.error("Auth error", e));
      } else {
        setUser(u);
      }
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
    const text = (existing ? existing.content : inputText) || "";
    const title = (existing ? existing.title : inputTitle) || "";
    if (!text.trim() || !title.trim()) return showToast("Заполните поля!");
    if (!apiKeyGemini) return showToast("Нужен ключ Gemini!");
    
    setIsLoading(true);
    const safeText = text.substring(0, 7000); 

    try {
      // Используем gemini-1.5-flash (самая стабильная и дешевая/бесплатная)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKeyGemini}`;
      
      const payload = { 
        contents: [{ parts: [{ text: safeText }] }], 
        systemInstruction: { parts: [{ text: "Medical professor. Create 30 MCQs in JSON format only: [{\"text\":\"..\",\"options\":[\"..\"],\"correctIndex\":0}]" }] }, 
        generationConfig: { responseMimeType: "application/json" } 
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Ошибка API");
      }

      const data = await res.json();
      const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawContent) throw new Error("ИИ вернул пустой ответ");

      const questions = JSON.parse(rawContent);
      const id = existing ? existing.id : crypto.randomUUID();
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', id), { 
        title, content: text, questions, updatedAt: Date.now(), isVisible: existing?.isVisible ?? false 
      });
      
      showToast("Тест успешно создан!");
      setView('admin-materials');
      setInputText(''); setInputTitle('');
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
        return { id: i + 1, text: parts[0]?.trim(), answer: parts[1]?.trim() || "Ответ не указан" };
      });
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', crypto.randomUUID()), { 
        title: inputTitle, tasks, createdAt: Date.now(), isVisible: false, isAnswersEnabled: false 
      });
      showToast("Загружено!");
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
    if (!isFirebaseReady) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white p-10 text-center">Firebase Error. Check Config.</div>;
    if (!user) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-white font-black animate-pulse">CONNECTING...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl text-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase">Госпитальная хирургия</h1>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-10 opacity-70 text-center">Аттестационный портал</p>
            <div className="space-y-4">
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-slate-800 text-center" />
              <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg uppercase text-sm">Войти</button>
              <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[10px] font-black uppercase mt-4 block w-full tracking-widest">Админка</button>
            </div>
          </div>
        </div>
      );

      case 'menu': return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 gap-12">
          <h2 className="text-white text-4xl font-black uppercase text-center">Хирургия</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl">
            <button onClick={() => setView('student-select-test')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all group">
              <ClipboardList className="text-emerald-600 w-12 h-12 mb-8 mx-auto" />
              <h3 className="text-2xl font-black text-slate-900 uppercase">Тесты</h3>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all group">
              <Stethoscope className="text-blue-600 w-12 h-12 mb-8 mx-auto" />
              <h3 className="text-2xl font-black text-slate-900 uppercase">Задачи</h3>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 font-black uppercase text-xs flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Выход</button>
        </div>
      );

      case 'admin-login': return (
        <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-center text-slate-900 text-3xl mb-10" />
            <button onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Неверный код")} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-xs">Войти</button>
            <button onClick={() => setView('welcome')} className="text-slate-400 mt-8 block w-full text-[10px] uppercase">Отмена</button>
          </div>
        </div>
      );

      case 'admin': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-16">
              <h1 className="text-4xl font-black text-slate-900 uppercase">Админ-панель</h1>
              <div className="flex gap-4">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase">Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-4 rounded-2xl text-xs font-black uppercase">Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase">Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-4 rounded-xl text-xs font-black border-2">Выход</button>
              </div>
            </div>
            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden">
               <div className="p-10 border-b font-black uppercase text-xs tracking-widest text-center">Журнал результатов</div>
               <div className="overflow-x-auto p-10">
                 <table className="w-full text-left">
                   <thead><tr className="text-slate-400 uppercase text-[10px] font-black tracking-widest border-b"><th className="pb-4">Студент</th><th className="pb-4">Результат</th><th className="pb-4">Время</th></tr></thead>
                   <tbody>
                    {results.map(r => (
                      <tr key={r.id} className="border-b"><td className="py-6 font-black uppercase">{r.studentName}</td><td className="py-6 font-black text-2xl">{r.percentage}%</td><td className="py-6 text-slate-400">{r.spentTime}</td></tr>
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
            <div className="max-w-6xl w-full mx-auto">
                <button onClick={() => setView('admin')} className="text-slate-400 uppercase text-[10px] font-black mb-10 flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Назад</button>
                <h2 className="text-3xl font-black mb-12 uppercase">Список тестов</h2>
                <div className="space-y-4">
                  {materials.map(m => (
                    <div key={m.id} className="bg-white p-8 rounded-[2.5rem] shadow-lg flex justify-between items-center border hover:border-emerald-500 transition-all">
                      <div><h4 className="font-black text-xl uppercase">{m.title}</h4><p className="text-slate-400 text-xs font-bold uppercase">{m.questions?.length} вопросов</p></div>
                      <div className="flex gap-4">
                        <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), { isVisible: !m.isVisible })} className={`p-4 rounded-2xl ${m.isVisible ? 'bg-emerald-100 text-emerald-600' : 'bg-red-50 text-red-400'}`}>{m.isVisible ? <Unlock /> : <Lock />}</button>
                        <button onClick={() => { if(confirm("Удалить?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id)); }} className="p-4 bg-red-50 text-red-500 rounded-2xl"><Trash2 /></button>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
        </div>
      );

      case 'admin-tasks-list': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 text-left">
            <div className="max-w-6xl w-full mx-auto">
                <button onClick={() => setView('admin')} className="text-slate-400 uppercase text-[10px] font-black mb-10 flex items-center gap-2"><ArrowLeft className="w-4 h-4"/> Назад</button>
                <div className="flex justify-between items-center mb-12">
                   <h2 className="text-3xl font-black uppercase">Список задач</h2>
                   <button onClick={() => setView('setup-tasks')} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs">Добавить</button>
                </div>
                <div className="space-y-4">
                  {taskSections.map(s => (
                    <div key={s.id} className="bg-white p-8 rounded-[2.5rem] shadow-lg flex justify-between items-center border hover:border-blue-500 transition-all">
                      <div><h4 className="font-black text-xl uppercase">{s.title}</h4><p className="text-slate-400 text-xs font-bold uppercase">{s.tasks?.length} задач</p></div>
                      <div className="flex gap-4">
                        <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isVisible: !s.isVisible })} className={`p-4 rounded-2xl ${s.isVisible ? 'bg-blue-100 text-blue-600' : 'bg-red-50 text-red-400'}`}>{s.isVisible ? <Unlock /> : <Lock />}</button>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isAnswersEnabled: !s.isAnswersEnabled })} className={`p-4 rounded-2xl ${s.isAnswersEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-100'}`}><Eye /></button>
                        <button onClick={() => { if(confirm("Удалить?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id)); }} className="p-4 bg-red-50 text-red-500 rounded-2xl"><Trash2 /></button>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
        </div>
      );

      case 'setup-test': return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl p-16 rounded-[4rem] shadow-2xl relative text-center">
            <button onClick={() => setView('admin')} className="absolute top-10 left-10 text-slate-400"><ArrowLeft /></button>
            <h2 className="text-3xl font-black uppercase mb-10">Конструктор тестов ИИ</h2>
            <input value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название темы" className="w-full p-6 bg-slate-50 border-2 rounded-2xl mb-6 font-bold text-center uppercase" />
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте текст (до 7-8 страниц)..." className="w-full h-80 p-8 bg-slate-50 border-2 rounded-3xl mb-8 outline-none resize-none font-medium" />
            <button disabled={isLoading || !inputText} onClick={() => handleGenerateTest()} className="w-full bg-emerald-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-lg shadow-xl shadow-emerald-500/20 active:scale-95 transition-all">
              {isLoading ? <Loader2 className="animate-spin mx-auto w-8 h-8" /> : "Сформировать тесты"}
            </button>
          </div>
        </div>
      );

      case 'setup-tasks': return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl p-16 rounded-[4rem] shadow-2xl relative text-center">
            <button onClick={() => setView('admin-tasks-list')} className="absolute top-10 left-10 text-slate-400"><ArrowLeft /></button>
            <h2 className="text-3xl font-black uppercase mb-10">Добавить задачи</h2>
            <input value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название раздела" className="w-full p-6 bg-slate-50 border-2 rounded-2xl mb-6 font-bold text-center uppercase" />
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Задача [ТЕКСТ] Ответ [ТЕКСТ]..." className="w-full h-80 p-8 bg-slate-50 border-2 rounded-3xl mb-8 outline-none resize-none font-medium" />
            <button disabled={isLoading || !inputText} onClick={handleSaveTasks} className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-lg shadow-xl shadow-blue-500/20 active:scale-95 transition-all">Сохранить в базу</button>
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col bg-slate-950">
      {renderCurrentView()}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-10 py-5 rounded-[2rem] font-black shadow-2xl z-[100] border-4 border-slate-950 text-xs animate-in slide-in-from-bottom-5">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;