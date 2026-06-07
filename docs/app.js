const requestText = document.querySelector("#requestText");
const recordButton = document.querySelector("#recordButton");
const randomButton = document.querySelector("#randomButton");
const refineButton = document.querySelector("#refineButton");
const generateButton = document.querySelector("#generateButton");
const summary = document.querySelector("#summary");
const resultLog = document.querySelector("#resultLog");
const pathText = document.querySelector("#pathText");
const keyStatus = document.querySelector("#keyStatus");
const barkPreview = document.querySelector("#barkPreview");
const leafPreview = document.querySelector("#leafPreview");

let recognizers = [];
let recording = false;
let latestSpec = null;
let activeSpeechTexts = new Map();
let activeRecognizerIndex = 0;
let recognitionSwitchTimer = null;

const randomVisitorPrompts = [
  "A warm cherry blossom tree that feels safe and soft.",
  "An old oak tree that looks calm, strong, and protective.",
  "A quiet willow tree with long leaves, like a peaceful resting place.",
  "A bright ginkgo tree that feels hopeful and warm.",
  "A dark pine tree with a deep forest mood.",
  "A silver birch tree that feels clean, light, and gentle.",
  "A red maple tree that feels emotional but comforting.",
  "A white magnolia tree with a soft and dreamlike mood.",
  "\uB530\uB73B\uD558\uACE0 \uC548\uC804\uD55C \uB290\uB08C\uC758 \uBC9A\uB098\uBB34\uB97C \uB9CC\uB4E4\uC5B4\uC918.",
  "\uC870\uC6A9\uD558\uACE0 \uB2E8\uB2E8\uD55C \uB290\uB08C\uC758 \uC624\uB798\uB41C \uCC38\uB098\uBB34\uAC00 \uC88B\uC544.",
  "\uD3B8\uC548\uD558\uAC8C \uC26C\uACE0 \uC2F6\uC740 \uB290\uB08C\uC758 \uC218\uC591\uBC84\uB4E4\uC744 \uC6D0\uD574.",
  "\uD76C\uB9DD\uC801\uC774\uACE0 \uBC1D\uC740 \uC740\uD589\uB098\uBB34\uB97C \uB9CC\uB4E4\uC5B4\uC918.",
  "\uAE4A\uC740 \uC232\uC18D\uCC98\uB7FC \uCC28\uBD84\uD55C \uC18C\uB098\uBB34\uB97C \uBCF4\uACE0 \uC2F6\uC5B4.",
  "\uAE68\uB057\uD558\uACE0 \uBD80\uB4DC\uB7EC\uC6B4 \uC790\uC791\uB098\uBB34 \uB290\uB08C\uC774\uBA74 \uC88B\uACA0\uC5B4.",
  "\uBD89\uC740 \uB2E8\uD48D\uB098\uBB34\uCC98\uB7FC \uAC10\uC131\uC801\uC774\uC9C0\uB9CC \uD3EC\uADFC\uD55C \uB290\uB08C.",
  "\uD558\uC580 \uBAA9\uB828\uB098\uBB34\uCC98\uB7FC \uBD80\uB4DC\uB7FD\uACE0 \uBABD\uD658\uC801\uC778 \uB098\uBB34."
];

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

  recognizers = ["ko-KR", "en-US"].map((language) => createRecognizer(SpeechRecognition, language));
}

recordButton.addEventListener("click", () => {
  if (!recognizers.length) return;
  if (recording) {
    stopRecognizers();
    return;
  }
  requestText.value = requestText.value.replace(/\n?\[Speaking\].*$/s, "").trim();
  activeSpeechTexts = new Map();
  recording = true;
  recordButton.classList.add("recording");
  resultLog.textContent = "Listening. Korean and English are detected automatically.";
  startActiveRecognizer();
  recognitionSwitchTimer = window.setInterval(switchRecognizer, 6000);
});

randomButton.addEventListener("click", () => {
  requestText.value = pick(randomVisitorPrompts);
  latestSpec = null;
  summary.textContent = "Random visitor-style request inserted.";
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

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createRecognizer(SpeechRecognition, language) {
  const recognizer = new SpeechRecognition();
  recognizer.lang = language;
  recognizer.continuous = true;
  recognizer.interimResults = true;

  recognizer.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interimText += text;
    }

    const current = activeSpeechTexts.get(language) || { final: "", interim: "" };
    activeSpeechTexts.set(language, {
      final: [current.final, finalText].filter(Boolean).join(" ").trim(),
      interim: interimText.trim()
    });
    renderBestSpeechText();
  };

  recognizer.onend = () => {
    recognizer.active = false;
    if (recording && recognizers[activeRecognizerIndex] === recognizer) {
      startActiveRecognizer();
    }
  };

  recognizer.onerror = () => {
    recognizer.active = false;
  };

  const originalStart = recognizer.start.bind(recognizer);
  recognizer.start = () => {
    recognizer.active = true;
    originalStart();
  };

  return recognizer;
}

function renderBestSpeechText() {
  const base = requestText.value.replace(/\n?\[Speaking\].*$/s, "").trim();
  const candidates = Array.from(activeSpeechTexts.values()).map(({ final, interim }) => ({
    final,
    interim,
    score: final.length * 2 + interim.length
  }));
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return;
  requestText.value = [base, best.final, best.interim ? `[Speaking] ${best.interim}` : ""]
    .filter(Boolean)
    .join("\n");
}

function stopRecognizers() {
  if (recognitionSwitchTimer) {
    window.clearInterval(recognitionSwitchTimer);
    recognitionSwitchTimer = null;
  }
  for (const recognizer of recognizers) {
    try {
      recognizer.stop();
    } catch {}
    recognizer.active = false;
  }
  recording = false;
  recordButton.classList.remove("recording");
}

function startActiveRecognizer() {
  const recognizer = recognizers[activeRecognizerIndex];
  if (!recognizer || recognizer.active) return;
  try {
    recognizer.start();
  } catch {}
}

function switchRecognizer() {
  if (!recording || recognizers.length < 2) return;
  const current = recognizers[activeRecognizerIndex];
  activeRecognizerIndex = (activeRecognizerIndex + 1) % recognizers.length;
  try {
    current.stop();
  } catch {}
  window.setTimeout(startActiveRecognizer, 250);
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
      if (item !== recordButton || recognizers.length) item.disabled = false;
    });
  }
}
