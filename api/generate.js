export default async function handler(req, res) {
  // 1. Настройка CORS (чтобы браузер разрешил ответ)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Обработка предварительного запроса браузера
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Получаем текст от клиента
  const { prompt } = req.body;
  
  // Получаем ключ из настроек Vercel
  const apiKey = process.env.VITE_GEMINI_KEY; 

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing. Check Vercel Settings.' });
  }

  try {
    // 2. Отправляем запрос в Google (Server-to-Server)
    // Используем v1beta, так как она поддерживает flash модель
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Формируем простой запрос без лишних настроек
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await result.json();

    if (!result.ok) {
      throw new Error(data.error?.message || result.statusText);
    }

    // 3. Вырезаем JSON из ответа (ручной парсинг)
    let rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Ищем границы массива [...]
    const start = rawContent.indexOf('[');
    const end = rawContent.lastIndexOf(']') + 1;
    
    if (start === -1 || end <= 0) {
       // Если ИИ вернул просто текст, пробуем вернуть его как ошибку формата
       throw new Error("AI did not return a valid JSON array.");
    }

    const cleanJson = rawContent.substring(start, end);
    const questions = JSON.parse(cleanJson);

    // 4. Отправляем готовые вопросы обратно на сайт
    return res.status(200).json({ questions });

  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}