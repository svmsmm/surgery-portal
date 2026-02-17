export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { prompt } = req.body;
  const apiKey = process.env.VITE_HF_KEY || process.env.VITE_GEMINI_KEY || process.env.HF_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  // Список моделей. Для скорости используем 7B модели в приоритете, они быстрее.
  const models = [
    "Qwen/Qwen2.5-72B-Instruct", // Умная
    "Qwen/Qwen2.5-7B-Instruct",  // Быстрая
    "mistralai/Mistral-7B-Instruct-v0.3"
  ];

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`Using model: ${model}`);
      
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
              content: "You are a medical professor. Generate 5-10 multiple-choice questions in Russian based strictly on the provided text chunk. Output RAW JSON ARRAY only. No markdown." 
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          max_tokens: 3000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const txt = await response.text();
        // Если 404 или 503, пробуем следующую
        if (response.status === 404 || response.status === 503) {
            lastError = `${model} status ${response.status}`;
            continue;
        }
        throw new Error(txt);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      const start = content.indexOf('[');
      const end = content.lastIndexOf(']') + 1;
      
      if (start === -1 || end <= 0) {
         lastError = "Invalid JSON format";
         continue;
      }

      const cleanJson = content.substring(start, end);
      const questions = JSON.parse(cleanJson);

      return res.status(200).json({ questions, modelUsed: model });

    } catch (e) {
      console.error(`Error ${model}:`, e.message);
      lastError = e.message;
    }
  }

  return res.status(500).json({ error: `All models failed. ${lastError}` });
}