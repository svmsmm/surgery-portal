export default async function handler(req, res) {
  // Настройка CORS (разрешаем браузеру получать ответ)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Если это предварительный запрос проверки (OPTIONS), отвечаем OK
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { prompt } = req.body;
  
  // Получаем ключ из настроек Vercel (серверных переменных)
  const apiKey = process.env.VITE_GEMINI_KEY; 

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing.' });
  }

  try {
    // Сервер Vercel отправляет запрос в Google (из США).
    // Используем v1beta, так как модель 1.5-flash там доступна.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
        // Мы НЕ отправляем generationConfig, чтобы избежать ошибки Invalid Payload
      })
    });

    const data = await result.json();

    if (!result.ok) {
      throw new Error(data.error?.message || result.statusText);
    }

    // Чистим ответ прямо на сервере
    let rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Ищем JSON
    const start = rawContent.indexOf('[');
    const end = rawContent.lastIndexOf(']') + 1;
    
    if (start === -1 || end <= 0) {
       throw new Error("AI returned text instead of JSON array.");
    }

    const cleanJson = rawContent.substring(start, end);
    const questions = JSON.parse(cleanJson);

    // Возвращаем готовые вопросы клиенту
    return res.status(200).json({ questions });

  } catch (error) {
    console.error("Server Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}