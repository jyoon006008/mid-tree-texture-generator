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

const randomPromptPartsKo = {
  tree: [
    "벚꽃이 풍성한 벚나무",
    "초록 잎이 많은 자작나무",
    "붉은 단풍나무",
    "오래된 올리브나무",
    "가느다란 수양버들",
    "일본 삼나무",
    "흰 목련나무",
    "황금빛 은행나무",
    "눈이 살짝 얹힌 소나무",
    "오래된 참나무"
  ],
  bark: [
    "밝은 회갈색 줄기에 가는 수평 균열",
    "짙은 갈색의 거친 세로 홈",
    "하얗고 매끈한 껍질에 자연스러운 검은 무늬",
    "붉은 갈색 껍질에 얇게 벗겨진 결",
    "어두운 숯빛 줄기에 홈 사이 이끼 느낌",
    "부드러운 베이지색 줄기와 섬세한 섬유질"
  ],
  leaf: [
    "하단 줄기에서 시작해 위로 자라는 초록색 잎가지",
    "이미지 하단에서 시작하는 붉은 단풍 잎 스프라이트",
    "아래쪽 줄기에서 위로 뻗는 가느다란 버들잎 가지",
    "투명 배경에 선명한 잎맥이 보이는 은녹색 잎가지",
    "하단 기부에서 시작하는 황금빛 은행잎 가지",
    "아래에서 위로 자라는 세로형 침엽수 잎가지"
  ],
  mood: [
    "차분한 VR 치유 정원",
    "따뜻하고 안전한 회복 공간",
    "조용한 숲 명상 장면",
    "몽환적인 아트 테라피 공간",
    "평화로운 노을 환경",
    "밝은 아침 회복 공간"
  ],
  style: [
    "현실적이지만 부드러운 느낌",
    "Unity PBR 소재에 어울리는 자연스러운 표현",
    "디테일이 살아있는 고해상도 에셋",
    "깨끗한 알베도 중심 스타일",
    "Unity HDRP에 어울리는 스타일",
    "만화적이지 않고 과하게 복잡하지 않은 스타일"
  ]
};

const params = new URLSearchParams(window.location.search);
const apiBase = params.get("api") || "";
const accessToken = params.get("access") || sessionStorage.getItem("midAccessToken") || "";
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
  if (Math.random() < 0.5) return buildRandomPromptKo();

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

function buildRandomPromptKo() {
  const tree = pick(randomPromptPartsKo.tree);
  const bark = pick(randomPromptPartsKo.bark);
  const leaf = pick(randomPromptPartsKo.leaf);
  const mood = pick(randomPromptPartsKo.mood);
  const style = pick(randomPromptPartsKo.style);
  return [
    `${mood}에 어울리는 ${tree}를 만들어줘.`,
    `나무 몸통 텍스처는 ${bark} 느낌이면 좋겠어.`,
    `나뭇잎 스프라이트는 ${leaf} 형태이고, 투명 배경 PNG로 이미지 하단에서 시작해야 해.`,
    `전체 방향은 ${style}이고 Unity 성장 애니메이션에 바로 쓰기 좋게 해줘.`
  ].join(" ");
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
