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

const ADMIN_PASSWORD_SECRET = "601401"; 
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
    setTimeout(() => setToastMessage(null), 6000);
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
    // Лимит 120 000 символов
    const safeText = text.substring(0, 120000); 

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKeyGemini}`;
      
      const promptText = `Профессор медицины. Создай на основе текста ровно 30 тестовых вопросов (4 варианта, 1 верный). Ответ СТРОГО JSON: [{"text":"?","options":["A","B","C","D"],"correctIndex":0}]. ТЕКСТ: ${safeText}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { 
            temperature: 0.1, 
            responseMimeType: "application/json",
            maxOutputTokens: 8192 
          }
        })
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Квота превышена. Google блокирует бесплатные ключи при деплое. Создайте НОВЫЙ ключ на другой аккаунт Gmail.");
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Ошибка API");
      }

      const data = await res.json();
      const questions = JSON.parse(data.candidates[0].content.parts[0].text);
      const id = existing ? existing.id : crypto.randomUUID();
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', id), { 
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
        return { id: i + 1, text: parts[0]?.trim(), answer: parts[1]?.trim() || "Ответ не указан" };
      });
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', crypto.randomUUID()), { 
        title: inputTitle, tasks, createdAt: Date.now(), isVisible: false, isAnswersEnabled: false 
      });
      showToast("Задачи сохранены!");
      setView('admin-tasks-list');
    } catch (e) { showToast("Ошибка!"); } finally { setIsLoading(false); }
  };

  const finishQuiz = async () => {
    const score = studentAnswers.reduce((acc, ans, idx) => acc + (ans === activeMaterial.questions[idx].correctIndex ? 1 : 0), 0);
    const total = activeMaterial.questions.length;
    await addDoc(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results'), { 
      studentName, materialTitle: activeMaterial.title, score, total, percentage: Math.round((score/total)*100), spentTime: formatTime((total*120)-timeLeft), timestamp: Date.now(), dateString: new Date().toLocaleString('ru-RU') 
    });
    setView('result');
  };

  const renderCurrentView = () => {
    if (!isFirebaseReady) return <div className="flex items-center justify-center text-white">Firebase Error</div>;
    if (!user) return <div className="flex items-center justify-center text-white animate-pulse">ВХОД...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl text-center">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-xl"><GraduationCap className="text-white w-10 h-10" /></div>
            <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase">Госпитальная хирургия</h1>
            <p className="text-slate-400 text-[10px] uppercase mb-10">Аттестационный портал</p>
            <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="ФИО студента" className="w-full p-5 bg-slate-50 border-2 rounded-2xl mb-6 font-bold text-center" />
            <button disabled={!studentName} onClick={() => setView('menu')} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 uppercase text-sm">Войти</button>
            <button onClick={() => setView('admin-login')} className="text-slate-400 hover:text-emerald-600 text-[9px] font-black uppercase mt-6 block w-full">Админка</button>
          </div>
        </div>
      );

      case 'menu': return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-12">
          <h2 className="text-white text-3xl font-black uppercase text-center">Хирургия</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl">
            <button onClick={() => setView('student-select-test')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl hover:border-emerald-500 border-4 transition-all">
              <ClipboardList className="text-emerald-600 w-12 h-12 mb-8 mx-auto" />
              <h3 className="text-xl font-black text-slate-900 uppercase">Тестирование</h3>
            </button>
            <button onClick={() => setView('student-select-tasks')} className="bg-white p-12 rounded-[3.5rem] shadow-2xl hover:border-blue-500 border-4 transition-all">
              <Stethoscope className="text-blue-600 w-12 h-12 mb-8 mx-auto" />
              <h3 className="text-xl font-black text-slate-900 uppercase">Задачи</h3>
            </button>
          </div>
          <button onClick={() => setView('welcome')} className="text-slate-500 font-black uppercase text-xs">Выход</button>
        </div>
      );

      case 'admin-login': return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 rounded-2xl font-black text-center text-3xl mb-10" />
            <button onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Неверно")} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase">Войти</button>
            <button onClick={() => setView('welcome')} className="text-slate-400 mt-8 block w-full text-xs uppercase">Отмена</button>
          </div>
        </div>
      );

      case 'admin': return (
        <div className="flex-1 bg-slate-50 p-6 md:p-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-16">
              <h1 className="text-4xl font-black text-slate-900 uppercase">Управление</h1>
              <div className="flex gap-4">
                <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase">Задачи</button>
                <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 px-8 py-4 rounded-2xl text-xs font-black uppercase">Тесты</button>
                <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase">Новый тест</button>
                <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-4 rounded-xl text-xs font-black border-2 hover:text-red-500">Выход</button>
              </div>
            </div>
            <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border">
              <div className="p-10 border-b font-black uppercase text-xs text-center">Журнал результатов</div>
              <div className="overflow-x-auto p-10">
                <table className="w-full text-left">
                  <thead><tr className="text-slate-400 text-[10px] uppercase font-black border-b"><th className="pb-4">Студент</th><th className="pb-4">Тема</th><th className="pb-4 text-center">Результат</th><th className="pb-4 text-right">Статус</th></tr></thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.id} className="border-b hover:bg-slate-50">
                        <td className="py-6 font-black uppercase">{r.studentName}</td>
                        <td className="py-6 text-slate-600 truncate max-w-[200px]">{r.materialTitle}</td>
                        <td className="py-6 text-center font-black text-2xl">{r.percentage}%</td>
                        <td className="py-6 text-right"><span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${r.percentage >= 70 ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>{r.percentage >= 70 ? 'Зачет' : 'Незачет'}</span></td>
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
        <div className="flex-1 bg-slate-50 p-6 md:p-12">
            <div className="max-w-6xl mx-auto">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black mb-10 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Назад</button>
                <h2 className="text-3xl font-black mb-12 uppercase">Библиотека тестов</h2>
                <div className="space-y-4">
                  {materials.map(m => (
                    <div key={m.id} className="bg-white p-8 rounded-[3rem] shadow-lg flex justify-between items-center border hover:border-emerald-300">
                      <div><h4 className="font-black text-xl uppercase">{m.title}</h4><p className="text-slate-400 text-xs font-bold">{m.questions?.length} вопросов</p></div>
                      <div className="flex gap-4">
                        <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), { isVisible: !m.isVisible })} className={`p-4 rounded-2xl ${m.isVisible ? 'bg-emerald-100 text-emerald-600' : 'bg-red-50 text-red-400'}`}>{m.isVisible ? <Unlock /> : <Lock />}</button>
                        <button onClick={() => { if(confirm("Удалить?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id)); }} className="p-4 bg-red-50 text-red-400 rounded-2xl"><Trash2 /></button>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
        </div>
      );

      case 'admin-tasks-list': return (
        <div className="flex-1 bg-slate-50 p-6 md:p-12">
            <div className="max-w-6xl mx-auto">
                <button onClick={() => setView('admin')} className="text-slate-400 font-black mb-10 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Назад</button>
                <div className="flex justify-between items-center mb-12">
                  <h2 className="text-3xl font-black uppercase">База задач</h2>
                  <button onClick={() => setView('setup-tasks')} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase">Добавить</button>
                </div>
                <div className="space-y-4">
                    {taskSections.map(s => (
                        <div key={s.id} className="bg-white p-8 rounded-[3rem] shadow-xl border flex justify-between items-center">
                            <div className="text-left"><h4 className="font-black text-xl uppercase">{s.title}</h4><p className="text-slate-400 text-xs">{s.tasks?.length} задач</p></div>
                            <div className="flex gap-4">
                                <button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), { isVisible: !s.isVisible })} className={`p-4 rounded-2xl ${s.isVisible ? 'bg-blue-600 text-white' : 'bg-red-50 text-red-400'}`}>{s.isVisible ? <Unlock /> : <Lock />}</button>
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
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl p-16 rounded-[4rem] shadow-2xl relative text-center flex flex-col items-center">
            <button onClick={() => setView('admin')} className="absolute top-10 left-10 text-slate-400"><ArrowLeft /></button>
            <h2 className="text-3xl font-black uppercase mb-10 text-slate-900">Конструктор ИИ</h2>
            <input value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название темы" className="w-full p-6 bg-slate-50 border-2 rounded-2xl mb-6 font-bold text-center text-xl uppercase" />
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте текст лекции (до 30 страниц)..." className="w-full h-80 p-8 bg-slate-50 border-2 rounded-3xl mb-8 outline-none resize-none font-bold text-slate-700" />
            <button disabled={isLoading || !inputText} onClick={() => handleGenerateTest()} className="w-full bg-emerald-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-xl shadow-xl active:scale-95 transition-all">
              {isLoading ? <Loader2 className="animate-spin mx-auto w-10 h-10" /> : "Сформировать тесты"}
            </button>
          </div>
        </div>
      );

      case 'setup-tasks': return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl p-16 rounded-[4rem] shadow-2xl relative text-center flex flex-col items-center">
            <button onClick={() => setView('admin-tasks-list')} className="absolute top-10 left-10 text-slate-400"><ArrowLeft /></button>
            <h2 className="text-3xl font-black uppercase mb-10 text-slate-900">Новые задачи</h2>
            <input value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название раздела" className="w-full p-6 bg-slate-50 border-2 rounded-2xl mb-6 font-bold text-center text-xl uppercase" />
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Задача [ТЕКСТ] Ответ [ЭТАЛОН]..." className="w-full h-80 p-8 bg-slate-50 border-2 rounded-3xl mb-8 outline-none resize-none font-bold text-slate-700" />
            <button disabled={isLoading || !inputText} onClick={handleSaveTasks} className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-xl shadow-xl active:scale-95 transition-all">Сохранить в облако</button>
          </div>
        </div>
      );
      
      case 'student-select-test': 
        return (
          <div className="flex-1 p-6 flex flex-col items-center">
            <div className="max-w-4xl w-full text-left">
              <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-10 flex items-center gap-2 hover:text-white transition-colors"><ChevronLeft className="w-4 h-4" /> Назад</button>
              <h2 className="text-white text-4xl font-black mb-12 uppercase tracking-tight">Доступные тесты</h2>
              <div className="grid gap-4">
                {materials.filter(m => m.isVisible).map(m => (
                  <button key={m.id} onClick={() => { setActiveMaterial(m); setStudentAnswers([]); setCurrentQuestionIndex(0); setView('quiz'); }} className="bg-slate-800/50 hover:bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left shadow-lg">
                    <div className="flex items-center gap-6">
                      <div className="bg-emerald-500 p-4 rounded-2xl shadow-lg"><ClipboardList className="text-white w-6 h-6" /></div>
                      <div>
                        <h4 className="text-white font-black text-xl uppercase leading-none">{m.title}</h4>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2 block">{m.questions?.length} вопросов</span>
                      </div>
                    </div>
                    <ChevronRight className="text-slate-600 group-hover:text-emerald-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'student-select-tasks': 
        return (
          <div className="flex-1 p-6 flex flex-col items-center">
            <div className="max-w-4xl w-full text-left">
              <button onClick={() => setView('menu')} className="text-slate-400 font-black text-[10px] uppercase mb-10 flex items-center gap-2 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /> Назад</button>
              <h2 className="text-white text-4xl font-black mb-12 uppercase tracking-tight">Разделы задач</h2>
              <div className="grid gap-4">
                {taskSections.filter(t => t.isVisible).map(t => (
                  <button key={t.id} onClick={() => { setActiveTaskSection(t); setCurrentTaskIndex(0); setShowAnswerLocally(false); setView('task-viewer'); }} className="bg-slate-800/50 hover:bg-slate-800 p-8 rounded-[2rem] border-2 border-slate-700 flex items-center justify-between group transition-all text-left shadow-lg">
                    <div className="flex items-center gap-6">
                      <div className="bg-blue-500 p-4 rounded-2xl shadow-lg"><Stethoscope className="text-white w-6 h-6" /></div>
                      <div>
                        <h4 className="text-white font-black text-xl uppercase leading-none">{t.title}</h4>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2 block">{t.tasks?.length} ситуаций</span>
                      </div>
                    </div>
                    <ChevronRight className="text-slate-600 group-hover:text-blue-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'task-viewer':
        if (!activeTaskSection) return null;
        const task = activeTaskSection.tasks[currentTaskIndex];
        return (
            <div className="flex-1 flex flex-col items-center">
                <div className="w-full bg-slate-800/80 p-5 border-b flex justify-between px-10 text-white sticky top-0 z-50 backdrop-blur-lg">
                    <button onClick={() => setView('student-select-tasks')}><ArrowLeft className="w-6 h-6 text-slate-400" /></button>
                    <span className="truncate max-w-[200px] tracking-widest opacity-60 flex items-center">{activeTaskSection.title}</span>
                    <span className="text-blue-400 text-lg flex items-center">{currentTaskIndex + 1} / {activeTaskSection.tasks.length}</span>
                </div>
                <div className="max-w-5xl w-full p-6 flex-1 flex flex-col justify-center">
                    <div className="bg-white rounded-[4rem] p-12 md:p-16 shadow-2xl min-h-[450px] relative text-left">
                        <span className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-black text-xs uppercase shadow-lg mb-10 inline-block">Задача {task?.id}</span>
                        <p className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap mb-12">{task?.text}</p>
                        {activeTaskSection.isAnswersEnabled && (
                            <div className="mt-12 pt-12 border-t">
                                {showAnswerLocally 
                                    ? <div className="bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[2.5rem] animate-in slide-in-from-top-4">
                                        <p className="text-emerald-600 font-black uppercase text-[10px] mb-4 tracking-widest flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Эталон ответа:</p>
                                        <p className="text-emerald-900 font-bold text-xl italic">{task?.answer}</p>
                                      </div>
                                    : <button onClick={() => setShowAnswerLocally(true)} className="w-full py-8 border-4 border-dashed border-emerald-100 text-emerald-600 rounded-[2.5rem] font-black uppercase text-sm hover:bg-emerald-50 transition-all flex items-center justify-center gap-4">Показать правильный ответ</button>
                                }
                            </div>
                        )}
                    </div>
                    <div className="flex justify-between items-center px-4 mt-10 w-full max-w-5xl">
                        <button disabled={currentTaskIndex === 0} onClick={() => { setCurrentTaskIndex(p => p - 1); setShowAnswerLocally(false); }} className="bg-slate-800 p-6 rounded-3xl text-white font-black uppercase text-xs flex items-center gap-3 hover:bg-slate-700 shadow-xl"><ArrowLeft className="w-5 h-5" /> Назад</button>
                        <button disabled={currentTaskIndex === activeTaskSection.tasks.length - 1} onClick={() => { setCurrentTaskIndex(p => p + 1); setShowAnswerLocally(false); }} className="bg-blue-600 p-6 rounded-3xl text-white font-black uppercase text-xs flex items-center gap-3 shadow-2xl active:scale-95 transition-all">Вперед <ArrowRight className="w-5 h-5" /></button>
                    </div>
                </div>
            </div>
        );

      case 'result': return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-[5rem] p-20 shadow-2xl relative text-center animate-in zoom-in duration-500 flex flex-col items-center">
            <div className="bg-emerald-100 w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-10 shadow-xl">
              <Trophy className="w-16 h-16 text-emerald-600" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4 uppercase tracking-tighter leading-none">Тест завершен</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-12">Ваш результат сохранен в базе данных</p>
            <div className="grid grid-cols-2 gap-8 mb-16 w-full">
              <div className="bg-emerald-50 p-10 rounded-[3rem] border border-emerald-100 shadow-sm">
                <p className="text-[10px] font-black text-emerald-400 uppercase mb-4 tracking-widest text-center">Баллы</p>
                <p className="text-6xl font-black text-emerald-600 text-center">{(results[0]?.score || 0)} / {(results[0]?.total || 0)}</p>
              </div>
              <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest text-center">Процент</p>
                <p className="text-6xl font-black text-slate-900 text-center">{(results[0]?.percentage || 0)}%</p>
              </div>
            </div>
            <button onClick={() => setView('menu')} className="w-full bg-slate-900 text-white font-black py-8 rounded-[2.5rem] shadow-2xl hover:bg-slate-800 transition-all uppercase active:scale-95 text-lg">Вернуться в меню</button>
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col bg-slate-950 items-center justify-center">
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