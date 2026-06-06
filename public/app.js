const requestText = document.querySelector("#requestText");
const recordButton = document.querySelector("#recordButton");
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
const accessToken = new URLSearchParams(window.location.search).get("access") || sessionStorage.getItem("midAccessToken") || "";
if (accessToken) sessionStorage.setItem("midAccessToken", accessToken);

init();

async function init() {
  const config = await request("/api/config");
  pathText.textContent = `저장 위치: ${config.generatedRoot}`;
  keyStatus.textContent = config.hasApiKey ? "API 준비" : "API 키 없음";
  keyStatus.classList.add(config.hasApiKey ? "ready" : "missing");
  setupSpeechRecognition();
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    recordButton.disabled = true;
    recordButton.title = "이 브라우저는 음성 인식을 지원하지 않습니다.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
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
    const base = requestText.value.replace(/\n?\[말하는 중\].*$/s, "").trim();
    requestText.value = [base, finalText, interimText ? `[말하는 중] ${interimText}` : ""]
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
  requestText.value = requestText.value.replace(/\n?\[말하는 중\].*$/s, "").trim();
  recording = true;
  recordButton.classList.add("recording");
  recognition.start();
});

refineButton.addEventListener("click", async () => {
  await withBusy(refineButton, async () => {
    const transcript = cleanTranscript(requestText.value);
    latestSpec = await request("/api/refine", { transcript });
    renderSpec(latestSpec);
    resultLog.textContent = "정리 완료";
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

    barkPreview.src = `${result.preview.bark}?t=${Date.now()}`;
    leafPreview.src = `${result.preview.leaf}?t=${Date.now()}`;
    resultLog.textContent = JSON.stringify({
      outputDir: result.outputDir,
      folderName: result.folderName,
      metadata: result.metadata
    }, null, 2);
  });
});

function renderSpec(spec) {
  summary.textContent = [
    `나무: ${spec.treeNameKo} (${spec.treeNameEn})`,
    `설명: ${spec.descriptionKo}`,
    "",
    `Bark prompt: ${spec.barkPrompt}`,
    "",
    `Leaf prompt: ${spec.leafPrompt}`
  ].join("\n");
}

function cleanTranscript(value) {
  return value.replace(/\n?\[말하는 중\].*$/s, "").trim();
}

async function request(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { "X-MID-Access-Token": accessToken } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청 실패");
  return data;
}

async function withBusy(button, task) {
  const buttons = [refineButton, generateButton, recordButton];
  try {
    buttons.forEach((item) => {
      if (item !== recordButton || !recording) item.disabled = true;
    });
    resultLog.textContent = "처리 중";
    await task();
  } catch (error) {
    resultLog.textContent = `오류: ${error.message}`;
  } finally {
    buttons.forEach((item) => {
      if (item !== recordButton || recognition) item.disabled = false;
    });
  }
}
