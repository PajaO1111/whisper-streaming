# Whisper přepis mluveného slova na text


# Whisper Streaming – Realtime Czech Speech‑to‑Text (FastAPI + Faster‑Whisper + VS Code Extension)

![Header](docs/header.png)  
*(placeholder – vlož vlastní obrázek)*

Whisper Streaming je lokální nástroj pro **přepis mluveného slova do textu v reálném čase**, optimalizovaný pro **češtinu**, **poezii** a **rychlou práci v editoru**.  
Projekt kombinuje:

- **Faster‑Whisper (large‑v3)** – extrémně rychlý GPU přepis  
- **FastAPI backend** – lokální REST API + streaming endpoint  
- **VS Code Extension** – nahrávání mikrofonu a živé vkládání textu do editoru  
- **Streaming audio chunks (250–500 ms)** – realtime přepis bez čekání  

Celý systém běží **lokálně**, bez cloudu, bez odesílání dat mimo počítač.

---

## ✨ Funkce

- 🎤 **Živý přepis hlasu** (streaming, žádné čekání na konec nahrávání)
- ⚡ **GPU akcelerace** (CUDA 12.1, PyTorch)
- 🧠 **Whisper large‑v3** – nejlepší model pro češtinu
- 📝 **Automatické vkládání textu do VS Code editoru**
- 📐 **Optimalizace pro poezii** (pauzy → verše)
- 🌐 **FastAPI backend** (REST + streaming endpoint)
- 🔒 **100% lokální běh** – žádná data neopouštějí počítač
- 🧩 **Modulární architektura** – backend + extension

---

## 📦 Architektura

![Architecture](docs/architecture.png)  
*(placeholder – vlož vlastní obrázek)*

### **1) VS Code Extension**
- nahrává mikrofon pomocí `MediaRecorder`
- každých 250–500 ms odesílá audio chunk
- přijímá text a vkládá ho do editoru

### **2) FastAPI Backend**
- endpoint `/stream` pro realtime přepis
- endpoint `/transcribe` pro celé soubory
- běží na `http://127.0.0.1:5005`

### **3) Faster‑Whisper**
- model: `large-v3`
- běží na GPU (`float16`)
- extrémně rychlý přepis i pro dlouhé věty

---

## 🚀 Instalace

### 1) Klonování repozitáře

```bash
git clone https://github.com/PajaO1111/whisper-streaming.git
cd whisper-streaming

Lokální backend pro přepis češtiny pomocí `faster-whisper` + jednoduché VS Code rozšíření pro diktování textu.

## Co projekt obsahuje

- `server.py` - FastAPI server s endpointy:
  - `GET /` - základní info o službě
  - `GET /health` - health check
  - `POST /transcribe` - dávkový přepis nahrávky
  - `POST /stream` - přepis krátkých audio segmentů (stream)
- `start.bat` - spuštění serveru na Windows (preferuje `.venv`/`venv`, jinak systémový Python)
- `test_api.py` - základní API testy (`/`, `/health`, `/favicon.ico`)
- `test_model.py`, `test_whisper.py` - jednoduchý test načtení Whisper modelu
- `my-whisper-extension/` - VS Code extension pro diktování a odeslání audia na backend

## Požadavky

- Python 3.10+
- FFmpeg v `PATH`
- Doporučeno: NVIDIA GPU + CUDA (jinak běží na CPU)

## Instalace backendu

```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install fastapi uvicorn faster-whisper python-multipart
```

Poznámka: Pro GPU inferenci je potřeba mít správně nainstalovaný `torch` pro vaši CUDA verzi.

## Spuštění serveru

### Windows (doporučeno)

```bat
start.bat
```

Server běží na:

- `http://127.0.0.1:5005`
- Health check: `http://127.0.0.1:5005/health`

### Ručně

```bash
python server.py
```

## Rychlý test API

```bash
curl -X GET http://127.0.0.1:5005/health
```

Přepis audia (`.webm`, `.wav`, ...):

```bash
curl -X POST http://127.0.0.1:5005/transcribe \
  -F "file=@sample.webm" \
  -F "model=large-v3" \
  -F "format_poetry=true"
```

## Spuštění testů

```bash
python -m unittest test_api.py
```

Volitelné testy načtení modelu:

```bash
python test_whisper.py
python test_model.py
```

## VS Code extension

Rozšíření je ve složce `my-whisper-extension`.

Základní konfigurace v `my-whisper-extension/package.json`:

- `whisper.backendUrl` (default: `http://127.0.0.1:5005/transcribe`)
- `whisper.recordingDurationMs`
- `whisper.defaultModel`
- `whisper.saveRecordings`
- `whisper.recordingsFolder`

Pro lokální vývoj extension:

1. Otevřete složku `my-whisper-extension` ve VS Code.
2. Spusťte Extension Development Host (`F5`).
3. V Command Palette spusťte příkaz `Whisper: Diktovat poezii`.

## Známé poznámky

- Endpoint `/transcribe` vrací text po dokončení celé nahrávky.
- Endpoint `/stream` je optimalizovaný pro krátké segmenty (např. 3s) a průběžný přepis.
- Jazyk je nastaven na češtinu (`language="cs"`).

## Licence

Pavel Oulehle
# whisper-streaming
