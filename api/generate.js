export default async function handler(req, res) {
  // 1. Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { prompt } = req.body;
  const apiKey = process.env.VITE_HF_KEY || process.env.HF_KEY || process.env.VITE_GEMINI_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing.' });
  }

  // СПИСОК МОДЕЛЕЙ (Используем router.huggingface.co)
  // Mistral v0.3 сейчас одна из самых стабильных на router
  const models = [
    "mistralai/Mistral-7B-Instruct-v0.3", 
    "Qwen/Qwen2.5-72B-Instruct", 
    "Qwen/Qwen2.5-7B-Instruct"
  ];

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`Trying model: ${model} via Router...`);
      
      // ВАЖНО: Используем новый домен router.huggingface.co с поддержкой /v1/chat/completions
      const url = `https://router.huggingface.co/models/${model}/v1/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { 
                role: "system", 
                content: "You are a medical professor. Generate 30 multiple-choice questions in Russian based on the text. Output ONLY a valid JSON Array. No markdown." 
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 4000,
          temperature: 0.2
        })
      });

      // Считываем как текст, чтобы не упасть при ошибке 404/503 (часто возвращают HTML или plain text)
      const textResponse = await response.text();

      if (!response.ok) {
        console.warn(`Model ${model} failed: ${response.status} - ${textResponse}`);
        lastError = `HTTP ${response.status} on ${model}`;
        // Если 404 (модель не найдена на роутере) или 503 (загрузка), пробуем следующую
        continue;
      }

      // Пробуем распарсить ответ как JSON (формат OpenAI)
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        lastError = `Invalid JSON from ${model}`;
        continue;
      }

      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
         lastError = `Empty content from ${model}`;
         continue;
      }

      // Ищем JSON-массив с вопросами внутри текста
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']') + 1;
      
      if (start === -1 || end <= 0) {
         lastError = `No JSON array in ${model} response`;
         continue;
      }

      const cleanJson = content.substring(start, end);
      const questions = JSON.parse(cleanJson);

      // Успех!
      return res.status(200).json({ questions, modelUsed: model });

    } catch (e) {
      console.error(`Error with ${model}:`, e.message);
      lastError = e.message;
    }
  }

  // Если все модели перебрали и ни одна не ответила
  return res.status(500).json({ 
    error: `All models failed. Last error: ${lastError}`,
    details: "Check API Key permissions or Hugging Face status."
  });
}