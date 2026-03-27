# 🗺️ EuroJourney — AI-Powered Europe Travel Planner

A fully working prototype that generates personalised, season-aware European travel itineraries using Claude AI. No login, no database — just a simple Node.js server and a beautiful single-page frontend.

---

## ✅ Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org)
- **An Anthropic API key** — [Get one free at console.anthropic.com](https://console.anthropic.com)

---

## 🚀 Quick Start (3 steps)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Add your API key
```bash
# Copy the example config
cp .env.example .env

# Open .env and replace 'your-api-key-here' with your real key:
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Step 3 — Start the server
```bash
node server.js
```

Then open **http://localhost:3000** in your browser.

---

## 📁 Project Structure

```
eurojourney/
+-- server.js
+-- package.json
+-- .env.example
+-- .env
+-- public/
    +-- index.html
```

---

## 💡 How It Works

1. User fills in trip details (destination, dates, traveler type, interests, pace)
2. Browser sends a POST /api/generate request to the Express server
3. Server calls Claude's API with a detailed prompt
4. Claude streams back a structured JSON itinerary (season-aware, culturally informed)
5. Server relays the stream via Server-Sent Events (SSE) to the browser
6. Frontend renders a beautiful day-by-day itinerary with morning/afternoon/evening cards

---

## Cost Estimate

- Model: claude-haiku-4-5-20251001 (fastest & cheapest)
- Cost per itinerary: ~$0.013
- Free API credits: ~$5 for new accounts (~385 itineraries)

---

## Built-in Safeguards

- Rate limiting: 10 requests per IP per 60 seconds
- Input validation on client and server
- Max trip length: 30 days
- Health check: GET /health

---

## Deploying to Vercel

```bash
npm install -g vercel
vercel
```
Add ANTHROPIC_API_KEY in the Vercel dashboard.

---

## Getting Your API Key

1. Go to console.anthropic.com
2. Sign up (new accounts get ~$5 free credit)
3. Navigate to API Keys > Create Key
4. Paste into your .env file

---

*Built with Claude AI, Node.js, Express, Vanilla JS*
