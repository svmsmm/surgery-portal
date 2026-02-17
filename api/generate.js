export default async function handler(req, res) {
  // 1. Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  
  // Ключ берем из переменных окружения Vercel
  const apiKey = process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing. Add GOOGLE_API_KEY to Vercel.' });
  }

  try {
    // ВАЖНО: Используем ту самую модель, которая ответила "Pong!"
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Строгая схема ответа
    const requestBody = {
      contents: [{
        parts: [{
          text: `
            Ты профессиональный преподаватель медицины.
            Твоя задача: на основе текста лекции составить 30 тестовых вопросов на русском языке.
            
            ТЕКСТ ЛЕКЦИИ:
            ${prompt}
            
            ФОРМАТ ОТВЕТА (JSON):
            Верни ТОЛЬКО массив JSON. 
            Пример структуры:
            [
              {
                "text": "Вопрос?",
                "options": ["A", "B", "C", "D"],
                "correctIndex": 0
              }
            ]
          `
        }]
      }],
      generationConfig: {
        // Эта настройка гарантирует, что придет JSON, а не текст
        responseMimeType: "application/json"
      }
    };

    console.log("Sending request to Gemini 2.5...");
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || response.statusText;
      console.error("Gemini Error:", errorMsg);
      throw new Error(`Google API Error: ${errorMsg}`);
    }

    // Получаем текст ответа
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error("Empty response from AI");
    }

    // Парсим JSON
    let questions;
    try {
      questions = JSON.parse(generatedText);
    } catch (e) {
      console.error("JSON Parse Error:", generatedText);
      throw new Error("AI returned invalid JSON structure");
    }

    // Если вернулся объект, а не массив (иногда бывает), ищем массив внутри
    if (!Array.isArray(questions)) {
       // Если это объект вида { questions: [...] } или { data: [...] }
       const values = Object.values(questions);
       const foundArray = values.find(val => Array.isArray(val));
       if (foundArray) {
           questions = foundArray;
       } else {
           // Если совсем не то, пробуем вернуть как есть, но это риск
           throw new Error("Response is not an array");
       }
    }

    return res.status(200).json({ questions });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}