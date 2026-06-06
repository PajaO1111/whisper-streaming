from fastapi import FastAPI, Form, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import tempfile
import subprocess
import os
from pathlib import Path

app = FastAPI()
_models = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "service": "whisper-poezie-backend",
        "status": "ok",
        "transcribe": "/transcribe",
        "health": "/health"
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


def _compute_device_config():
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda", "float16"
    except Exception:
        pass
    return "cpu", "int8"


def get_model(model_name: str):
    if model_name not in _models:
        try:
            from faster_whisper import WhisperModel
        except Exception as exc:
            raise RuntimeError("Balíček faster-whisper není dostupný.") from exc

        device, compute_type = _compute_device_config()
        _models[model_name] = WhisperModel(model_name, device=device, compute_type=compute_type)
    return _models[model_name]


def _to_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_audio_for_whisper(input_path: str) -> str:
    """Convert arbitrary input audio to 16kHz mono PCM WAV for stable recognition."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as out_file:
        output_path = out_file.name

    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        output_path,
    ]

    try:
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return output_path
    except Exception:
        if os.path.exists(output_path):
            os.remove(output_path)
        return input_path


def _format_poetry(segments, pause_threshold_s: float = 0.8) -> str:
    lines = []
    current = []
    prev_end = None

    for segment in segments:
        part = segment.text.strip()
        if not part:
            continue

        if prev_end is not None and (segment.start - prev_end) >= pause_threshold_s and current:
            lines.append(" ".join(current).strip())
            current = []

        current.append(part)
        prev_end = segment.end

    if current:
        lines.append(" ".join(current).strip())

    return "\n".join([line for line in lines if line])

@app.post("/transcribe")
async def transcribe(
    file: UploadFile,
    model: str = Form("large-v3"),
    format_poetry: str = Form("true")
):
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    normalized_path = _normalize_audio_for_whisper(tmp_path)

    whisper = get_model(model)
    segments, info = whisper.transcribe(
        normalized_path,
        language="cs",
        task="transcribe",
        initial_prompt="Následuje český text. Přepisuj přesně česky, bez překladu.",
        beam_size=5,
        best_of=5,
        temperature=0.0,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400)
    )
    segments = list(segments)

    if _to_bool(format_poetry):
        text = _format_poetry(segments)
    else:
        text = "\n".join([s.text.strip() for s in segments])

    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    if normalized_path != tmp_path and os.path.exists(normalized_path):
        os.remove(normalized_path)

    return {"text": text, "model": model, "language": info.language, "language_probability": info.language_probability}

@app.post("/stream")
async def stream_transcribe(
    file: UploadFile,
    model: str = Form("large-v3"),
    format_poetry: str = Form("false")
):
    """Endpoint optimalizovaný pro krátké audio segmenty při živém streamingu (3s okna)."""
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    normalized_path = _normalize_audio_for_whisper(tmp_path)

    try:
        whisper = get_model(model)
        segments, _ = whisper.transcribe(
            normalized_path,
            language="cs",
            task="transcribe",
            initial_prompt="Následuje český text. Přepisuj přesně česky, bez překladu.",
            beam_size=2,
            best_of=1,
            temperature=0.0,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=300)
        )
        segments = list(segments)

        if _to_bool(format_poetry):
            text = _format_poetry(segments, pause_threshold_s=0.5)
        else:
            text = " ".join(s.text.strip() for s in segments if s.text.strip())
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if normalized_path != tmp_path and os.path.exists(normalized_path):
            os.remove(normalized_path)

    return {"text": text.strip()}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5005)
