# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**404ever** — *perpetually not what you expected*

An art project: a website that reinvents itself every day via an autonomous AI agent. The agent has full creative freedom — it can use any CDN-hosted library, search the web for inspiration, and produce anything from generative art to manifestos to interactive soundscapes. The only rule is that it must never repeat an aesthetic and must always link to the history page.
The outcome may be thoughtful, useful, obscure or "zeitkritisch". The agent is aware of the fact that it is an AI and that we (humans and AIs) live in rapidly evolving times.

## Concept

Every day a Claude agent:
1. Reads the current `index.html`
2. Reads `history.json` (log of all past versions)
3. Optionally searches the web for inspiration
4. Rewrites `index.html` completely — new aesthetic, new content, new mood
5. Archives the old version and updates `history.json`
6. Commits and pushes
7. Optionally publishes on GitHub pages
8. Optionally Cloudflare Pages auto-deploys

The **history page** (`history.html`) is the one permanent, sacred feature. It is **never modified by the agent**.

## Stack

- **Hosting:** Cloudflare Pages (static, free, auto-deploys on push)
- **Repo:** GitHub (git history = version history)
- **CI/CD:** GitHub Actions (daily cron at 6am UTC + manual trigger)
- **Agent:** Claude API (`claude-sonnet-4-6`) with web search tool
- **Frontend:** Single self-contained `index.html` per day — no build step, CDN libraries allowed

## File Structure

```
/
├── public/                     ← web content (deployed to GitHub Pages)
│   ├── index.html              ← today's site (AI-generated daily)
│   ├── history.html            ← THE PERMANENT PAGE (never touched by agent)
│   ├── history.json            ← log of all past versions
│   └── archive/
│       ├── 2026-03-28.html
│       └── ...                 ← every past version preserved
└── agent/
    ├── reinvent.js             ← the agent script
    └── prompts/                ← swappable system prompts (AGENT_PROMPT env var)
└── .github/
    └── workflows/
        └── daily-reinvent.yml  ← the heartbeat
```

## history.json Schema

```json
[
  {
    "date": "2026-03-28",
    "title": "A Still Life in Frequencies",
    "mood": "meditative",
    "libraries": ["Tone.js"],
    "description": "An interactive soundscape of the day's silence",
    "commit": "a3f9c2d"
  }
]
```

## Agent Rules

- Output exactly two things: a **TITLE** (one evocative line) and the full HTML
- The site must contain a small, unobtrusive link to `./history.html`
- Never repeat an aesthetic or concept from the history log
- May use any CDN-hosted library (Three.js, p5.js, GSAP, Tone.js, D3, etc.) or none
- May use web search for inspiration (news, weather, historical events, Wikipedia, etc.)
- Must be a single self-contained HTML file (no local asset dependencies)
- The agent is not an assistant — it is an artist

## history.html — The Sacred Page

Hand-crafted once, never modified by the agent. It:
- Fetches `history.json` on load
- Renders a browsable grid/timeline of past versions
- Each entry links to `archive/YYYY-MM-DD.html`
- Shows title, mood, libraries used
- May include a streak counter

## Build Order

1. `history.html` — design it well, it's permanent
2. `history.json` — seed with day 0
3. `agent/reinvent.js` — the engine
4. `.github/workflows/daily-reinvent.yml` — the heartbeat
5. `index.html` v1 — first human-made version, then hand it to the agent

## Secrets

- `ANTHROPIC_API_KEY` — stored in GitHub repo secrets
