# 🌍 TravelNest — AI Trip Planner for Anywhere in the World

A fully working app that generates personalised, season-aware travel itineraries for **any destination on Earth** using Claude AI. No login, no database — just a Node.js server and a single-page frontend.

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

Then open **http://localhost:3000** in your browser. 🎉

---

## ✨ What's New in v2

- 🌍 **Any destination worldwide** — not just Europe
- 🗺️ **Region selector** — Europe, Asia & Pacific, The Americas, Africa, Middle East, Oceania
- 🤖 **Global-aware AI prompt** — cultural etiquette, visa tips, local transport, currency notes
- 🎨 **Refreshed UI** — new TravelNest branding and colour scheme

---

## 📁 Project Structure

```
travelnest/
├── server.js          ← Express server + Claude API integration
├── package.json       ← Dependencies (express, @anthropic-ai/sdk)
├── .env.example       ← API key template (copy to .env)
├── .env               ← Your actual API key (never commit this!)
└── public/
    └── index.html     ← Complete single-page frontend UI
```

---

## 💡 How It Works

1. User fills in trip details (destination, region, dates, traveller type, interests, pace)
2. Browser sends a `POST /api/generate` request to the Express server
3. Server calls Claude's API with a detailed, globally-aware prompt
4. Claude streams back a structured JSON itinerary (season-aware, culturally informed)
5. Server relays the stream via **Server-Sent Events (SSE)** to the browser
6. Frontend renders a beautiful day-by-day itinerary with Morning / Afternoon / Evening cards

---

## ⚙️ Configuration

| Variable           | Default | Description                          |
|--------------------|---------|--------------------------------------|
| `ANTHROPIC_API_KEY`| —       | **Required.** Your API key           |
| `PORT`             | `3000`  | Port the server listens on           |

---

## 💰 Cost Estimate

| Item               | Detail                               |
|--------------------|--------------------------------------|
| Model used         | `claude-haiku-4-5-20251001` (fastest & cheapest) |
| Cost per itinerary | ~$0.001–0.004 depending on trip length |
| Free API credits   | ~$5 for new accounts                 |

---

## 🛡️ Built-in Safeguards

- **Rate limiting**: 10 requests per IP per 60 seconds (in-memory)
- **Input validation**: All fields validated on both client and server
- **Max trip length**: 30 days
- **Health check**: `GET /health`

---

## 🌐 Deploying to Vercel (Optional)

```bash
npm install -g vercel
vercel
# Add ANTHROPIC_API_KEY in the Vercel dashboard under Settings → Environment Variables
```

---

*Built with [Claude AI](https://www.anthropic.com) · Node.js · Express · Vanilla JS*
