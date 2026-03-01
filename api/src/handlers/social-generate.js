/**
 * Social Generate Handler
 * POST /social/generate - Generate social media post text using Claude Haiku
 */

const { isAdmin } = require('../lib/admin-check');
const { success, error, options } = require('../lib/response');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  if (!isAdmin(event)) {
    return error(403, 'Forbidden: Admin access required');
  }

  if (event.httpMethod !== 'POST') {
    return error(405, `Method ${event.httpMethod} not allowed`);
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { topic, context, tone } = body;

    if (!topic) {
      return error(400, 'topic is required');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return error(500, 'ANTHROPIC_API_KEY not configured');
    }

    const toneGuide = tone === 'professional'
      ? 'Professional and informative'
      : 'Direct, casual, punchy — like a real person, not a corporate account';

    const prompt = `Write a short social media post for CreditOdds about:
Topic: ${topic}
${context ? `Context: ${context}` : ''}

Rules:
- Max 200 characters (shorter is better)
- Lead with a hook like "BREAKING:" or "NEW:" or a bold statement when appropriate
- Tone: ${toneGuide}
- No filler words, no "excited to announce", no "stay tuned"
- 1 hashtag max, only if it adds value. Skip hashtags if the post is strong without one
- Do NOT include any URL
- Do NOT use emojis excessively — 0-1 emoji max
- Return ONLY the post text, nothing else`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return error(502, `Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let text = (data.content[0]?.text || '').trim();

    // Remove surrounding quotes if Claude added them
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }

    if (text.length > 260) {
      text = text.substring(0, 257) + '...';
    }

    return success({ text, length: text.length });
  } catch (err) {
    console.error('Error generating post:', err);
    return error(500, `Failed to generate post: ${err.message}`);
  }
};
