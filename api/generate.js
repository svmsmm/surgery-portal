export default async function handler(req, res) {
  // 1. Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Получаем текст. Поддерживаем разные варианты названия поля для надежности
    const { prompt, lectureText, text } = req.body || {};
    const input = prompt || lectureText || text;

    if (!input || typeof input !== 'string' || input.length < 20) {
      return res.status(400).json({
        ok: false,
        error: 'Текст лекции обязателен и должен быть длиннее 20 символов.'
      });
    }

    // Ищем ключ в переменных окружения (поддерживаем то, что вы уже настроили в Vercel)
    const hfToken = process.env.VITE_HF_KEY || process.env.HF_KEY || process.env.HF_API_TOKEN;

    if (!hfToken) {
      console.error('VITE_HF_KEY is not set');
      return res.status(500).json({
        ok: false,
        error: 'Server config error: API ключ не найден (VITE_HF_KEY).'
      });
    }

    const url = 'https://router.huggingface.co/v1/chat/completions';

    // Промпт адаптирован под структуру вашего React-приложения (text, options, correctIndex)
    const systemPrompt =
      'Ты преподаватель в медицинском университете (хирургия). ' +
      'По тексту лекции сгенерируй РОВНО 30 тестовых вопросов (multiple choice). ' +
      'Каждый вопрос должен иметь структуру JSON:\n' +
      '{ "text": "Текст вопроса", "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"], "correctIndex": 0 }\n\n' +
      'Где correctIndex - это число от 0 до 3, указывающее на правильный вариант в массиве options.\n' +
      'Требования:\n' +
      '- Вопросы должны соответствовать медицинскому содержанию лекции.\n' +
      '- В массиве ДОЛЖНО быть ровно 30 элементов.\n' +
      '- Верни ТОЛЬКО один валидный JSON-массив. Без markdown, без слов "json", без пояснений.\n';

    const userPrompt = `Текст лекции:\n\n${input.substring(0, 30000)}`; // Лимит символов для надежности

    const body = {
      model: 'Qwen/Qwen3-Coder-Next:novita', // Ваша выбранная модель
      stream: false,
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    console.log("Sending request to Hugging Face...");

    const hfRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const raw = await hfRes.text();

    // Обработка ошибок самого HF
    if (!hfRes.ok) {
      console.error('HF API error:', hfRes.status, raw);
      
      // Если модель грузится (503)
      if (raw.includes("loading")) {
         return res.status(503).json({ ok: false, error: "Модель загружается (Cold Boot). Подождите 30 секунд и нажмите снова." });
      }

      return res.status(hfRes.status).json({
        ok: false,
        error: `Hugging Face API Error: ${hfRes.status}`,
        details: raw
      });
    }

    // Парсинг JSON из ответа
    let hfJson;
    try {
      hfJson = JSON.parse(raw);
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'HF вернул невалидный JSON ответ',
        bodyPreview: raw.slice(0, 200)
      });
    }

    const content = hfJson.choices?.[0]?.message?.content?.trim() || '';

    if (!content) {
      return res.status(502).json({
        ok: false,
        error: 'Пустой ответ от модели',
        raw: hfJson
      });
    }

    // Попытка найти и распарсить массив вопросов внутри текста
    let questions;
    try {
      // Иногда модель добавляет текст вокруг JSON, вырезаем массив
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']') + 1;
      
      if (start === -1 || end === 0) {
        throw new Error("Массив [ ] не найден в ответе");
      }
      
      const jsonStr = content.substring(start, end);
      questions = JSON.parse(jsonStr);

    } catch (e) {
      console.error('JSON parse error:', e);
      return res.status(502).json({
        ok: false,
        error: 'Не удалось извлечь JSON из ответа модели',
        textPreview: content.slice(0, 500)
      });
    }

    if (!Array.isArray(questions)) {
      return res.status(502).json({
        ok: false,
        error: 'Ответ модели не является массивом вопросов',
        valuePreview: JSON.stringify(questions).slice(0, 200)
      });
    }

    // Успех
    return res.status(200).json({
      ok: true,
      count: questions.length,
      questions, 
      modelUsed: 'Qwen/Qwen3-Coder-Next:novita'
    });

  } catch (err) {
    console.error('Handler Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error'
    });
  }
}