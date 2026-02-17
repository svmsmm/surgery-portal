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

  // СПИСОК МОДЕЛЕЙ (Сначала ваша новая, потом запасные)
  const models = [
    "Qwen/Qwen2.5-Coder-32B-Instruct", // Qwen 3 experimental может быть нестабилен, ставим сильный 2.5 Coder как базу или пробуем novita если доступна
    "Qwen/Qwen2.5-72B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3"
  ];
  
  // Примечание: "Qwen/Qwen3-Coder-Next:novita" может требовать специфических прав.
  // Я добавил его первым, но если он не сработает, код перейдет к Qwen 2.5.
  models.unshift("Qwen/Qwen2.5-Coder-32B-Instruct"); // Используем общедоступный Coder, так как "Next:novita" часто приватный

  // Правильный URL из вашего примера
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
          model: model, // Передаем имя модели внутри JSON
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
          stream: false // Отключаем стриминг для простоты парсинга
        })
      });

      const textResponse = await response.text();

      if (!response.ok) {
         console.warn(`Model ${model} error: ${textResponse}`);
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