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
  
  // Ищем ключ (поддерживаем разные варианты имен)
  const apiKey = process.env.VITE_HF_KEY || process.env.VITE_GEMINI_KEY || process.env.HF_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing. Add VITE_HF_KEY to Vercel.' });
  }

  // СПИСОК МОДЕЛЕЙ
  // Мы используем новый адрес router.huggingface.co
  const models = [
    "Qwen/Qwen2.5-72B-Instruct",      // Топ качество
    "Qwen/Qwen2.5-7B-Instruct",       // Резерв (быстрая)
    "mistralai/Mistral-7B-Instruct-v0.3", // Классика
    "google/gemma-2-9b-it"            // Альтернатива
  ];

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

  // ЦИКЛ ПЕРЕБОРА МОДЕЛЕЙ
  for (const model of models) {
    try {
      console.log(`Trying model: ${model}...`);
      
      // --- ИСПРАВЛЕНИЕ: НОВЫЙ URL ---
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

      const data = await result.json();

      if (!result.ok) {
        const errorMsg = JSON.stringify(data);
        console.warn(`Model ${model} failed:`, errorMsg);
        
        if (result.status === 503 || result.status === 404) {
           lastError = `Model ${model} unavailable (${result.status})`;
           continue; 
        }
        throw new Error(data.error || "Hugging Face Error");
      }

      // Парсинг ответа
      let rawContent = "";
      if (Array.isArray(data)) rawContent = data[0].generated_text;
      else if (data.generated_text) rawContent = data.generated_text;
      else throw new Error("Unknown response format from HF");

      const start = rawContent.indexOf('[');
      const end = rawContent.lastIndexOf(']') + 1;
      
      if (start === -1 || end <= 0) {
         lastError = `Model ${model} did not return JSON`;
         continue; 
      }

      const cleanJson = rawContent.substring(start, end);
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