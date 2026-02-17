export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { prompt, apiKey: clientApiKey } = req.body;
    
    // 1. Приоритет ключу от клиента (из админки), затем из Vercel
    const apiKey = clientApiKey || process.env.VITE_HF_KEY || process.env.HF_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'API Key is missing. Enter it in the Admin panel.' });
    }

    // 2. Список моделей Hugging Face (в порядке приоритета)
    const models = [
      "Qwen/Qwen2.5-72B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "mistralai/Mistral-7B-Instruct-v0.3",
      "google/gemma-2-9b-it"
    ];

    let lastError = null;

    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
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
              { role: "system", content: "You are a medical professor. Generate 5-10 multiple-choice questions in Russian. Output valid JSON Array only. No markdown." },
              { role: "user", content: prompt }
            ],
            max_tokens: 3000,
            temperature: 0.1
          })
        });

        if (!response.ok) {
           const errText = await response.text();
           if (response.status === 503) { // Loading
             throw new Error(`Model loading: ${errText}`);
           }
           if (response.status === 404) { // Not found
             continue; 
           }
           throw new Error(`HF Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) throw new Error("Empty response from AI");

        // Парсинг JSON
        const start = content.indexOf('[');
        const end = content.lastIndexOf(']') + 1;
        
        if (start === -1) throw new Error("No JSON array found in response");
        
        const cleanJson = content.substring(start, end);
        const questions = JSON.parse(cleanJson);

        return res.status(200).json({ questions, model });
      } catch (e) {
        console.warn(`Model ${model} failed:`, e.message);
        lastError = e.message;
      }
    }

    throw new Error(`All models failed. Last error: ${lastError}`);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}