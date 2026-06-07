const requestText = document.querySelector("#requestText");
const recordButton = document.querySelector("#recordButton");
const speechLanguage = document.querySelector("#speechLanguage");
const randomButton = document.querySelector("#randomButton");
const refineButton = document.querySelector("#refineButton");
const generateButton = document.querySelector("#generateButton");
const summary = document.querySelector("#summary");
const resultLog = document.querySelector("#resultLog");
const pathText = document.querySelector("#pathText");
const keyStatus = document.querySelector("#keyStatus");
const barkPreview = document.querySelector("#barkPreview");
const leafPreview = document.querySelector("#leafPreview");

let recognition = null;
let recording = false;
let latestSpec = null;

const randomPromptParts = {
  tree: [
    "cherry blossom tree",
    "silver birch tree",
    "red maple tree",
    "old olive tree",
    "weeping willow tree",
    "Japanese cedar tree",
    "white magnolia tree",
    "golden ginkgo tree",
    "snow-covered pine tree",
    "ancient oak tree"
  ],
  bark: [
    "pale gray bark with fine horizontal cracks",
    "deep brown rugged bark with strong vertical ridges",
    "smooth white bark with dark natural markings",
    "warm reddish bark with subtle peeling layers",
    "dark charcoal bark with moss in the grooves",
    "soft beige bark with gentle fiber detail"
  ],
  leaf: [
    "a single green compound leaf branch rising from a thin stem at the bottom",
    "one vertical maple leaf stem with red autumn leaves starting from the bottom edge",
    "a narrow willow leaf sprig growing upward from a visible bottom stem",
    "one silver green leaf branch with clear veins and a transparent cutout shape",
    "a golden ginkgo leaf sprig with stems beginning at the bottom edge",
    "one evergreen needle branch rising vertically from the bottom"
  ],
  mood: [
    "calm VR therapy garden",
    "warm and safe healing space",
    "quiet forest meditation scene",
    "gentle dreamlike art therapy room",
    "peaceful sunset environment",
    "bright morning recovery space"
  ],
  style: [
    "realistic but slightly softened",
    "natural PBR material friendly",
    "high detail texture focused",
    "clean albedo texture style",
    "Unity HDRP friendly",
    "not cartoonish, not noisy"
  ]
};

const params = new URLSearchParams(window.location.search);
const defaultApiBase = window.location.hostname.endsWith("github.io")
  ? "https://farmer-process-harrison-telecommunications.trycloudflare.com"
  : "";
const apiBase = params.get("api") || defaultApiBase;
const defaultAccessToken = window.location.hostname.endsWith("github.io")
  ? "Qtplis2rnx1woaUGVMjDZmR3"
  : "";
const accessToken = params.get("access") || sessionStorage.getItem("midAccessToken") || defaultAccessToken;
if (accessToken) sessionStorage.setItem("midAccessToken", accessToken);

init();

async function init() {
  try {
    const config = await request("/api/config");
    pathText.textContent = config.generatedRoot
      ? `Output path: ${config.generatedRoot}`
      : "API connection ready";
    keyStatus.textContent = config.hasApiKey ? "API Ready" : "API Missing";
    keyStatus.classList.add(config.hasApiKey ? "ready" : "missing");
  } catch (error) {
    pathText.textContent = apiBase
      ? `API connection failed: ${error.message}`
      : "Static preview only. Add ?api=SERVER_URL to enable generation.";
    keyStatus.textContent = "Preview";
  }
  setupSpeechRecognition();
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    recordButton.disabled = true;
    recordButton.title = "Speech recognition is not supported in this browser.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = speechLanguage.value;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interimText += text;
    }
    const base = requestText.value.replace(/\n?\[Speaking\].*$/s, "").trim();
    requestText.value = [base, finalText, interimText ? `[Speaking] ${interimText}` : ""]
      .filter(Boolean)
      .join("\n");
  };

  recognition.onend = () => {
    recording = false;
    recordButton.classList.remove("recording");
  };
}

recordButton.addEventListener("click", () => {
  if (!recognition) return;
  if (recording) {
    recognition.stop();
    return;
  }
  requestText.value = requestText.value.replace(/\n?\[Speaking\].*$/s, "").trim();
  recognition.lang = speechLanguage.value;
  recording = true;
  recordButton.classList.add("recording");
  recognition.start();
});

speechLanguage.addEventListener("change", () => {
  if (recognition && recording) {
    recognition.stop();
  }
});

randomButton.addEventListener("click", () => {
  requestText.value = buildRandomPrompt();
  latestSpec = null;
  summary.textContent = "Random prompt inserted. Refine or generate assets next.";
  resultLog.textContent = "Ready";
});

refineButton.addEventListener("click", async () => {
  await withBusy(refineButton, async () => {
    const transcript = cleanTranscript(requestText.value);
    latestSpec = await request("/api/refine", { transcript });
    renderSpec(latestSpec);
    resultLog.textContent = "Refined.";
  });
});

generateButton.addEventListener("click", async () => {
  await withBusy(generateButton, async () => {
    if (!latestSpec) {
      const transcript = cleanTranscript(requestText.value);
      latestSpec = await request("/api/refine", { transcript });
      renderSpec(latestSpec);
    }

    const result = await request("/api/generate", {
      ...latestSpec,
      sourceRequest: cleanTranscript(requestText.value)
    });

    barkPreview.src = `${apiBase}${result.preview.bark}?t=${Date.now()}`;
    leafPreview.src = `${apiBase}${result.preview.leaf}?t=${Date.now()}`;
    resultLog.textContent = JSON.stringify({
      outputDir: result.outputDir,
      folderName: result.folderName,
      metadata: result.metadata
    }, null, 2);
  });
});

function renderSpec(spec) {
  summary.textContent = [
    `Tree: ${spec.treeNameKo} (${spec.treeNameEn})`,
    `Description: ${spec.descriptionKo}`,
    "",
    `Bark prompt: ${spec.barkPrompt}`,
    "",
    `Leaf prompt: ${spec.leafPrompt}`
  ].join("\n");
}

function cleanTranscript(value) {
  return value.replace(/\n?\[Speaking\].*$/s, "").trim();
}

async function request(url, body) {
  const response = await fetch(`${apiBase}${url}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { "X-MID-Access-Token": accessToken } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function buildRandomPrompt() {
  const tree = pick(randomPromptParts.tree);
  const bark = pick(randomPromptParts.bark);
  const leaf = pick(randomPromptParts.leaf);
  const mood = pick(randomPromptParts.mood);
  const style = pick(randomPromptParts.style);
  return [
    `Create a ${tree} for a ${mood}.`,
    `Bark texture: ${bark}.`,
    `Leaf sprite: ${leaf}, isolated on a transparent background, base aligned to the bottom edge.`,
    `Visual direction: ${style}, suitable for a growing tree animation in Unity.`
  ].join(" ");
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function withBusy(button, task) {
  const buttons = [randomButton, refineButton, generateButton, recordButton];
  try {
    buttons.forEach((item) => {
      if (item !== recordButton || !recording) item.disabled = true;
    });
    resultLog.textContent = "Processing...";
    await task();
  } catch (error) {
    resultLog.textContent = `Error: ${error.message}`;
  } finally {
    buttons.forEach((item) => {
      if (item !== recordButton || recognition) item.disabled = false;
    });
  }
}
