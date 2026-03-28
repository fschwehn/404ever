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
const PROMPTS_DIR = path.join(__dirname, "prompts");
const promptName = process.env.AGENT_PROMPT || "default";
const promptFile = path.join(PROMPTS_DIR, `${promptName}.txt`);
if (!fs.existsSync(promptFile)) {
  throw new Error(`Prompt file not found: ${promptFile} (set AGENT_PROMPT to a name in agent/prompts/)`);
}
const SYSTEM_PROMPT = fs.readFileSync(promptFile, "utf8").trim();
console.log(`[404ever] Using prompt: ${promptName}`);

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

// ── Dev mode (DEV_MODE=true skips the AI call entirely) ──────────────────────
const DEV_MODE = process.env.DEV_MODE === "true";

let title, mood, libraries, description, html;

if (DEV_MODE) {
  console.log(`[404ever] ⚡ DEV MODE — skipping AI agent`);

  const ts = new Date().toISOString();
  title = `DEV BUILD — ${ts}`;
  mood = "debug";
  libraries = [];
  description = "Minimal test page generated without AI to verify the workflow.";
  html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>404ever · DEV</title>
<style>
  body { font-family: monospace; background: #0a0a0a; color: #0f0; margin: 0;
         display: flex; flex-direction: column; align-items: center;
         justify-content: center; min-height: 100vh; gap: 1rem; }
  h1   { font-size: 1.4rem; margin: 0; }
  .ts  { font-size: 0.85rem; opacity: 0.6; }
  a    { color: #0f0; font-size: 0.75rem; opacity: 0.4; text-decoration: none; }
  a:hover { opacity: 1; }
</style>
</head>
<body>
  <h1>⚡ DEV MODE</h1>
  <div class="ts">${ts}</div>
  <div class="ts">date: ${today}</div>
  <a href="/history.html">history</a>
</body>
</html>`;

} else {
  // ── Run the AI agent ──────────────────────────────────────────────────────
  console.log(`[404ever] Running agent for ${today}…`);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // ── Extract result from response ────────────────────────────────────────────
  const textBlock = response.content.findLast((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in response");

  console.log(`[404ever] stop_reason: ${response.stop_reason}`);

  const text = textBlock.text;

  function parseField(text, field) {
    const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : "";
  }

  title = parseField(text, "TITLE");
  mood = parseField(text, "MOOD");
  const librariesRaw = parseField(text, "LIBRARIES");
  description = parseField(text, "DESCRIPTION");
  libraries = librariesRaw === "none" ? [] : librariesRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const htmlMatch = text.match(/---BEGIN_HTML---\s*([\s\S]*?)\s*---END_HTML---/);
  if (!htmlMatch) {
    console.error("Response text:\n", text);
    throw new Error("Could not find ---BEGIN_HTML--- / ---END_HTML--- delimiters in response");
  }
  html = htmlMatch[1];

  if (!title) throw new Error("Missing TITLE in response");
  if (!html.trim().startsWith("<")) throw new Error("HTML does not look like HTML");
}

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
