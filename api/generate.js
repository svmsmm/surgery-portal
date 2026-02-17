export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Ищем ключ (поддерживаем разные имена)
  const apiKey = process.env.VITE_HF_KEY || process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key is missing.' });
  }

  const { prompt } = req.body;

  try {
    // Используем Qwen 2.5 через Hugging Face
    const url = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct";
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        inputs: `<|im_start|>system\nYou are a professor. Generate 30 MCQs in Russian (JSON Array only).\n<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant`,
        parameters: { max_new_tokens: 4000, temperature: 0.1, return_full_text: false }
      })
    });

    // Читаем текст ответа, даже если там ошибка
    const rawText = await response.text();

    if (!response.ok) {
      // Если модель грузится (503), возвращаем понятную ошибку
      if (rawText.includes("loading")) {
          return res.status(503).json({ error: "Model is loading (Cold Start). Wait 30s." });
      }
      return res.status(response.status).json({ error: `HF Error: ${rawText}` });
    }

    // Пытаемся найти JSON
    const start = rawText.indexOf('[');
    const end = rawText.lastIndexOf(']') + 1;
    
    if (start === -1) {
       return res.status(500).json({ error: "AI returned text, not JSON", raw: rawText.substring(0, 200) });
    }

    const jsonPart = rawText.substring(start, end);
    const questions = JSON.parse(jsonPart);

    return res.status(200).json({ questions });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}