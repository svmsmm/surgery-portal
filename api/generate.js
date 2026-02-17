export default async function handler(req, res) {
  // 1. Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  
  // Ключ берем из переменных окружения Vercel
  // Поддерживаем разные имена переменных для удобства
  const apiKey = process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing. Please add GOOGLE_API_KEY to Vercel.' });
  }

  try {
    // 2. Используем Gemini 1.5 Flash через v1beta (поддерживает JSON mode)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [{
        parts: [{
          text: `
            Ты профессиональный преподаватель в медицинском вузе.
            Твоя задача: на основе предоставленного текста лекции составить 30 тестовых вопросов на русском языке.
            
            ФОРМАТ ОТВЕТА (СТРОГО):
            Ты должен вернуть ТОЛЬКО валидный JSON массив объектов. Без markdown, без слова 'json', без кавычек вокруг.
            Структура каждого объекта:
            {
              "text": "Текст вопроса?",
              "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
              "correctIndex": 0 (число от 0 до 3)
            }

            ТЕКСТ ЛЕКЦИИ:
            ${prompt}
          `
        }]
      }],
      // Ключевая настройка: заставляет модель вернуть JSON
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || response.statusText;
      console.error("Gemini Error:", errorMsg);
      throw new Error(errorMsg);
    }

    // 3. Получаем и проверяем ответ
    // Благодаря responseMimeType, text уже будет валидным JSON
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error("Empty response from AI");
    }

    let questions;
    try {
      questions = JSON.parse(generatedText);
    } catch (e) {
      console.error("JSON Parse Error:", generatedText);
      throw new Error("AI returned invalid JSON structure");
    }

    // Проверка структуры
    if (!Array.isArray(questions)) {
       // Если вернулся объект { questions: [...] }, достаем массив
       if (questions.questions && Array.isArray(questions.questions)) {
           questions = questions.questions;
       } else {
           throw new Error("Response is not an array");
       }
    }

    return res.status(200).json({ questions });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}