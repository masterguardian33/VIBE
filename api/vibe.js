// api/vibe.js — Vercel serverless function
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

  try {
    const { mode = 'parent', input = '' } = req.body || {};
    if (!String(input).trim()) return res.status(400).json({ error: 'Empty input' });

    // helper: call OpenAI
    const chat = async (messages, model = 'gpt-4o', temperature = 0.35) => {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, temperature, messages })
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
      const j = await r.json();
      return j.choices?.[0]?.message?.content || '';
    };

    // 1) Safety check
    const safetyPrompt =
      'Return ONLY JSON like {"label":"ok|self_harm|abuse|sexual_content_minor|suicide_imminent|violence","reason":"..."}';
    const safetyRaw = await chat(
      [{ role: 'system', content: safetyPrompt }, { role: 'user', content: input }],
      'gpt-4o-mini',
      0
    );
    let safety = { label: 'ok' };
    try { safety = JSON.parse(safetyRaw); } catch {}
    if (safety.label !== 'ok') {
      return res.status(200).json({
        type: 'safety',
        safety,
        message:
          'We’re concerned about safety. If you’re in immediate danger, call local emergency services.'
      });
    }

    // 2) Coaching
    const parentSystem =
      'You are Vibe, a wise family coach. Return JSON {opener,reason,script,why,avoid,avoid_why}. Short opener (no blame), explain WHY (safety/respect/trust), exact script, 1–2 line why-this-works, one avoid+why. Warm, human.';
    const teenSystem =
      'You are Vibe for teens. Return JSON {opener,acknowledge,ask,compromise,why,trust_step}. Natural opener, acknowledge parent view, clear ask + one compromise, why it works, trust step.';
    const rephSystem =
      'You are Vibe Rephraser. Return JSON {warm,neutral,direct_respectful}. Three calmer versions with clear request.';

    const system = mode === 'teen' ? teenSystem : mode === 'rephrase' ? rephSystem : parentSystem;

    const raw = await chat(
      [{ role: 'system', content: system }, { role: 'user', content: input }],
      'gpt-4o',
      0.3
    );

    try {
      const json = JSON.parse(raw);
      return res.status(200).json({ type: 'ok', mode, output: json });
    } catch {
      return res.status(200).json({ type: 'text', mode, output: raw });
    }
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
