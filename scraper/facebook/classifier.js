import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `אתה מסווג מודעות דירות להשכרה מקבוצות פייסבוק בישראל.
קיבלת טקסט של פוסט. החלט האם זו מודעת דירה להשכרה וחלץ פרטים.

ענה אך ורק ב-JSON תקני:
{"isApartment":true/false,"price":number|null,"rooms":number|null,"city":"string"|null,"neighborhood":"string"|null,"street":"string"|null,"floor":number|null,"areaSqm":number|null,"phone":"string"|null,"petsAllowed":true/false/null,"parking":true/false/null,"balcony":true/false/null,"postedAt":"YYYY-MM-DD"|null}

postedAt: אם יש תאריך פרסום (לא תאריך כניסה), חלץ אותו בפורמט YYYY-MM-DD. היום זה ${new Date().toISOString().split('T')[0]}.

מודעות דירה: השכרה, סאבלט, שותפים, דירה למסירה.
לא מודעות: ניקיון, הובלות, שיפוצים, רהיטים, שאלות.`;

// Pre-filter: quick keyword check before sending to LLM
const QUICK_KEYWORDS = [
  'להשכרה', 'לשכירות', 'דירה', 'חדרים', 'חדר', 'דירת',
  'למסירה', 'שכ"ד', 'שכירות', 'room', 'apartment',
  'studio', 'סטודיו', 'פנטהאוז', 'דופלקס', 'מיני פנט', 'גג',
];

function mightBeApartment(text) {
  const lower = text.toLowerCase();
  return QUICK_KEYWORDS.some((kw) => lower.includes(kw));
}

async function callWithRetry(text, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 1500) },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });
      return response.choices[0]?.message?.content || null;
    } catch (err) {
      if (err.status === 429 && attempt < retries) {
        // Wait before retry - extract wait time or use default
        const waitMatch = err.message.match(/(\d+)m(\d+)/);
        const waitMs = waitMatch
          ? (parseInt(waitMatch[1]) * 60 + parseInt(waitMatch[2])) * 1000
          : 30000;
        const cappedWait = Math.min(waitMs, 60000); // cap at 60s
        console.log(`  Rate limited, waiting ${Math.round(cappedWait / 1000)}s...`);
        await new Promise((r) => setTimeout(r, cappedWait));
        continue;
      }
      throw err;
    }
  }
  return null;
}

export async function classifyPost(text) {
  if (!text || text.length < 20) return null;

  // Quick keyword pre-filter to save API calls
  if (!mightBeApartment(text)) return null;

  try {
    const content = await callWithRetry(text);
    if (!content) return null;

    const result = JSON.parse(content);
    if (!result.isApartment) return null;

    return {
      source: 'facebook',
      price: result.price || null,
      rooms: result.rooms || null,
      city: result.city || null,
      neighborhood: result.neighborhood || null,
      street: result.street || null,
      floor: result.floor || null,
      areaSqm: result.areaSqm || null,
      phone: result.phone?.replace(/[\s-]/g, '') || null,
      petsAllowed: result.petsAllowed ?? null,
      parking: result.parking ?? null,
      balcony: result.balcony ?? null,
      postedAt: result.postedAt || null,
    };
  } catch (err) {
    console.error('Groq error:', err.message?.slice(0, 100));
    return null;
  }
}
