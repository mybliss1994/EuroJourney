// ─────────────────────────────────────────────────────────────────
//  TravelNest Server
//  Single API route: POST /api/generate
//  Streams Claude's response back to the browser as Server-Sent Events
// ─────────────────────────────────────────────────────────────────

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

// ── Load .env file manually (no extra dependency needed) ──────────
try {
  const envPath = path.join(__dirname, '.env');
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch (_) {
  // .env not found — use system environment variables
}

// ── Validate API key ──────────────────────────────────────────────
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY || API_KEY === 'your-api-key-here') {
  console.error('\n❌  ERROR: ANTHROPIC_API_KEY is not set.');
  console.error('   1. Copy .env.example to .env');
  console.error('   2. Add your API key from https://console.anthropic.com');
  console.error('   3. Run: node server.js\n');
  process.exit(1);
}

const app = express();
const client = new Anthropic({ apiKey: API_KEY });

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Simple in-memory rate limiter (10 req / 60s per IP) ──────────
const rateLimits = new Map();
setInterval(() => rateLimits.clear(), 60_000); // clear every minute

function checkRateLimit(ip) {
  const count = (rateLimits.get(ip) || 0) + 1;
  rateLimits.set(ip, count);
  return count <= 10;
}

// ── Input validation ──────────────────────────────────────────────
const TRAVELER_TYPES = ['solo', 'couple', 'family', 'group'];
const INTERESTS = ['culture', 'food', 'nature', 'history', 'adventure', 'art', 'relaxation', 'nightlife'];
const PACES = ['relaxed', 'moderate', 'packed'];
const REGIONS = ['worldwide', 'europe', 'asia', 'americas', 'africa', 'oceania', 'middle-east'];

function validateInputs({ destination, start_date, end_date, traveler_type, interest, pace, region }) {
  if (!destination || typeof destination !== 'string' || destination.length < 2 || destination.length > 100)
    return 'Invalid destination.';
  if (!start_date || !end_date) return 'Start and end dates are required.';
  const start = new Date(start_date);
  const end = new Date(end_date);
  if (isNaN(start) || isNaN(end)) return 'Invalid dates.';
  if (end <= start) return 'End date must be after start date.';
  const days = (end - start) / (1000 * 60 * 60 * 24);
  if (days > 30) return 'Trip cannot exceed 30 days.';
  if (!TRAVELER_TYPES.includes(traveler_type)) return 'Invalid traveler type.';
  if (!INTERESTS.includes(interest)) return 'Invalid interest.';
  if (pace && !PACES.includes(pace)) return 'Invalid pace.';
  if (region && !REGIONS.includes(region)) return 'Invalid region.';
  return null;
}

// ── Build Claude prompt ───────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert global travel planner with comprehensive knowledge of destinations worldwide, including:
- Seasonal weather, climate patterns, and best-time-to-visit for every region on Earth
- Local festivals, cultural events, national holidays, and seasonal highlights worldwide
- Famous landmarks, hidden gems, restaurants, markets, and authentic local experiences
- Practical travel logistics: transport options, walking distances, opening hours, booking tips
- Cultural etiquette, safety tips, local customs, and must-know phrases
- Visa basics, currency, local transport, and practical traveller advice
- How to tailor trips for different traveller types: solo, couples, families, groups

IMPORTANT RULES:
- Only recommend real, verifiable places that actually exist
- Reflect the season realistically — do NOT suggest beach swimming in monsoon season, or activities unavailable at that time
- Mention major festivals or cultural events naturally within the activities if they apply
- season_note should be practical and honest: weather, crowd levels, what to watch for, what to pack
- Each activity description should be vivid, accurate, and genuinely helpful
- Tips must be practical: booking advice, best time to visit, local knowledge, cultural notes
- Adjust number of daily activities to the requested pace:
  * relaxed: 2 main activities per day, gentle pace
  * moderate: 3 activities per day, balanced
  * packed: 4+ activities per day, ambitious

Output ONLY a valid JSON object — no markdown, no explanation, just JSON:
{
  "title": "Descriptive trip title (e.g. 'A Romantic Week in Kyoto — Spring 2026')",
  "destination_summary": "1-2 engaging sentences about this destination and why it's special",
  "season_note": "Practical seasonal advice: weather, crowd levels, events on, what to pack/prepare, any cultural notes",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_theme": "Optional short theme for the day (e.g. 'Ancient Temples', 'Coastal Exploration')",
      "morning":   { "activity": "Name", "description": "2-3 vivid sentences", "tip": "Practical local tip", "duration": "Xh" },
      "afternoon": { "activity": "Name", "description": "2-3 vivid sentences", "tip": "Practical local tip", "duration": "Xh" },
      "evening":   { "activity": "Name", "description": "2-3 vivid sentences", "tip": "Practical local tip", "duration": "Xh" }
    }
  ]
}`;

function buildUserMessage({ destination, start_date, end_date, traveler_type, interest, pace, region }) {
  const start = new Date(start_date);
  const end = new Date(end_date);
  const numDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const month = start.toLocaleString('en-US', { month: 'long' });
  const year = start.getFullYear();
  const regionNote = region && region !== 'worldwide' ? ` (${region} region)` : '';

  return `Plan a ${numDays}-day trip with the following details:

Destination: ${destination}${regionNote}
Dates: ${start_date} to ${end_date} (${numDays} days, ${month} ${year})
Traveller type: ${traveler_type}
Primary interest: ${interest}
Pace preference: ${pace || 'moderate'}

Generate exactly ${numDays} days of activities, starting from ${start_date}.
Use your detailed knowledge of what ${month} is like in ${destination} — weather, local events, crowd levels, what is open or closed, seasonal highlights.
Include practical tips relevant to travellers visiting ${destination} for the first time.`;
}

// ── Main API route ────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  // Validate
  const validationError = validateInputs(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Set up SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let fullText = '';

    sendEvent({ type: 'status', message: 'Connecting to AI planner…' });

    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(req.body) }],
    });

    let charCount = 0;
    const milestones = [
      { at: 200,  msg: 'Researching your destination…' },
      { at: 600,  msg: 'Checking seasonal events & highlights…' },
      { at: 1200, msg: 'Crafting daily activities…' },
      { at: 2000, msg: 'Adding local tips & insights…' },
      { at: 3000, msg: 'Putting the finishing touches…' },
    ];

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullText += chunk.delta.text;
        charCount += chunk.delta.text.length;

        // Send milestone status messages for UX
        for (const m of milestones) {
          if (charCount >= m.at && charCount - chunk.delta.text.length < m.at) {
            sendEvent({ type: 'status', message: m.msg });
          }
        }
      }
    }

    // Parse JSON — strip any accidental markdown fences
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('The AI returned an unexpected format. Please try again.');

    const itinerary = JSON.parse(jsonMatch[0]);

    // Basic structural validation
    if (!itinerary.days || !Array.isArray(itinerary.days) || itinerary.days.length === 0) {
      throw new Error('Invalid itinerary structure received. Please try again.');
    }

    sendEvent({ type: 'done', itinerary });
    res.end();

  } catch (err) {
    console.error('Generation error:', err.message);
    const isJson = !res.headersSent;
    if (isJson) {
      res.status(500).json({ error: err.message });
    } else {
      sendEvent({ type: 'error', message: err.message || 'Something went wrong. Please try again.' });
      res.end();
    }
  }
});

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'travelnest' }));

// ── Start server ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║   🌍   TravelNest is running!           ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║   Open: http://localhost:${PORT}           ║`);
  console.log('║   Press Ctrl+C to stop                ║');
  console.log('╚═══════════════════════════════════════╝\n');
});
