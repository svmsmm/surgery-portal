export default async function handler(req, res) {
  // 1. Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { prompt, apiKey } = req.body;
  
  // Ключ берем от клиента или из настроек
  const token = apiKey || process.env.VITE_HF_KEY || process.env.HF_KEY;

  if (!token) {
    return res.status(401).json({ error: 'API Key is missing.' });
  }

  // СПИСОК МОДЕЛЕЙ (Ваш запрос - первая в списке)
  const models = [
    "Qwen/Qwen3-Coder-Next:novita",    // Запрошенная модель
    "Qwen/Qwen2.5-Coder-32B-Instruct", // Очень сильный кодер (резерв 1)
    "Qwen/Qwen2.5-72B-Instruct",       // Общий интеллект (резерв 2)
    "mistralai/Mistral-7B-Instruct-v0.3" // Надежная классика (резерв 3)
  ];

  // Правильный URL для OpenAI-совместимого API на роутере HF
  const url = "https://router.huggingface.co/v1/chat/completions";

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`Trying model: ${model}...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          model: model, // Имя модели передается внутри тела запроса
          messages: [
            { 
              role: "system", 
              content: "You are a medical professor. Generate 30 multiple-choice questions in Russian based on the text. Output valid JSON Array only. No markdown formatting." 
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          max_tokens: 3000,
          stream: false
        })
      });

      const textResponse = await response.text();

      if (!response.ok) {
         console.warn(`Model ${model} error: ${textResponse}`);
         // Сохраняем ошибку, но пробуем следующую модель в цикле
         lastError = `${model}: ${response.status} - ${textResponse}`;
         continue; 
      }

      // Пытаемся распарсить ответ (формат OpenAI)
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        lastError = "Response was not JSON";
        continue;
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
         lastError = "Empty content";
         continue;
      }

      // Ищем JSON-массив с вопросами
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']') + 1;
      
      if (start === -1) {
         lastError = "No JSON array in output";
         continue;
      }

      const cleanJson = content.substring(start, end);
      const questions = JSON.parse(cleanJson);

      return res.status(200).json({ questions, model });

    } catch (e) {
      console.error(`Failed ${model}:`, e.message);
      lastError = e.message;
    }
  }

  return res.status(500).json({ error: `All models failed. Last error: ${lastError}` });
}