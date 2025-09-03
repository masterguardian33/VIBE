// api/vibe.js
export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: 'Missing OPENAI_API_KEY on server' });

    const { mode = 'parent', input = '' } = (req.body || {});
    if (!String(input).trim()) return res.status(400).json({ error: 'Empty input' });

    const call = async (messages, model = 'gpt-4o-mini', temperature = 0.35) => {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature, messages })
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${text}`);
      const j = JSON.parse(text);
      return j.choices?.[0]?.message?.content || '';
    };

    // Safety
    const safetyRaw = await call(
      [
        { role: 'system', content: 'Return ONLY JSON like {"label":"ok|self_harm|abuse|sexual_content_minor|suicide_imminent|violence","reason":"..."}' },
        { role: 'user', content: input }
      ],
      'gpt-4o-mini',
      0
    );
    let safety = { label: 'ok' };
    try { safety = JSON.parse(safetyRaw); } catch {}
    if (safety.label !== 'ok') {
      return res.status(200).json({
        type: 'safety',
        safety,
        message: 'We’re concerned about safety. If you’re in immediate danger, call local emergency services.'
      });
    }

    // Coaching
    const parent = 'Return JSON {opener,reason,script,why,avoid,avoid_why}. Short opener (no blame), explain WHY, exact script, 1–2 lines why, one avoid+why. Warm, human.';
    const teen   = 'Return JSON {opener,acknowledge,ask,compromise,why,trust_step}. Natural opener, acknowledge parent, clear ask + compromise, why, trust step.';
    const reph   = 'Return JSON {warm,neutral,direct_respectful}. Three calmer rewrites with a clear request.';

    const system = mode === 'teen' ? teen : mode === 'rephrase' ? reph : parent;

    const raw = await call(
      [{ role: 'system', content: system }, { role: 'user', content: input }],
      'gpt-4o-mini', // safer default
      0.3
    );

    try { return res.status(200).json({ type: 'ok', mode, output: JSON.parse(raw) }); }
    catch { return res.status(200).json({ type: 'text', mode, output: raw }); }
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
