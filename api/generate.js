export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { prompt, apiKey } = req.body;
  const token = apiKey || process.env.VITE_HF_KEY || process.env.HF_KEY;

  if (!token) {
    return res.status(401).json({ error: 'API Key is missing.' });
  }

  // Используем Qwen 2.5 72B (или 7B как запасной)
  const models = [
    "Qwen/Qwen2.5-72B-Instruct", 
    "Qwen/Qwen2.5-7B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3"
  ];

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
          model: model,
          messages: [
            { 
              role: "system", 
              // СТРОГИЙ ПРОМПТ С УТОЧНЕННЫМИ КЛЮЧАМИ
              content: `You are a medical professor. Generate exactly 30 multiple-choice questions in Russian based on the text.
              Output ONLY a raw JSON Array. No markdown.
              Format: [{"question": "Текст вопроса", "options": ["А", "Б", "В", "Г"], "correctIndex": 0}]` 
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
      });

      const textResponse = await response.text();

      if (!response.ok) {
         console.warn(`Model ${model} error: ${textResponse}`);
         lastError = `${model}: ${response.status}`;
         continue; 
      }

      // Парсинг
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

      const start = content.indexOf('[');
      const end = content.lastIndexOf(']') + 1;
      
      if (start === -1) {
         lastError = "No JSON array in output";
         continue;
      }

      const cleanJson = content.substring(start, end);
      const questions = JSON.parse(cleanJson);

      // Валидация структуры (чтобы не было пустых вопросов)
      const validQuestions = questions.filter(q => q.question && q.options && q.options.length > 1);

      return res.status(200).json({ questions: validQuestions, model });

    } catch (e) {
      console.error(`Failed ${model}:`, e.message);
      lastError = e.message;
    }
  }

  return res.status(500).json({ error: `All models failed. Last error: ${lastError}` });
}