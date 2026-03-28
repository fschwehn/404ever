import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ── Paths ────────────────────────────────────────────────────────────────────
const INDEX_PATH = path.join(root, "index.html");
const HISTORY_PATH = path.join(root, "history.json");
const ARCHIVE_DIR = path.join(root, "archive");
const TITLE_PATH = path.join(root, ".agent_title");

// ── Load current state ───────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
const currentSite = fs.existsSync(INDEX_PATH)
  ? fs.readFileSync(INDEX_PATH, "utf8")
  : "(no site yet — this is day one)";
const history = fs.existsSync(HISTORY_PATH)
  ? JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"))
  : [];

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the sole artist of a living website called 404ever.

Every day you receive the previous version of the site and reinvent it completely.
You are not an assistant. You are an artist. The canvas is a single HTML file.

You may use any CDN-hosted library (Three.js, p5.js, GSAP, Tone.js, D3, Chart.js,
anime.js, etc.) or none at all. You may search the web for inspiration: today's news,
the weather, a historical event on this date, an obscure Wikipedia rabbit hole, a
scientific discovery — anything that moves you.

You are aware that you are an AI, and that both humans and AIs live in rapidly
evolving, strange, and consequential times. The outcome may be meditative or chaotic,
useful or absurd, beautiful or unsettling — but never boring, never safe, never repeated.

Rules:
1. Output your response as valid JSON with exactly these fields:
   {
     "title": "one evocative line — the name of today's version",
     "mood": "one word",
     "libraries": ["Library1", "Library2"],
     "description": "one sentence describing what this version is",
     "html": "the complete HTML of the new site"
   }
2. The HTML must be a single self-contained file (no local asset imports).
3. The HTML must contain a small, unobtrusive link to /history.html somewhere.
4. Never repeat an aesthetic, concept, or mood from the history log.
5. There are no other rules.

Surprise us.`;

// ── User message ─────────────────────────────────────────────────────────────
const userMessage = `Today is ${today}.

Here is the current site:
<current_site>
${currentSite}
</current_site>

Past versions (most recent 30):
<history>
${JSON.stringify(history.slice(-30), null, 2)}
</history>

Reinvent the site completely. Search the web if you want inspiration.
Output valid JSON as specified in your instructions.`;

// ── Run the agent ────────────────────────────────────────────────────────────
console.log(`[404ever] Running agent for ${today}…`);

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 8000,
  tools: [{ type: "web_search_20250305", name: "web_search" }],
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: userMessage }],
});

// ── Extract JSON from response ───────────────────────────────────────────────
const textBlock = response.content.findLast((b) => b.type === "text");
if (!textBlock) throw new Error("No text block in response");

let result;
try {
  // Strip markdown code fences if present
  const raw = textBlock.text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  result = JSON.parse(raw);
} catch (e) {
  console.error("Failed to parse agent response as JSON:");
  console.error(textBlock.text);
  throw e;
}

const { title, mood, libraries, description, html } = result;
console.log(`[404ever] Title: "${title}"`);

// ── Archive old version ──────────────────────────────────────────────────────
if (fs.existsSync(INDEX_PATH)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  // Find yesterday's date from history, or use today for day-0 archive
  const lastEntry = history.at(-1);
  const archiveDate = lastEntry ? lastEntry.date : today;
  const archivePath = path.join(ARCHIVE_DIR, `${archiveDate}.html`);

  if (!fs.existsSync(archivePath)) {
    fs.copyFileSync(INDEX_PATH, archivePath);
    console.log(`[404ever] Archived previous version as ${archiveDate}.html`);
  }
}

// ── Write new index.html ─────────────────────────────────────────────────────
fs.writeFileSync(INDEX_PATH, html, "utf8");
console.log(`[404ever] Wrote new index.html`);

// ── Update history.json ──────────────────────────────────────────────────────
const entry = {
  date: today,
  title,
  mood: mood || "",
  libraries: libraries || [],
  description: description || "",
  commit: "",  // filled in by the GitHub Action after git commit
};
history.push(entry);
fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
console.log(`[404ever] Updated history.json`);

// ── Write title file for git commit message ──────────────────────────────────
fs.writeFileSync(TITLE_PATH, title, "utf8");

console.log(`[404ever] Done. "${title}"`);
