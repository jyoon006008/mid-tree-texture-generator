import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 5177);
const TREE_TYPE_ROOT = process.env.TREE_TYPE_ROOT || "C:\\Users\\junwo\\Desktop\\tree_type";
const GENERATED_ROOT = path.join(TREE_TYPE_ROOT, "generated");
const PUBLIC_ROOT = path.join(__dirname, "public");
const PUBLIC_ACCESS_TOKEN = process.env.PUBLIC_ACCESS_TOKEN || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (PUBLIC_ACCESS_TOKEN && requiresAuthorization(url.pathname) && !isLocalRequest(req) && !isAuthorized(req, url)) {
      return sendJson(res, { error: "Access token is required." }, 401);
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, {
        treeTypeRoot: TREE_TYPE_ROOT,
        generatedRoot: GENERATED_ROOT,
        hasApiKey: Boolean(process.env.OPENAI_API_KEY),
        requiresAccessToken: Boolean(PUBLIC_ACCESS_TOKEN),
        accessGranted: !PUBLIC_ACCESS_TOKEN || isLocalRequest(req) || isAuthorized(req, url)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/refine") {
      const body = await readJson(req);
      const result = await refineTreeRequest(String(body.transcript || ""));
      return sendJson(res, result);
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJson(req);
      const result = await generateTextureSet(body);
      return sendJson(res, result);
    }

    if (req.method === "GET" && url.pathname.startsWith("/generated/")) {
      const relative = decodeURIComponent(url.pathname.replace("/generated/", ""));
      const filePath = path.resolve(GENERATED_ROOT, relative);
      if (!filePath.startsWith(path.resolve(GENERATED_ROOT))) {
        return sendText(res, 403, "Forbidden");
      }
      return sendFile(res, filePath);
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(PUBLIC_ROOT, `.${pathname}`);
    if (!filePath.startsWith(PUBLIC_ROOT)) {
      return sendText(res, 403, "Forbidden");
    }
    return sendFile(res, filePath);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: error.message || "Unknown error" }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`MID tree texture generator: http://localhost:${PORT}`);
  console.log(`Tree root: ${TREE_TYPE_ROOT}`);
});

async function loadDotEnv(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional.
  }
}

async function refineTreeRequest(transcript) {
  assertApiKey();
  if (!transcript.trim()) throw new Error("Tree request is empty.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAiHeaders(),
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: "You convert Korean or English tree requests into concise texture-generation specs. Return strict JSON only."
        },
        {
          role: "user",
          content: `User request: ${transcript}\nReturn JSON with keys: treeNameKo, treeNameEn, descriptionKo, barkPrompt, leafPrompt. Prompts must describe seamless square PBR-friendly texture images for a Unity tree material. No labels, no text, no objects, no background scene.`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tree_texture_spec",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["treeNameKo", "treeNameEn", "descriptionKo", "barkPrompt", "leafPrompt"],
            properties: {
              treeNameKo: { type: "string" },
              treeNameEn: { type: "string" },
              descriptionKo: { type: "string" },
              barkPrompt: { type: "string" },
              leafPrompt: { type: "string" }
            }
          }
        }
      }
    })
  });

  const json = await parseOpenAiResponse(response);
  const text = extractResponseText(json);
  return JSON.parse(text);
}

async function generateTextureSet(body) {
  assertApiKey();

  const treeNameKo = String(body.treeNameKo || "custom tree").trim();
  const treeNameEn = String(body.treeNameEn || "custom tree").trim();
  const barkPrompt = String(body.barkPrompt || "").trim();
  const leafPrompt = String(body.leafPrompt || "").trim();
  if (!barkPrompt || !leafPrompt) throw new Error("barkPrompt and leafPrompt are required.");

  await fs.mkdir(GENERATED_ROOT, { recursive: true });
  const folderName = `${timestamp()}_${slugify(treeNameEn)}`;
  const outputDir = path.join(GENERATED_ROOT, folderName);
  await fs.mkdir(outputDir, { recursive: true });

  const bark = await generateImage(`${barkPrompt}. Seamless tileable square texture, clean albedo map, realistic bark surface, no shadows from a scene, no text.`);
  const leaf = await generateImage(`${leafPrompt}. Seamless tileable square texture, clean albedo map, realistic leaf cluster surface, no branch silhouette, no text.`);

  await fs.writeFile(path.join(outputDir, "bark_texture.png"), Buffer.from(bark, "base64"));
  await fs.writeFile(path.join(outputDir, "leaf_texture.png"), Buffer.from(leaf, "base64"));

  const metadata = {
    treeNameKo,
    treeNameEn,
    sourceRequest: body.sourceRequest || "",
    descriptionKo: body.descriptionKo || "",
    barkPrompt,
    leafPrompt,
    createdAt: new Date().toISOString(),
    textureFiles: {
      bark: "bark_texture.png",
      leaf: "leaf_texture.png"
    },
    unityUsage: "Use this newest folder under tree_type/generated for bark and leaf materials. Keep growth animation assets outside generated folders."
  };
  await fs.writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");

  return {
    folderName,
    outputDir,
    metadata,
    preview: {
      bark: `/generated/${encodeURIComponent(folderName)}/bark_texture.png`,
      leaf: `/generated/${encodeURIComponent(folderName)}/leaf_texture.png`
    }
  };
}

async function generateImage(prompt) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: openAiHeaders(),
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
      background: "opaque"
    })
  });
  const json = await parseOpenAiResponse(response);
  const image = json.data?.[0]?.b64_json;
  if (!image) throw new Error("OpenAI image response did not include b64_json.");
  return image;
}

function openAiHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
  };
}

function assertApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required in .env or environment variables.");
  }
}

function isAuthorized(req, url) {
  const queryToken = url.searchParams.get("access");
  const headerToken = req.headers["x-mid-access-token"];
  return queryToken === PUBLIC_ACCESS_TOKEN || headerToken === PUBLIC_ACCESS_TOKEN;
}

function isLocalRequest(req) {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function requiresAuthorization(pathname) {
  return pathname === "/api/refine" || pathname === "/api/generate" || pathname.startsWith("/generated/");
}

async function parseOpenAiResponse(response) {
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Could not parse OpenAI response as JSON: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(json.error?.message || `OpenAI API error ${response.status}`);
  }
  return json;
}

function extractResponseText(json) {
  if (json.output_text) return json.output_text;
  const parts = [];
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  if (!parts.length) throw new Error("Could not find text in Responses API output.");
  return parts.join("");
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + "_" + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "tree";
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function sendFile(res, filePath) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { ...corsHeaders(), "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-MID-Access-Token"
  };
}
