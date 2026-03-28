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

Output your response using EXACTLY this format — no JSON, no code fences, just these delimiters:

TITLE: one evocative line — the name of today's version
MOOD: one word
LIBRARIES: Library1, Library2 (or "none")
DESCRIPTION: one sentence describing what this version is
---BEGIN_HTML---
<!DOCTYPE html>
...the complete HTML of the new site...
---END_HTML---

Rules for the HTML:
- Single self-contained file (inline all CSS and JS, no local asset imports)
- Must contain a small, unobtrusive link to /history.html somewhere
- CDN-hosted libraries are fine
- Never repeat an aesthetic, concept, or mood from the history log

There are no other rules. Surprise us.`;

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
Output using the delimiter format specified in your instructions.`;

// ── Run the agent ────────────────────────────────────────────────────────────
console.log(`[404ever] Running agent for ${today}…`);

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  tools: [{ type: "web_search_20250305", name: "web_search" }],
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: userMessage }],
});

// ── Extract result from response ─────────────────────────────────────────────
const textBlock = response.content.findLast((b) => b.type === "text");
if (!textBlock) throw new Error("No text block in response");

console.log(`[404ever] stop_reason: ${response.stop_reason}`);

const text = textBlock.text;

function parseField(text, field) {
  const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

const title = parseField(text, "TITLE");
const mood = parseField(text, "MOOD");
const librariesRaw = parseField(text, "LIBRARIES");
const description = parseField(text, "DESCRIPTION");
const libraries = librariesRaw === "none" ? [] : librariesRaw.split(",").map((s) => s.trim()).filter(Boolean);

const htmlMatch = text.match(/---BEGIN_HTML---\s*([\s\S]*?)\s*---END_HTML---/);
if (!htmlMatch) {
  console.error("Response text:\n", text);
  throw new Error("Could not find ---BEGIN_HTML--- / ---END_HTML--- delimiters in response");
}
const html = htmlMatch[1];

if (!title) throw new Error("Missing TITLE in response");
if (!html.trim().startsWith("<")) throw new Error("HTML does not look like HTML");

console.log(`[404ever] Title: "${title}"`);

// ── Archive old version ──────────────────────────────────────────────────────
if (fs.existsSync(INDEX_PATH)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

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
  libraries,
  description: description || "",
  commit: "", // filled in by the GitHub Action after git commit
};
history.push(entry);
fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
console.log(`[404ever] Updated history.json`);

// ── Write title file for git commit message ──────────────────────────────────
fs.writeFileSync(TITLE_PATH, title, "utf8");

console.log(`[404ever] Done. "${title}"`);
