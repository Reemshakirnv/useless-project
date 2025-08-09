// script.js

// ---------- Config & Helpers ----------
const sampleTexts = [
  "The quick brown fox jumps over the lazy dog.",
  "2023 brought many changes: 7 launches, 3 delays, and 12 lessons learned.",
  "Coding in JavaScript can be both fun and challenging.",
  "Roses are red, violets are blue, HTML and CSS, I love you.",
  "In the quiet evening, a small lamp hummed while the rain traced time."
];

// If you need a CORS proxy for client fetches during dev, set it here (optional)
// const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const CORS_PROXY = ''; // keep empty for direct fetch; set only for testing

// Server-side endpoint fallback (must implement a server that:
// 1) fetches the URL content (avoids CORS)
// 2) calls the LLM (Gemini) securely with your key and returns structured JSON)
// Example: POST /fetch-and-generate { url, char, type }
const SERVER_FALLBACK_ENDPOINT = '/fetch-and-generate'; // implement on your server

const $ = id => document.getElementById(id);

// basic URL detection
function looksLikeUrl(s) {
  return /^https?:\/\/\S+/i.test(s.trim());
}

// clean HTML -> plain text (simple)
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// word tokenizer (letters, numbers, apostrophes, hyphens)
function extractWords(text) {
  return text.match(/[\p{L}\p{N}'’\-]+/gu) || [];
}

// counts how many words start with the given char (case-insensitive)
function countStartsWith(words, char) {
  if (!char) return 0;
  const lower = char.toLowerCase();
  return words.filter(w => w[0] && w[0].toLowerCase() === lower).length;
}

// ---------- Model / Gemini call (client-side example) ----------
// WARNING: Do NOT put private API keys here for production.
// Recommended: implement a server endpoint that calls the model (server side).
//
// If you still want to call a public generative endpoint directly (dev only),
// replace `CALL_MODEL_DIRECT` with true and fill API_KEY and ENDPOINT accordingly.
// But again — don't expose secrets in frontend code.

const CALL_MODEL_DIRECT = false; // set true only for quick local testing (not recommended)
const MODEL_API_KEY = 'REPLACE_WITH_KEY_IF_DIRECT_CALL'; // DO NOT commit real key
const MODEL_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_KEY';

// call model by sending a prompt and expecting JSON back (structured)
async function callModelForAnalysis(prompt) {
  if (!CALL_MODEL_DIRECT) {
    throw new Error('Direct model call disabled in client. Use server fallback endpoint.');
  }

  const body = {
    // The exact request shape depends on the model API; adjust if necessary.
    // This example follows the earlier sample shape with contents.parts[].text
    "temperature": 0.3,
    "maxOutputTokens": 400,
    "candidateCount": 1,
    "safetySettings": [],
    "input": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": prompt }
        ]
      }
    ]
  };

  const res = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': `Bearer ${MODEL_API_KEY}` // if required by the endpoint
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Model call failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  // This parsing depends on the exact LLM response shape; adapt as needed.
  // Here we attempt to find text in common locations.
  let textOut = '';
  try {
    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      const parts = json.candidates[0].content.parts || [];
      textOut = parts.map(p => p.text || '').join(' ');
    } else if (json.output && json.output[0] && json.output[0].content) {
      textOut = Array.isArray(json.output[0].content) ? json.output[0].content.map(c=>c.text||'').join(' ') : '';
    } else {
      textOut = JSON.stringify(json);
    }
  } catch (e) {
    textOut = JSON.stringify(json);
  }
  return textOut;
}

// ---------- Wrapper: generate analysis/generation using model or server ----------
/*
  We will attempt this flow for a URL:
   1. Try client-side fetch(url) to get HTML -> clean -> continue locally and also send cleaned text to model
   2. If client-side fetch fails (CORS or network), call SERVER_FALLBACK_ENDPOINT with { url, char, type }.
      The server should:
        - fetch URL content,
        - clean text,
        - compute counts OR call the model for structured JSON,
        - return JSON: { totalWords, startsWithCount, creativeText }
*/
async function analyzeAndGenerateForUrl(url, char, type) {
  // try client-side fetch first
  try {
    const fetchUrl = CORS_PROXY ? CORS_PROXY + encodeURIComponent(url) : url;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const cleaned = stripHtml(html);
    // compute locally
    const words = extractWords(cleaned);
    const total = words.length;
    const starts = countStartsWith(words, char);

    // Build a structured prompt for the model (ask for JSON answer)
    const modelPrompt = `
You will be given plain text extracted from a webpage.
1) Count total words in the text.
2) Count how many words start with the character "${char}" (case-insensitive).
3) Produce a creative ${type} (riddle/poem/haiku) where the first line (or answer) begins/relates to a word that starts with "${char}".
Return ONLY valid JSON with fields: totalWords, startsWithCount, creative.
Text:
"""${cleaned.slice(0, 20000)}"""
`;

    let creative = '';
    // attempt to call model (client-side) if allowed
    try {
      if (CALL_MODEL_DIRECT) {
        const modelResult = await callModelForAnalysis(modelPrompt);
        // try to parse JSON out (model expected to return JSON)
        const jsonMatch = modelResult.match(/{[\\s\\S]*}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            totalWords: parsed.totalWords ?? total,
            startsWithCount: parsed.startsWithCount ?? starts,
            creative: parsed.creative ?? parsed.creativeText ?? modelResult
          };
        } else {
          // no JSON — fallback to using local counts and model text as creative
          creative = modelResult;
        }
      } else {
        // client direct model call disabled -> skip calling here and fallback to server for generation
      }
    } catch (e) {
      console.warn('Model call failed (client), will fallback to server or local generation:', e);
    }

    // If model not called on client or failed, return local counts and a placeholder creative to be generated server-side if needed
    return {
      totalWords: total,
      startsWithCount: starts,
      creative: creative || null // null signals the caller/server to generate creative if desired
    };

  } catch (clientFetchError) {
    console.warn('Client-side fetch failed (likely CORS). Falling back to server endpoint.', clientFetchError);

    // Fallback: ask server to fetch and generate
    try {
      const res = await fetch(SERVER_FALLBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, char, type })
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const json = await res.json();
      // Expect server JSON: { totalWords, startsWithCount, creative }
      return {
        totalWords: json.totalWords ?? 0,
        startsWithCount: json.startsWithCount ?? 0,
        creative: json.creative ?? null
      };
    } catch (serverErr) {
      console.error('Server fallback failed:', serverErr);
      // ultimate fallback: return empty result
      return { totalWords: 0, startsWithCount: 0, creative: null };
    }
  }
}

// ---------- Local creative generators (fallback if model not available) ----------
function localGenerateCreative(char, type) {
  const C = char.toUpperCase();
  if (type === 'haiku') {
    return `${C} drifts at sunrise\nsoft syllables stir the day\nquiet paths open`;
  }
  if (type === 'riddle') {
    return `I start with ${C} and lead the line,\nI hide in words you use all the time.\nWhat am I?`;
  }
  // poem (rhyming couplet)
  if (type === 'poem') {
    return `${C} begins the verse and sets the tone,\nA single sound that guides each poem.`;
  }
  return '';
}

// ---------- UI handlers ----------

$('btnRandom').addEventListener('click', ()=> {
  // if field empty, insert a random sample paragraph; if user has lines, pick a random line
  const val = $('textInput').value.trim();
  if (!val) {
    $('textInput').value = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    return;
  }
  const lines = val.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (lines.length === 0) {
    $('textInput').value = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
  } else {
    $('textInput').value = lines[Math.floor(Math.random() * lines.length)];
  }
});

$('btnClear').addEventListener('click', ()=> {
  $('textInput').value = '';
  $('generated').textContent = '(nothing yet)';
  $('totalWords').textContent = '—';
  $('startsWith').textContent = '—';
});

// Main analyze flow
$('btnAnalyze').addEventListener('click', async () => {
  const input = $('textInput').value.trim();
  const char = $('letterInput').value.trim();
  const type = $('generationType').value;

  if (!input) return alert('Please paste or fetch some text first.');
  if (!char || char.length > 1) return alert('Please enter a single letter or number to analyze.');

  // If the input is a URL (single URL or first line is URL), follow URL flow
  const firstLine = input.split(/\r?\n/)[0].trim();
  let result = null;

  if (looksLikeUrl(firstLine)) {
    // analyze by URL (may fetch page or call server)
    $('generated').textContent = 'Analyzing web page (this may take a moment)...';
    result = await analyzeAndGenerateForUrl(firstLine, char, type);

    // If server/client returned no creative text, attempt server generation or local fallback
    if (!result.creative) {
      // try server generation (in case server can call model)
      try {
        const res = await fetch(SERVER_FALLBACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: firstLine, char, type, onlyGenerate: true })
        });
        if (res.ok) {
          const j = await res.json();
          result.creative = j.creative ?? null;
          // update counts if server returned them
          if (j.totalWords) result.totalWords = j.totalWords;
          if (j.startsWithCount) result.startsWithCount = j.startsWithCount;
        }
      } catch (e) {
        console.warn('Server generate failed or not available:', e);
      }

      // final fallback: generate locally
      if (!result.creative) result.creative = localGenerateCreative(char, type);
    }

  } else {
    // treat input as raw text -> compute locally and optionally call model with the text
    const cleaned = input; // already plaintext (user pasted)
    const words = extractWords(cleaned);
    const total = words.length;
    const starts = countStartsWith(words, char);

    result = { totalWords: total, startsWithCount: starts, creative: null };

    // Build model prompt and try calling server (preferred) or client (if allowed)
    const promptForModel = `
You are given the following plain text. Provide JSON only:
{
  "totalWords": <number>,
  "startsWithCount": <number>,
  "creative": "<a ${type} (riddle/poem/haiku) inspired by the letter '${char}'>"
}
Text:
"""${cleaned.slice(0, 20000)}"""
`;

    // Prefer server generation for security and reliability
    try {
      const res = await fetch('/generate-from-text', { // optional server endpoint you can implement
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ text: cleaned, char, type })
      });
      if (res.ok) {
        const data = await res.json();
        result.totalWords = data.totalWords ?? result.totalWords;
        result.startsWithCount = data.startsWithCount ?? result.startsWithCount;
        result.creative = data.creative ?? null;
      }
    } catch (e) {
      // server not available — try client direct model call if allowed
      if (CALL_MODEL_DIRECT) {
        try {
          const modelText = await callModelForAnalysis(promptForModel);
          // parse JSON returned by model
          const jsonMatch = modelText.match(/{[\\s\\S]*}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            result.totalWords = parsed.totalWords ?? result.totalWords;
            result.startsWithCount = parsed.startsWithCount ?? result.startsWithCount;
            result.creative = parsed.creative ?? null;
          } else {
            result.creative = modelText; // fallback
          }
        } catch (err) {
          console.warn('client model call failed:', err);
        }
      }
    }

    // if still no creative text, fallback to local generator
    if (!result.creative) {
      result.creative = localGenerateCreative(char, type);
    }
  }

  // Update UI
  $('totalWords').textContent = result.totalWords ?? 0;
  $('startsWith').textContent = result.startsWithCount ?? 0;
  $('generated').textContent = result.creative ?? '(no output)';
});
