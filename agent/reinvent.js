import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// -- Paths

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "docs");
const PATHS = {
  index:   path.join(ROOT, "index.html"),
  history: path.join(ROOT, "data", "history.json"),
  posts:   path.join(ROOT, "posts"),
  title:   path.join(ROOT, ".agent_title"),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFileOr(filePath, fallback) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : fallback;
}

function parseField(text, field) {
  const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

// ── Load state ───────────────────────────────────────────────────────────────

function loadState() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "").replace(/:/g, "-");

  const history = JSON.parse(readFileOr(PATHS.history, "[]"));

  const latestEntry = history.at(-1);
  const latestPost = latestEntry
    ? readFileOr(path.join(PATHS.posts, `${latestEntry.timestamp}.html`), "(no previous post)")
    : "(no site yet — this is day one)";

  return { today, timestamp, latestPost, history };
}

function loadSystemPrompt() {
  const promptName = process.env.AGENT_PROMPT || "default";
  const promptFile = path.join(__dirname, "prompts", `${promptName}.txt`);
  if (!fs.existsSync(promptFile)) {
    throw new Error(
      `Prompt file not found: ${promptFile} (set AGENT_PROMPT to a name in agent/prompts/)`,
    );
  }
  console.log(`[404ever] Using prompt: ${promptName}`);
  return fs.readFileSync(promptFile, "utf8").trim();
}

// ── Agent ────────────────────────────────────────────────────────────────────

function buildUserMessage(today, latestPost, history) {
  return `Today is ${today}.

Here is the current site:
<current_site>
${latestPost}
</current_site>

Past versions (most recent 30):
<history>
${JSON.stringify(history.slice(-30), null, 2)}
</history>

Reinvent the site completely. Search the web if you want inspiration.
Output using the delimiter format specified in your instructions.`;
}

function parseAgentResponse(text) {
  const htmlMatch = text.match(
    /---BEGIN_HTML---\s*([\s\S]*?)\s*---END_HTML---/,
  );
  if (!htmlMatch) {
    console.error("Response text:\n", text);
    throw new Error(
      "Could not find ---BEGIN_HTML--- / ---END_HTML--- delimiters in response",
    );
  }

  const title = parseField(text, "TITLE");
  if (!title) throw new Error("Missing TITLE in response");

  const html = htmlMatch[1];
  if (!html.trim().startsWith("<"))
    throw new Error("HTML does not look like HTML");

  const librariesRaw = parseField(text, "LIBRARIES");
  return {
    title,
    mood: parseField(text, "MOOD"),
    libraries:
      librariesRaw === "none"
        ? []
        : librariesRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    description: parseField(text, "DESCRIPTION"),
    html,
  };
}

async function runAgent(systemPrompt, userMessage) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  console.log(`[404ever] stop_reason: ${response.stop_reason}`);

  const textBlock = response.content.findLast((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in response");

  return parseAgentResponse(textBlock.text);
}

function buildDevResult(today, timestamp) {
  const ts = new Date().toISOString();
  return {
    title: `DEV BUILD — ${ts}`,
    mood: "debug",
    libraries: [],
    description: "Minimal test page generated without AI to verify the workflow.",
    html: `<!DOCTYPE html>
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
  <div class="ts">post: ${timestamp}</div>
  <a href="../history.html">history</a>
</body>
</html>`,
  };
}

// ── Persist ───────────────────────────────────────────────────────────────────

function buildRedirect(timestamp) {
  const url = `./posts/${timestamp}.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${url}">
<script>window.location.replace('${url}');</script>
</head>
<body></body>
</html>`;
}

function persist(result, history, today, timestamp) {
  fs.mkdirSync(PATHS.posts, { recursive: true });
  const postPath = path.join(PATHS.posts, `${timestamp}.html`);
  fs.writeFileSync(postPath, result.html, "utf8");
  console.log(`[404ever] Wrote post ${timestamp}.html`);

  fs.writeFileSync(PATHS.index, buildRedirect(timestamp), "utf8");
  console.log(`[404ever] Updated index.html → posts/${timestamp}.html`);

  const entry = {
    date: today,
    timestamp,
    title: result.title,
    mood: result.mood || "",
    libraries: result.libraries,
    description: result.description || "",
    commit: "", // filled in by the GitHub Action after git commit
  };
  fs.mkdirSync(path.dirname(PATHS.history), { recursive: true });
  history.push(entry);
  fs.writeFileSync(PATHS.history, JSON.stringify(history, null, 2), "utf8");
  console.log(`[404ever] Updated history.json`);

  fs.writeFileSync(PATHS.title, result.title, "utf8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { today, timestamp, latestPost, history } = loadState();

const result =
  process.env.DEV_MODE === "true"
    ? (console.log(`[404ever] ⚡ DEV MODE — skipping AI agent`),
      buildDevResult(today, timestamp))
    : (console.log(`[404ever] Running agent for ${today}…`),
      await runAgent(
        loadSystemPrompt(),
        buildUserMessage(today, latestPost, history),
      ));

console.log(`[404ever] Title: "${result.title}"`);

persist(result, history, today, timestamp);

console.log(`[404ever] Done. "${result.title}"`);
