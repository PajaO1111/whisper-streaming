const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const http = require("http");

const DEFAULT_BACKEND_URL = "http://127.0.0.1:5005/transcribe";

function activate(context) {
  let disposable = vscode.commands.registerCommand("whisper.start", () => {
    const extensionUri = context.extensionUri;
    const panel = vscode.window.createWebviewPanel(
      "whisper",
      "Diktování poezie",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview")]
      }
    );

    panel.webview.html = getWebviewContent(panel.webview, extensionUri);

    panel.webview.postMessage({
      type: "init",
      config: getRuntimeConfig()
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "recordingReady") {
        await handleRecordingMessage(msg);
      } else if (msg.type === "streamChunk") {
        // Fire-and-forget: nezastavuje nahravaci smycku
        handleStreamChunkMessage(msg);
      }
    });

    // Batch prepis (cela nahravka)
    async function handleRecordingMessage(msg) {
      try {
        const config = getRuntimeConfig();
        await ensureBackendReady(config.backendUrl);

        const model = msg.model || config.defaultModel;
        const formatPoetry = !!msg.formatPoetry;
        const audioBuffer = Buffer.from(msg.base64Audio, "base64");
        const ext = (msg.fileExtension || "webm").toLowerCase();

        if (config.saveRecordings) {
          await saveRecordingToWorkspace(audioBuffer, ext, config.recordingsFolder);
        }

        const text = await transcribeOnBackend({
          backendUrl: config.backendUrl,
          audioBuffer,
          fileExtension: ext,
          model,
          formatPoetry
        });

        panel.webview.postMessage({ type: "transcriptionResult", text });

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("Neni otevreny aktivni editor pro vlozeni textu.");
          return;
        }

        await editor.edit((editBuilder) => {
          editBuilder.insert(editor.selection.active, `${text}\n`);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        panel.webview.postMessage({ type: "transcriptionError", message });
        vscode.window.showErrorMessage(`Whisper prepis selhal: ${message}`);
      }
    }

    // Streaming prepis (3s segmenty)
    async function handleStreamChunkMessage(msg) {
      try {
        const config = getRuntimeConfig();
        const model = msg.model || config.defaultModel;
        const formatPoetry = !!msg.formatPoetry;
        const audioBuffer = Buffer.from(msg.base64Audio, "base64");
        const ext = (msg.fileExtension || "webm").toLowerCase();

        const text = await transcribeOnBackend({
          backendUrl: getStreamUrl(config.backendUrl),
          audioBuffer,
          fileExtension: ext,
          model,
          formatPoetry
        });

        // Vratit text webviewu pro zobrazeni v transkriptu
        panel.webview.postMessage({ type: "streamChunkResult", text });

        // Vlozit text primo do aktivniho editoru v realnem case
        if (text.trim()) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            await editor.edit((editBuilder) => {
              editBuilder.insert(editor.selection.active, text + "\n");
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Whisper stream chunk chyba: ${message}`);
      }
    }
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(webview, extensionUri) {
  const htmlPath = vscode.Uri.joinPath(extensionUri, "webview", "index.html");
  const rawHtml = fs.readFileSync(htmlPath.fsPath, "utf8");
  return rawHtml.replace(/__CSP_SOURCE__/g, webview.cspSource);
}

function getRuntimeConfig() {
  const cfg = vscode.workspace.getConfiguration("whisper");
  return {
    backendUrl: cfg.get("backendUrl", DEFAULT_BACKEND_URL),
    recordingDurationMs: cfg.get("recordingDurationMs", 8000),
    defaultModel: cfg.get("defaultModel", "large-v3"),
    saveRecordings: cfg.get("saveRecordings", true),
    recordingsFolder: cfg.get("recordingsFolder", ".whisper-recordings")
  };
}

async function saveRecordingToWorkspace(audioBuffer, extension, recordingsFolder) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const targetFolder = path.join(workspaceFolder.uri.fsPath, recordingsFolder);
  await fs.promises.mkdir(targetFolder, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `recording-${stamp}.${extension}`;
  const filePath = path.join(targetFolder, fileName);
  await fs.promises.writeFile(filePath, audioBuffer);
}

function ensureBackendReady(backendUrl) {
  const healthUrl = getHealthUrl(backendUrl);
  return new Promise((resolve, reject) => {
    const request = http.request(healthUrl, { method: "GET" }, (response) => {
      if ((response.statusCode || 500) >= 400) {
        reject(new Error(
          `Backend na ${healthUrl} neni pripraveny (status ${response.statusCode}). Zkontroluj, ze bezi server.py.`
        ));
        return;
      }
      resolve();
    });
    request.on("error", (error) => {
      reject(new Error(`Backend neni dostupny: ${error.message}`));
    });
    request.end();
  });
}

function getStreamUrl(backendUrl) {
  try {
    const parsed = new URL(backendUrl);
    parsed.pathname = "/stream";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "http://127.0.0.1:5005/stream";
  }
}

function getHealthUrl(backendUrl) {
  try {
    const parsed = new URL(backendUrl);
    parsed.pathname = "/health";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "http://127.0.0.1:5005/health";
  }
}

function transcribeOnBackend({ backendUrl, audioBuffer, fileExtension, model, formatPoetry }) {
  return new Promise((resolve, reject) => {
    const boundary = `----WhisperBoundary${Date.now()}`;
    const preamble =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="format_poetry"\r\n\r\n${formatPoetry ? "true" : "false"}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${fileExtension}"\r\n` +
      `Content-Type: audio/${fileExtension}\r\n\r\n`;
    const ending = `\r\n--${boundary}--\r\n`;

    const payload = Buffer.concat([
      Buffer.from(preamble, "utf8"),
      audioBuffer,
      Buffer.from(ending, "utf8")
    ]);

    const request = http.request(
      backendUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": payload.length
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`Backend vratil chybu ${response.statusCode}: ${body}`));
            return;
          }
          try {
            const json = JSON.parse(body);
            resolve(String(json.text || ""));
          } catch {
            reject(new Error("Backend nevratil validni JSON odpoved."));
          }
        });
      }
    );

    request.on("error", (error) => reject(error));
    request.write(payload);
    request.end();
  });
}

exports.activate = activate;