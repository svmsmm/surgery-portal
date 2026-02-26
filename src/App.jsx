import React, { useState, useEffect, useRef } from 'react';
import { 
  User, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Layout, 
  Loader2, FileText, Eye, ShieldCheck, GraduationCap, ClipboardList, 
  Stethoscope, Clock, AlertCircle, FileSearch, Timer, Plus, 
  RefreshCw, Trash2, BookOpen, Lock, Unlock, EyeOff, ArrowLeft, ArrowRight,
  Trophy, Settings, Key, Zap, Bug, Globe, Server, X, Activity, AlertOctagon, FileJson
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, 
  deleteDoc, updateDoc, query
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';

// КОНФИГУРАЦИЯ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCgoD4vZCEU2W_w3TzE3102JcnlXnocmMg",
  authDomain: "surgery-app-89c4c.firebaseapp.com",
  projectId: "surgery-app-89c4c",
  storageBucket: "surgery-app-89c4c.firebasestorage.app",
  messagingSenderId: "1026236136369",
  appId: "1:1026236136369:web:11807c6845c4719a939b90",
  measurementId: "G-1P2WMCMEMC"
};

let app, auth, db;
let firebaseError = null;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Init Failed:", e);
  firebaseError = e.message;
}

const PORTAL_ID = 'hospital-surgery-v2';
const ADMIN_PASSWORD_SECRET = "601401";

const App = () => {
  if (firebaseError) {
      return (
          <div className="min-h-screen bg-red-900 text-white flex flex-col items-center justify-center p-10 text-center">
              <AlertOctagon className="w-20 h-20 mb-4" />
              <h1 className="text-3xl font-black uppercase mb-4">Ошибка конфигурации</h1>
              <p className="mt-4 font-mono bg-black/50 p-4 rounded text-sm">{firebaseError}</p>
          </div>
      );
  }

  const [view, setView] = useState('welcome'); 
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [debugLog, setDebugLog] = useState(""); 

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
  
  // Состояние для импорта JSON
  const [importJsonText, setImportJsonText] = useState('');

  // === ДОБАВЛЕНО: Рефы и состояния для Анти-чит системы ===
  const finishQuizRef = useRef(null);
  const [cheatWarnings, setCheatWarnings] = useState(0);

  // 1. Авторизация
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
          signInAnonymously(auth).catch(e => {
              setAuthError(e.message);
          });
      } else {
          setUser(u);
          setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Данные
  useEffect(() => {
    if (!user || !db) return;
    const mRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials');
    const tRef = collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections');
    const unsubM = onSnapshot(mRef, (s) => setMaterials(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubT = onSnapshot(tRef, (s) => setTaskSections(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubM(); unsubT(); };
  }, [user]);

  // 3. Результаты
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
      const totalSeconds = activeMaterial.timerMinutes ? activeMaterial.timerMinutes * 60 : activeMaterial.questions.length * 120;
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

  // === ДОБАВЛЕНО: Анти-чит логика (Отслеживание переключения вкладок) ===
  useEffect(() => {
    // Сбрасываем предупреждения, если студент не в режиме теста
    if (view !== 'quiz') {
      setCheatWarnings(0);
      return;
    }

    const handleVisibilityChange = () => {
      // Если вкладка скрыта (пользователь свернул браузер или переключился)
      if (document.hidden && view === 'quiz') {
        setCheatWarnings(prev => {
          const newWarnings = prev + 1;
          if (newWarnings >= 3) {
            alert("🚨 ТЕСТ АННУЛИРОВАН!\n\nВы многократно переключались на другие вкладки или приложения. Ваш текущий результат отправлен автоматически.");
            // Принудительно вызываем функцию завершения теста
            if (finishQuizRef.current) finishQuizRef.current();
          } else {
            alert(`⚠️ ПРЕДУПРЕЖДЕНИЕ (${newWarnings} из 3)\n\nВы покинули страницу теста. Не переключайтесь на другие приложения! После 3-й попытки тест будет завершен.`);
          }
          return newWarnings;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [view]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
  };

  const handleImportJson = async () => {
    if (!importJsonText.trim() || !inputTitle.trim()) {
        return showToast("Заполните название и вставьте JSON!");
    }
    setIsLoading(true);
    setDebugLog("");

    try {
        let data;
        try {
            data = JSON.parse(importJsonText);
        } catch (e) {
            throw new Error("Неверный формат JSON. Проверьте скобки.");
        }

        let questionsRaw = [];
        if (Array.isArray(data)) {
            questionsRaw = data;
        } else if (data.questions && Array.isArray(data.questions)) {
            questionsRaw = data.questions;
        } else {
            throw new Error("Не удалось найти массив вопросов в JSON.");
        }

        const normalizedQuestions = questionsRaw.map(q => {
            if (q.answerOptions && Array.isArray(q.answerOptions)) {
                const options = q.answerOptions.map(opt => opt.text);
                const correctIndex = q.answerOptions.findIndex(opt => opt.isCorrect === true);
                return {
                    question: q.question || "Вопрос без текста",
                    options: options,
                    correctIndex: correctIndex === -1 ? 0 : correctIndex
                };
            }
            return {
                question: q.question || q.text || "Вопрос без текста",
                options: q.options || [],
                correctIndex: Number(q.correctIndex) || 0
            };
        });

        if (normalizedQuestions.length === 0) throw new Error("Список вопросов пуст.");

        await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', crypto.randomUUID()), { 
            title: inputTitle, 
            content: "Импортировано вручную (JSON)", 
            questions: normalizedQuestions, 
            updatedAt: Date.now(), 
            isVisible: true 
        });

        showToast(`Импортировано ${normalizedQuestions.length} вопросов!`);
        setView('admin-materials');
        setInputTitle(''); 
        setImportJsonText('');

    } catch (e) {
        console.error(e);
        setDebugLog("Ошибка импорта: " + e.message);
        showToast("Ошибка импорта");
    } finally {
        setIsLoading(false);
    }
  };

  const handleGenerateTest = async (existing = null) => {
    setDebugLog(""); 
    const text = existing ? existing.content : inputText;
    const title = existing ? existing.title : inputTitle;
    
    if (!text.trim() || !title.trim()) return showToast("Заполните поля!");

    setIsLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            lectureText: text.substring(0, 95000)
        })
      });

      const textResponse = await res.text();
      let data;
      
      try {
          data = JSON.parse(textResponse);
      } catch (e) {
          console.error("Non-JSON:", textResponse);
          setDebugLog(`CRITICAL: Server returned HTML. Preview: ${textResponse.substring(0, 100)}`);
          throw new Error("Server endpoint problem");
      }
      
      if (!res.ok) {
        setDebugLog(`SERVER ERROR: ${data.error}`);
        throw new Error(data.error);
      }

      if (!data.questions || !Array.isArray(data.questions)) {
          throw new Error("Сервер не вернул вопросы.");
      }
      
      await setDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', existing?.id || crypto.randomUUID()), { 
        title, content: text, questions: data.questions, updatedAt: Date.now(), isVisible: existing?.isVisible ?? false 
      });
      
      showToast(`Тест создан!`);
      setView('admin-materials');
      setInputText(''); setInputTitle('');
    } catch (e) { 
      console.error(e);
      if (!debugLog) setDebugLog(e.message); 
      showToast("Ошибка. См. лог.");
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
    clearInterval(timerRef.current);
    if (!activeMaterial) return;
    
    const score = studentAnswers.reduce((acc, ans, idx) => {
        if (ans === undefined) return acc;
        return acc + (Number(ans) === Number(activeMaterial.questions[idx].correctIndex) ? 1 : 0);
    }, 0);

    const total = activeMaterial.questions.length;
    await addDoc(collection(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results'), { 
      studentName, materialTitle: activeMaterial.title, score, total, percentage: Math.round((score/total)*100), spentTime: formatTime((total*120)-timeLeft), timestamp: Date.now(), dateString: new Date().toLocaleString('ru-RU') 
    });
    setView('result');
  };

  // === ДОБАВЛЕНО: Обновление ссылки на актуальный метод finishQuiz для анти-чита ===
  useEffect(() => {
    finishQuizRef.current = finishQuiz;
  });

  const quitQuiz = () => {
      if (window.confirm("Выйти из теста? Результат будет сохранен как есть (неотвеченные = 0).")) {
          finishQuiz();
      }
  }

  // --- РЕНДЕР ---
  const renderCurrentView = () => {
    if (authError) return <div className="min-h-screen bg-red-900 text-white p-10 text-center">Ошибка входа: {authError}</div>;
    if (!user) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center animate-pulse">Загрузка...</div>;

    switch (view) {
      case 'welcome': return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
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
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 gap-12 text-center">
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
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl flex flex-col items-center text-center">
            <ShieldCheck className="w-16 h-16 text-slate-900 mx-auto mb-10 text-center" />
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-900 font-black text-center text-slate-900 tracking-[1em] text-3xl mb-10 shadow-inner text-center" />
            <button onClick={() => adminPassword === ADMIN_PASSWORD_SECRET ? (setIsAdminAuthenticated(true), setView('admin')) : showToast("Код неверен")} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase shadow-xl">Войти</button>
          </div>
        </div>
      );

      case 'admin': return (
        <div className="min-h-screen w-full bg-slate-50 p-6 md:p-12 flex flex-col items-center">
            <div className="max-w-6xl w-full">
                <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-16 text-center">
                   <div className="text-left"><h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Управление</h1></div>
                   <div className="flex flex-wrap gap-4 justify-center">
                        <button onClick={() => setView('import-json')} className="bg-slate-900 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-lg hover:bg-slate-800 flex items-center gap-2"><FileJson className="w-5 h-5" /> Импорт JSON</button>
                        <button onClick={() => setView('admin-tasks-list')} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-lg hover:bg-blue-700 flex items-center gap-2"><Stethoscope className="w-5 h-5" /> Задачи</button>
                        <button onClick={() => setView('admin-materials')} className="bg-white text-slate-900 border-2 border-slate-200 px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-sm hover:bg-slate-50 flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Тесты</button>
                        <button onClick={() => setView('setup-test')} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] text-[10px] font-black uppercase shadow-xl hover:bg-emerald-700 flex items-center gap-2"><Plus className="w-5 h-5" /> AI Генератор</button>
                        <button onClick={() => {setIsAdminAuthenticated(false); setView('welcome');}} className="bg-white text-slate-400 px-6 py-5 rounded-xl text-[10px] font-black border-2 border-slate-100">Выход</button>
                    </div>
                </div>

                {/* ЖУРНАЛ РЕЗУЛЬТАТОВ */}
                <div className="bg-white rounded-[4rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col text-left">
                  <div className="p-10 bg-slate-50/50 border-b border-slate-100 text-center font-black text-slate-900 uppercase text-xs tracking-[0.3em]">Журнал результатов</div>
                  <div className="overflow-x-auto p-10">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black text-left">
                        <tr>
                            <th className="px-10 py-8">Курсант</th>
                            <th className="px-10 py-8">Тема</th>
                            <th className="px-10 py-8 text-center">Результат %</th>
                            <th className="px-10 py-8 text-right">Управление</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm font-bold text-left">
                        {results.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-all group">
                            <td className="px-10 py-8 text-left">
                                <div className="flex items-center gap-5 text-left">
                                    <div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl border-2 ${r.percentage >= 70 ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-red-100 bg-red-50 text-red-600'}`}>{r.studentName?.charAt(0)}</div>
                                    <div className="text-left"><p className="font-black text-slate-900 text-lg uppercase text-left">{r.studentName}</p><p className="text-[10px] font-bold text-slate-400 uppercase text-left">{r.dateString}</p></div>
                                </div>
                            </td>
                            <td className="px-10 py-8 text-slate-600 uppercase truncate max-w-[200px] text-left">{r.materialTitle}</td>
                            <td className="px-10 py-8 text-center font-black text-3xl text-slate-900">{r.percentage}%</td>
                            <td className="px-10 py-8 text-right">
                                <button 
                                    onClick={() => { if(confirm("Удалить этот результат?")) deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'results', r.id)); }} 
                                    className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
            </div>
        </div>
      );
      
      case 'import-json': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center flex flex-col items-center">
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="bg-slate-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center text-center"><FileJson className="w-12 h-12 text-slate-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Импорт Теста</h2>
                <p className="text-slate-400 text-sm mb-8">Вставьте JSON-код из чата</p>
                <div className="space-y-6 text-left w-full mt-2">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Название теста" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-slate-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl" />
                    <textarea value={importJsonText} onChange={e => setImportJsonText(e.target.value)} placeholder='{ "questions": [ ... ] }' className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-slate-600 outline-none resize-none font-mono text-xs text-slate-700 shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading} onClick={handleImportJson} className="w-full mt-10 bg-slate-900 hover:bg-slate-700 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] text-xl flex items-center justify-center gap-6 text-center">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center"/> : <RefreshCw className="w-8 h-8 text-center"/>} 
                  {isLoading ? "ЗАГРУЗКА..." : "СОХРАНИТЬ"}
                </button>
            </div>
        </div>
      );
      
      case 'setup-test': return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
             <div className="max-w-4xl w-full bg-white rounded-[4rem] p-12 sm:p-20 shadow-2xl relative text-center flex flex-col items-center">
                <button onClick={() => setView('admin')} className="absolute top-12 left-12 text-slate-400 font-black uppercase text-[10px] flex items-center gap-3 hover:text-slate-900 transition-all self-start text-left"><ArrowLeft className="w-5 h-5" /> Назад</button>
                <div className="bg-emerald-100 w-24 h-24 rounded-3xl mb-10 flex items-center justify-center text-center"><Globe className="w-12 h-12 text-emerald-600"/></div>
                <h2 className="text-4xl font-black text-slate-900 uppercase mb-2 tracking-tight text-center">Создание ИИ Теста</h2>
                <div className="space-y-6 text-left w-full mt-10">
                    <input type="text" value={inputTitle} onChange={e => setInputTitle(e.target.value)} placeholder="Тема теста" className="w-full p-8 bg-slate-50 border-2 border-transparent rounded-3xl focus:bg-white focus:border-emerald-600 font-bold text-slate-900 text-center uppercase shadow-inner text-xl" />
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Вставьте учебный материал..." className="w-full h-[400px] p-10 bg-slate-50 border-2 border-transparent rounded-[3rem] focus:bg-white focus:border-emerald-600 outline-none resize-none font-bold text-slate-700 text-lg shadow-inner scrollbar-hide text-left" />
                </div>
                <button disabled={isLoading || !inputText || !inputTitle} onClick={() => handleGenerateTest()} className="w-full mt-10 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-8 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all uppercase tracking-[0.2em] shadow-emerald-500/20 text-xl flex items-center justify-center gap-6 text-center">
                  {isLoading ? <Loader2 className="animate-spin w-8 h-8 text-center"/> : <RefreshCw className="w-8 h-8 text-center"/>} 
                  {isLoading ? "ГЕНЕРАЦИЯ (Server)..." : "СФОРМИРОВАТЬ ТЕСТ"}
                </button>
            </div>
        </div>
      );
      
      case 'admin-materials': return <div className="p-10 bg-slate-50 min-h-screen text-center flex flex-col items-center"><div className="max-w-6xl w-full"><button onClick={() => setView('admin')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2 self-start"><ArrowLeft className="w-4 h-4" /> Назад</button><div className="grid gap-4 w-full">{materials.map(m => <div key={m.id} className="bg-white p-6 rounded-2xl shadow flex justify-between items-center text-left"><h4 className="font-black text-slate-900 uppercase text-left flex-1">{m.title} {m.timerMinutes ? <span className="text-xs ml-3 text-slate-400 font-bold bg-slate-100 px-3 py-1 rounded-xl">⏱ {m.timerMinutes} мин</span> : null}</h4><div className="flex gap-4"><button onClick={() => { setActiveMaterial(m); setView('admin-preview-test'); }} className="p-4 bg-slate-100 rounded-xl hover:bg-emerald-100 text-emerald-600 transition-all"><Eye className="w-5 h-5"/></button><button onClick={() => { const t = prompt("Время на тест в минутах (0 - авто):", m.timerMinutes || Math.round((m.questions?.length * 120)/60) || 0); if (t !== null && !isNaN(t) && t !== "") { updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), { timerMinutes: Number(t) }); showToast("Таймер обновлен!"); } }} className="p-4 bg-slate-100 rounded-xl hover:bg-orange-100 text-orange-500 transition-all" title="Настроить таймер"><Timer className="w-5 h-5"/></button><button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), {isShowAnswersEnabled: !m.isShowAnswersEnabled})} className={`p-4 rounded-xl ${m.isShowAnswersEnabled ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`} title="Показывать ответы">{m.isShowAnswersEnabled ? <BookOpen className="w-5 h-5"/> : <BookOpen className="w-5 h-5 opacity-50"/>}</button><button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id), {isVisible: !m.isVisible})} className={`p-4 rounded-xl ${m.isVisible ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{m.isVisible ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}</button><button onClick={() => deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'materials', m.id))} className="p-4 bg-red-50 text-red-500 rounded-xl"><Trash2 className="w-5 h-5"/></button></div></div>)}</div></div></div>;
      
      case 'admin-preview-test': return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 flex flex-col items-center">
            <div className="max-w-4xl w-full text-left">
                 <button onClick={() => setView('admin-materials')} className="mb-8 text-slate-400 font-black uppercase text-xs flex items-center gap-2 hover:text-slate-900 transition-all"><ArrowLeft className="w-4 h-4" /> Назад к списку</button>
                 <h2 className="text-3xl font-black text-slate-900 mb-8 uppercase tracking-tighter">{activeMaterial?.title}</h2>
                 <div className="space-y-6">
                    {activeMaterial?.questions?.map((q, i) => (
                        <div key={i} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                            <h4 className="font-bold text-lg text-slate-900 mb-4">{i+1}. {q.question || q.text}</h4>
                            <div className="space-y-2">
                                {q.options.map((opt, optI) => (
                                    <div key={optI} className={`p-3 rounded-xl border-2 text-sm font-medium ${Number(optI) === Number(q.correctIndex) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-100 text-slate-500'}`}>
                                        {opt} {Number(optI) === Number(q.correctIndex) && "✅"}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
      );

      case 'admin-preview-tasks': return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12 flex flex-col items-center">
            <div className="max-w-4xl w-full text-left">
                 <button onClick={() => setView('admin-tasks-list')} className="mb-8 text-slate-400 font-black uppercase text-xs flex items-center gap-2 hover:text-slate-900 transition-all"><ArrowLeft className="w-4 h-4" /> Назад к списку</button>
                 <h2 className="text-3xl font-black text-slate-900 mb-8 uppercase tracking-tighter">{activeTaskSection?.title}</h2>
                 <div className="space-y-6">
                    {activeTaskSection?.tasks?.map((t, i) => (
                        <div key={i} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                            <h4 className="font-bold text-lg text-slate-900 mb-4">Задача {i+1}</h4>
                            <p className="text-slate-700 mb-6">{t.text}</p>
                            <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100">
                                <span className="text-xs font-black uppercase text-emerald-600 block mb-2">Ответ:</span>
                                <p className="text-emerald-900 font-medium">{t.answer}</p>
                            </div>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
      );

      case 'admin-tasks-list': return <div className="p-10 bg-slate-50 min-h-screen text-center flex flex-col items-center"><div className="max-w-6xl w-full"><button onClick={() => setView('admin')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2 self-start"><ArrowLeft className="w-4 h-4" /> Назад</button><button onClick={() => setView('setup-tasks')} className="mb-6 w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-xs">Добавить задачи</button><div className="grid gap-4 w-full">{taskSections.map(s => <div key={s.id} className="bg-white p-6 rounded-2xl shadow flex justify-between items-center text-left"><h4 className="font-black text-slate-900 uppercase text-left">{s.title}</h4><div className="flex gap-4"><button onClick={() => { setActiveTaskSection(s); setView('admin-preview-tasks'); }} className="p-4 bg-slate-100 rounded-xl hover:bg-emerald-100 text-emerald-600 transition-all" title="Просмотр задач"><Eye className="w-5 h-5"/></button><button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), {isAnswersEnabled: !s.isAnswersEnabled})} className={`p-4 rounded-xl ${s.isAnswersEnabled ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`} title="Разрешить просмотр ответов">{s.isAnswersEnabled ? <BookOpen className="w-5 h-5"/> : <BookOpen className="w-5 h-5 opacity-50"/>}</button><button onClick={() => updateDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id), {isVisible: !s.isVisible})} className={`p-4 rounded-xl ${s.isVisible ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{s.isVisible ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}</button><button onClick={() => deleteDoc(doc(db, 'artifacts', PORTAL_ID, 'public', 'data', 'task_sections', s.id))} className="p-4 bg-red-50 text-red-500 rounded-xl"><Trash2 className="w-5 h-5"/></button></div></div>)}</div></div></div>;
      
      case 'setup-tasks': return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4"><div className="max-w-4xl w-full bg-white p-10 rounded-[3rem] text-center flex flex-col items-center"><button onClick={() => setView('admin-tasks-list')} className="mb-8 text-slate-400 font-black uppercase text-xs flex items-center gap-2 self-start"><ArrowLeft className="w-4 h-4" /> Назад</button><h2 className="text-3xl font-black uppercase mb-6">Новые задачи</h2><input value={inputTitle} onChange={e => setInputTitle(e.target.value)} className="w-full p-6 bg-slate-50 rounded-2xl mb-4 font-bold text-center" placeholder="Название темы" /><textarea value={inputText} onChange={e => setInputText(e.target.value)} className="w-full h-64 p-6 bg-slate-50 rounded-2xl mb-6 font-bold text-left" placeholder="Задача [ТЕКСТ] Ответ [ЭТАЛОН]..." /><button onClick={handleSaveTasks} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase">Загрузить</button></div></div>;
      
      case 'student-select-test': return <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center"><div className="max-w-5xl w-full text-left"><button onClick={() => setView('menu')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Назад</button><h2 className="text-white text-3xl font-black uppercase mb-8">Тесты</h2><div className="grid gap-4">{materials.filter(m => m.isVisible).map(m => <button key={m.id} onClick={() => { setActiveMaterial(m); setStudentAnswers([]); setCurrentQuestionIndex(0); setView('quiz'); }} className="bg-white/10 p-8 rounded-3xl border-2 border-slate-800 text-white font-black text-left flex justify-between items-center uppercase">{m.title}<ChevronRight className="text-slate-600"/></button>)}</div></div></div>;
      
      case 'student-select-tasks': return <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center"><div className="max-w-5xl w-full text-left"><button onClick={() => setView('menu')} className="mb-10 text-slate-400 font-black uppercase text-xs flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Назад</button><h2 className="text-white text-3xl font-black uppercase mb-8">Задачи</h2><div className="grid gap-4">{taskSections.filter(t => t.isVisible).map(t => <button key={t.id} onClick={() => { setActiveTaskSection(t); setCurrentTaskIndex(0); setShowAnswerLocally(false); setView('task-viewer'); }} className="bg-white/10 p-8 rounded-3xl border-2 border-slate-800 text-white font-black text-left flex justify-between items-center uppercase">{t.title}<ChevronRight className="text-slate-600"/></button>)}</div></div></div>;
      
      // === ДОБАВЛЕНО: Запрет выделения и контекстного меню на экране теста ===
      case 'quiz': 
        if (!activeMaterial) return null;
        const q_quiz = activeMaterial.questions[currentQuestionIndex];
        const qText = q_quiz.question || q_quiz.text; 
        const isAns_quiz = studentAnswers[currentQuestionIndex] !== undefined;
        
        return <div 
            className="min-h-screen bg-slate-950 flex flex-col items-center text-center select-none"
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
            <div className="w-full p-5 bg-slate-900 border-b border-slate-800 flex justify-between px-6 items-center text-white font-black tabular-nums">
                <button onClick={quitQuiz} className="p-2 bg-red-900/30 text-red-500 rounded-lg hover:bg-red-900/50 transition-all" title="Выйти из теста"><X className="w-4 h-4"/></button>
                <div className="flex gap-4">
                    <span>{formatTime(timeLeft)}</span>
                    <span className="text-slate-500">|</span>
                    <span>{currentQuestionIndex + 1} / {activeMaterial.questions.length}</span>
                </div>
                <div className="w-8"></div>
            </div>
            
            <div className="w-full max-w-3xl p-6 flex-1 flex flex-col justify-center text-left">
                <div className="bg-white p-12 rounded-[3rem] shadow-2xl mb-8">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-8 leading-relaxed pointer-events-none">{qText}</h2>
                    <div className="grid gap-3">
                        {q_quiz.options.map((opt, idx) => { 
                            const isSel = studentAnswers[currentQuestionIndex] === idx; 
                            const isCorr = Number(idx) === Number(q_quiz.correctIndex); 
                            
                            let cls = 'bg-slate-50 border-2 border-slate-100 text-slate-600 hover:border-blue-300'; 
                            if (isAns_quiz) { 
                                if (isSel) {
                                    cls = isCorr ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-black' : 'bg-red-50 border-red-500 text-red-700 font-black'; 
                                } else if (activeMaterial.isShowAnswersEnabled && isCorr) {
                                    cls = 'bg-emerald-50/50 border-emerald-200 text-emerald-700'; 
                                } else {
                                    cls = 'opacity-30 grayscale';
                                }
                            } 
                            return <button key={idx} disabled={isAns_quiz} onClick={() => { const a = [...studentAnswers]; a[currentQuestionIndex] = idx; setStudentAnswers(a); }} className={`w-full text-left p-6 rounded-2xl font-bold transition-all ${cls}`}>{opt}</button>
                        })}
                    </div>
                </div>
                
                <div className="flex justify-between px-4">
                    <button disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex(p => p - 1)} className="text-slate-400 font-black uppercase text-xs flex items-center gap-2 hover:text-white transition-all"><ArrowLeft className="w-4 h-4"/> Назад</button>
                    {currentQuestionIndex === (activeMaterial.questions.length - 1) 
                        ? <button onClick={finishQuiz} disabled={!isAns_quiz} className="bg-emerald-600 text-white px-12 py-5 rounded-2xl font-black uppercase shadow-xl hover:bg-emerald-500 transition-all">Завершить</button> 
                        : <button onClick={() => setCurrentQuestionIndex(p => p + 1)} disabled={!isAns_quiz} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black uppercase shadow-xl hover:bg-blue-500 transition-all flex items-center gap-2">Далее <ArrowRight className="w-4 h-4"/></button>
                    }
                </div>
            </div>
        </div>;

      // === ДОБАВЛЕНО: Запрет выделения и контекстного меню на экране задач ===
      case 'task-viewer':
        if (!activeTaskSection) return null;
        const t_case = activeTaskSection.tasks[currentTaskIndex];
        return <div 
            className="min-h-screen bg-slate-950 flex flex-col items-center select-none"
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
        ><div className="w-full p-5 bg-slate-900 border-b border-slate-800 flex justify-between px-10 text-white font-black uppercase text-xs tracking-widest text-center"><button onClick={() => setView('student-select-tasks')} className="bg-slate-800 p-2 rounded-lg"><ArrowLeft className="w-4 h-4"/></button><span className="truncate max-w-[200px]">{activeTaskSection.title}</span><span>{currentTaskIndex + 1} / {activeTaskSection.tasks.length}</span></div><div className="max-w-4xl w-full p-6 flex-1 flex flex-col justify-center text-left text-left text-left"><div className="bg-white p-12 rounded-[4rem] shadow-2xl"><p className="text-xl font-bold text-slate-800 leading-relaxed mb-8 pointer-events-none">{t_case?.text}</p>{activeTaskSection.isAnswersEnabled && (showAnswerLocally ? <div className="bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[2.5rem] animate-in slide-in-from-top-4 shadow-inner text-left"><p className="text-emerald-900 font-bold text-xl italic">{t_case?.answer}</p></div> : <button onClick={() => setShowAnswerLocally(true)} className="w-full py-8 border-4 border-dashed border-emerald-100 text-emerald-600 rounded-[2.5rem] font-black uppercase text-xs">Показать эталон</button>)}</div><div className="flex justify-between mt-8"><button disabled={currentTaskIndex === 0} onClick={() => { setCurrentTaskIndex(p => p - 1); setShowAnswerLocally(false); }} className="bg-slate-800 p-6 rounded-3xl text-white font-black"><ArrowLeft className="w-4 h-4" /></button><button disabled={currentTaskIndex === activeTaskSection.tasks.length - 1} onClick={() => { setCurrentTaskIndex(p => p + 1); setShowAnswerLocally(false); }} className="bg-blue-600 p-6 rounded-3xl text-white font-black"><ArrowRight className="w-4 h-4" /></button></div></div></div>;
      
      case 'result': return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center"><div className="max-w-2xl w-full bg-white rounded-[5rem] p-20 shadow-2xl relative text-center flex flex-col items-center"><Trophy className="w-20 h-20 text-emerald-600 mb-10" /><h1 className="text-4xl font-black uppercase mb-10">Готово!</h1><div className="grid grid-cols-2 gap-8 mb-12 w-full text-center"><div className="bg-emerald-50 p-10 rounded-[3rem] border border-emerald-100"><p className="text-[10px] font-black text-emerald-400 uppercase mb-4">Баллы</p><p className="text-5xl font-black text-emerald-600">{(results[0]?.score || 0)}</p></div><div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100"><p className="text-[10px] font-black text-slate-400 uppercase mb-4">Успех</p><p className="text-5xl font-black text-slate-900">{(results[0]?.percentage || 0)}%</p></div></div><button onClick={() => setView('menu')} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black uppercase text-lg">На главную</button></div></div>;
      default: return null;
    }
  };

  return (
    <div className="font-sans antialiased text-left w-full min-h-screen flex flex-col selection:bg-emerald-100 selection:text-emerald-900 bg-slate-950 items-center justify-center text-left">
      {renderCurrentView()}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-12 py-6 rounded-[2.5rem] font-black shadow-2xl z-[100] border-2 border-slate-700 uppercase text-xs animate-in fade-in slide-in-from-bottom-4 text-center text-center text-center">
          {toastMessage}
        </div>
      )}
      {debugLog && (
          <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-red-900 text-white px-10 py-5 rounded-2xl shadow-2xl z-[110] border-2 border-red-500 font-mono text-xs max-w-lg">
              <div className="font-bold mb-2">ОТЛАДКА:</div>
              {debugLog}
          </div>
      )}
    </div>
  );
};

export default App;