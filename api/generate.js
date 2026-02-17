export default async function handler(req, res) {
  // 1. Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { prompt } = req.body;
  
  // ПРОБУЕМ НАЙТИ ЛЮБОЙ КЛЮЧ (HF или GEMINI)
  // Vercel иногда скрывает префикс VITE_ на сервере, поэтому проверяем разные варианты
  const apiKey = process.env.VITE_HF_KEY || process.env.VITE_GEMINI_KEY || process.env.HF_KEY;

  if (!apiKey) {
    console.error("API Key is missing on server");
    return res.status(500).json({ error: 'Server configuration error: API Key not found' });
  }

  try {
    // 2. ОТПРАВЛЯЕМ ЗАПРОС В HUGGING FACE (Qwen 2.5)
    // Это мощная модель, которая отлично понимает русский
    const url = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct";
    
    // Формируем промпт специально для Qwen
    const qwenPrompt = `<|im_start|>system
You are a strict medical professor. Generate exactly 30 multiple-choice questions in Russian based on the text.
Output MUST be a raw JSON array. No markdown, no comments.
Format: [{"text": "Вопрос", "options": ["А", "Б", "В", "Г"], "correctIndex": 0}]
<|im_end|>
<|im_start|>user
${prompt}
<|im_end|>
<|im_start|>assistant
`;

    const result = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        inputs: qwenPrompt,
        parameters: { 
            max_new_tokens: 4000,
            return_full_text: false,
            temperature: 0.1
        }
      })
    });

    const data = await result.json();

    if (!result.ok) {
      const errorMsg = JSON.stringify(data);
      console.error("HF Error:", errorMsg);
      // Если модель грузится, передаем это клиенту
      if (errorMsg.includes("loading")) {
          return res.status(503).json({ error: "Model is loading", details: "Модель запускается на сервере, подождите 30 секунд." });
      }
      throw new Error(data.error || "Hugging Face Error");
    }

    // 3. Обработка ответа Hugging Face
    let rawContent = "";
    if (Array.isArray(data)) rawContent = data[0].generated_text;
    else if (data.generated_text) rawContent = data.generated_text;
    else throw new Error("Unknown response format");

    // Вырезаем JSON
    const start = rawContent.indexOf('[');
    const end = rawContent.lastIndexOf(']') + 1;
    
    if (start === -1 || end <= 0) {
       console.error("Raw AI response:", rawContent);
       throw new Error("AI did not return a valid JSON array.");
    }

    const cleanJson = rawContent.substring(start, end);
    const questions = JSON.parse(cleanJson);

    return res.status(200).json({ questions });

  } catch (error) {
    console.error("Server Proxy Error:", error);
    return res.status(500).json({ error: error.message });
  }
}