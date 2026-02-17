// api/generate.js — HF Router + Qwen3-Coder-Next

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST' });
  }

  try {
    const { lectureText, text } = req.body || {};
    const input = typeof lectureText === 'string' ? lectureText : text;

    if (!input || typeof input !== 'string' || input.length < 20) {
      return res.status(400).json({
        ok: false,
        error:
          'Поле lectureText (или text) обязательно и должно быть строкой длиной ≥ 20 символов.'
      });
    }

    const hfToken = process.env.HF_API_TOKEN;
    if (!hfToken) {
      console.error('HF_API_TOKEN is not set');
      return res.status(500).json({
        ok: false,
        error: 'Server config error: переменная HF_API_TOKEN не задана.'
      });
    }

    const url = 'https://router.huggingface.co/v1/chat/completions';

    const systemPrompt =
      'Ты преподаватель в медицинском университете (хирургия). ' +
      'По тексту лекции сгенерируй РОВНО 30 тестовых вопросов (multiple choice). ' +
      'Каждый вопрос должен иметь структуру:\n' +
      '{ "question": "текст вопроса",' +
      '  "options": ["A) ...","B) ...","C) ...","D) ..."],' +
      '  "correctAnswer": "A) ..." }\n\n' +
      'Требования:\n' +
      '- Вопросы должны соответствовать медицинскому содержанию лекции.\n' +
      '- В массиве ДОЛЖНО быть ровно 30 элементов.\n' +
      '- Верни ТОЛЬКО один JSON‑массив без пояснений, текста до или после.\n' +
      '- Ответ должен начинаться с "[" и заканчиваться "]".\n';

    const userPrompt = `Текст лекции:\n\n${input}`;

    const body = {
      model: 'Qwen/Qwen3-Coder-Next:novita',
      stream: false,
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    const hfRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const raw = await hfRes.text();

    let hfJson;
    try {
      hfJson = JSON.parse(raw);
    } catch (e) {
      console.error('HF returned non-JSON:', raw.slice(0, 300));
      return res.status(502).json({
        ok: false,
        error: 'Hugging Face вернул невалидный JSON',
        status: hfRes.status,
        bodyPreview: raw.slice(0, 500)
      });
    }

    if (!hfRes.ok) {
      console.error('HF API error:', hfRes.status, hfJson);
      return res.status(hfRes.status).json({
        ok: false,
        error:
          hfJson.error?.message ||
          hfJson.error ||
          'Hugging Face API error',
        status: hfRes.status,
        details: hfJson
      });
    }

    const content =
      hfJson.choices?.[0]?.message?.content?.trim?.() || '';

    console.log('HF content preview:', content.slice(0, 200));

    if (!content) {
      return res.status(502).json({
        ok: false,
        error: 'Пустой текст в choices[0].message.content',
        raw: hfJson
      });
    }

    // Попытка 1 — парсим как есть
    let questions;
    try {
      questions = JSON.parse(content);
    } catch (e1) {
      // Попытка 2 — вырезаем массив между [ ... ]
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']');
      if (start !== -1 && end !== -1 && end > start) {
        const jsonSlice = content.slice(start, end + 1);
        try {
          questions = JSON.parse(jsonSlice);
        } catch (e2) {
          console.error('JSON parse error 2:', e2, jsonSlice.slice(0, 200));
          return res.status(502).json({
            ok: false,
            error: 'Не удалось извлечь JSON из ответа модели',
            textPreview: content.slice(0, 500)
          });
        }
      } else {
        console.error('No JSON array found in content:', content.slice(0, 200));
        return res.status(502).json({
          ok: false,
          error: 'Не удалось найти JSON-массив в ответе модели',
          textPreview: content.slice(0, 500)
        });
      }
    }

    if (!Array.isArray(questions)) {
      return res.status(502).json({
        ok: false,
        error: 'Ожидался массив вопросов, но пришло что‑то другое',
        valuePreview: JSON.stringify(questions).slice(0, 200)
      });
    }

    return res.status(200).json({
      ok: true,
      count: questions.length,
      questions
    });
  } catch (err) {
    console.error('Unexpected error in /api/generate:', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Internal server error'
    });
  }
}