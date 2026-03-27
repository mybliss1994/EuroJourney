// EuroJourney Server
// Single API route: POST /api/generate
// Streams Claude's response back to the browser as Server-Sent Events

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

// Load .env file manually (no extra dependency needed)
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
  // .env not found - use system environment variables
}

// Validate API key
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY || API_KEY === 'your-api-key-here') {
  console.error('\nERROR: ANTHROPIC_API_KEY is not set.');
  console.error('  1. Copy .env.example to .env');
  console.error('  2. Add your API key from https://console.anthropic.com');
  console.error('  3. Run: node server.js\n');
  process.exit(1);
}

const app = express();
const client = new Anthropic({ apiKey: API_KEY });

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory rate limiter (10 req / 60s per IP)
const rateLimits = new Map();
setInterval(() => rateLimits.clear(), 60_000);

function checkRateLimit(ip) {
  const count = (rateLimits.get(ip) || 0) + 1;
  rateLimits.set(ip, count);
  return count <= 10;
}

// Input validation
const TRAVELER_TYPES = ['solo', 'couple', 'family', 'group'];
const INTERESTS = ['culture', 'food', 'nature', 'history', 'adventure', 'art', 'relaxation', 'nightlife'];
const PACES = ['relaxed', 'moderate', 'packed'];

function validateInputs({ destination, start_date, end_date, traveler_type, interest, pace }) {
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
  return null;
}

// System prompt for Claude
const SYSTEM_PROMPT = `You are an expert European travel planner with deep knowledge of seasonal weather, local festivals, cultural events, landmarks, hidden gems, restaurants, and practical travel logistics. Tailor trips for solo travelers, couples, families, and groups.

RULES:
- Only recommend real, verifiable places
- Reflect the actual season (no beach in winter, no ski in summer)
- Mention festivals/events naturally within activities
- Tips must be practical local knowledge
- Pace: relaxed=2 activities/day, moderate=3, packed=4+

Output ONLY valid JSON (no markdown fences):
{
  "title": "Descriptive trip title",
  "destination_summary": "1-2 engaging sentences about the destination",
  "season_note": "Practical seasonal advice: weather, crowds, events, what to prepare",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_theme": "Short theme for the day",
      "morning":   { "activity": "", "description": "2-3 vivid sentences", "tip": "Practical tip", "duration": "Xh" },
      "afternoon": { "activity": "", "description": "2-3 vivid sentences", "tip": "Practical tip", "duration": "Xh" },
      "evening":   { "activity": "", "description": "2-3 vivid sentences", "tip": "Practical tip", "duration": "Xh" }
    }
  ]
}`;

function buildUserMessage({ destination, start_date, end_date, traveler_type, interest, pace }) {
  const start = new Date(start_date);
  const end = new Date(end_date);
  const numDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const month = start.toLocaleString('en-US', { month: 'long' });
  const year = start.getFullYear();
  return `Plan a ${numDays}-day trip:\nDestination: ${destination}\nDates: ${start_date} to ${end_date} (${numDays} days, ${month} ${year})\nTraveler type: ${traveler_type}\nPrimary interest: ${interest}\nPace: ${pace || 'moderate'}\nGenerate exactly ${numDays} days starting from ${start_date}.`;
}

// Main API route
app.post('/api/generate', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });

  const validationError = validateInputs(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let fullText = '';
    sendEvent({ type: 'status', message: 'Connecting to AI planner...' });

    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(req.body) }],
    });

    let charCount = 0;
    const milestones = [
      { at: 200,  msg: 'Researching your destination...' },
      { at: 600,  msg: 'Checking seasonal events & festivals...' },
      { at: 1200, msg: 'Crafting daily activities...' },
      { at: 2000, msg: 'Adding local tips & insights...' },
      { at: 3000, msg: 'Putting the finishing touches...' },
    ];

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullText += chunk.delta.text;
        charCount += chunk.delta.text.length;
        for (const m of milestones) {
          if (charCount >= m.at && charCount - chunk.delta.text.length < m.at)
            sendEvent({ type: 'status', message: m.msg });
        }
      }
    }

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Unexpected response format. Please try again.');
    const itinerary = JSON.parse(jsonMatch[0]);
    if (!itinerary.days || !Array.isArray(itinerary.days) || itinerary.days.length === 0)
      throw new Error('Invalid itinerary structure. Please try again.');

    sendEvent({ type: 'done', itinerary });
    res.end();
  } catch (err) {
    console.error('Generation error:', err.message);
    sendEvent({ type: 'error', message: err.message || 'Something went wrong. Please try again.' });
    res.end();
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'eurojourney' }));

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`\nEuroJourney running at http://localhost:${PORT}\n`);
});
