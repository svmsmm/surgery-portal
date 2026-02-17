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
  
  // Ищем ключ
  const apiKey = process.env.VITE_HF_KEY || process.env.VITE_GEMINI_KEY || process.env.HF_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing.' });
  }

  // СПИСОК МОДЕЛЕЙ (Сначала мощная, потом быстрая)
  const models = [
    "Qwen/Qwen2.5-72B-Instruct",      
    "Qwen/Qwen2.5-7B-Instruct",       
    "mistralai/Mistral-7B-Instruct-v0.3", 
    "google/gemma-2-9b-it"            
  ];

  // Промпт
  const systemPrompt = `<|im_start|>system
You are a strict medical professor. Generate exactly 30 multiple-choice questions in Russian based on the text.
Output MUST be a raw JSON array. No markdown, no comments.
Format: [{"text": "Вопрос", "options": ["А", "Б", "В", "Г"], "correctIndex": 0}]
<|im_end|>
<|im_start|>user
${prompt}
<|im_end|>
<|im_start|>assistant
`;

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`Trying model: ${model}...`);
      
      // ИСПРАВЛЕНИЕ: Новый адрес (router.huggingface.co)
      const url = `https://router.huggingface.co/models/${model}`;

      const result = await fetch(url, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          inputs: systemPrompt,
          parameters: { 
              max_new_tokens: 4000,
              return_full_text: false,
              temperature: 0.1
          }
        })
      });

      // Обрабатываем ответ как текст, чтобы поймать ошибки
      const rawText = await result.text();

      if (!result.ok) {
        console.warn(`Model ${model} failed:`, rawText);
        // Если 503 (загрузка) или 404 (нет модели), пробуем следующую
        if (result.status === 503 || result.status === 404) {
           lastError = `Model ${model} unavailable (${result.status})`;
           continue; 
        }
        throw new Error(`HF Error: ${rawText}`);
      }

      // Пытаемся найти JSON в ответе
      let generatedText = "";
      try {
        const json = JSON.parse(rawText);
        if (Array.isArray(json)) generatedText = json[0].generated_text;
        else if (json.generated_text) generatedText = json.generated_text;
        else generatedText = rawText; // Иногда router возвращает просто текст
      } catch (e) {
        generatedText = rawText;
      }

      const start = generatedText.indexOf('[');
      const end = generatedText.lastIndexOf(']') + 1;
      
      if (start === -1 || end <= 0) {
         lastError = `Model ${model} returned invalid format`;
         continue; 
      }

      const cleanJson = generatedText.substring(start, end);
      const questions = JSON.parse(cleanJson);

      return res.status(200).json({ questions, modelUsed: model });

    } catch (e) {
      console.error(`Error with ${model}:`, e.message);
      lastError = e.message;
    }
  }

  return res.status(500).json({ 
    error: `All models failed. Last error: ${lastError}`
  });
}