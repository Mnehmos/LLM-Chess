"""
Qwen3-TTS sidecar server for LLM Chess.
Provides HTTP endpoints for text-to-speech synthesis.

Usage:
    python server.py --port 9877 --model 0.6B

Requires:
    pip install qwen-tts fastapi uvicorn
"""

import argparse
import io
import sys
import time
from contextlib import asynccontextmanager

import torch
import soundfile as sf
import uvicorn
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

# Global model reference
tts_model = None
model_name = None
device_info = None
sample_rate = 24000


class SynthesizeRequest(BaseModel):
    text: str
    language: str = "English"
    voice: str = "default"
    speaker: str | None = None
    instruct: str | None = None


def load_model(variant: str):
    global tts_model, model_name, device_info, sample_rate

    from qwen_tts import Qwen3TTSModel

    model_map = {
        "0.6B": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        "0.6B-custom": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "1.7B-custom": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "1.7B-design": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    }

    repo = model_map.get(variant, variant)
    model_name = repo.split("/")[-1] if "/" in repo else variant

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32

    print(f"[TTS] Loading {repo} on {device} ({dtype})...", flush=True)
    start = time.time()

    # Try flash_attention_2 first (faster), fall back to sdpa/eager
    attn = "eager"
    if device.startswith("cuda"):
        try:
            import flash_attn  # noqa: F401
            attn = "flash_attention_2"
        except ImportError:
            attn = "sdpa"  # PyTorch native scaled dot-product attention

    tts_model = Qwen3TTSModel.from_pretrained(
        repo,
        device_map=device,
        dtype=dtype,
        attn_implementation=attn,
    )

    elapsed = time.time() - start
    device_info = f"{device} ({dtype})"
    print(f"[TTS] Model loaded in {elapsed:.1f}s on {device_info}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Model is loaded before server starts (in main)
    yield


app = FastAPI(lifespan=lifespan)

# Allow CORS from Tauri webview and dev server
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "ok": tts_model is not None,
        "model": model_name,
        "device": device_info,
        "sample_rate": sample_rate,
    }


@app.get("/voices")
async def voices():
    # 9 premium timbres from Qwen3-TTS CustomVoice models
    return [
        {"id": "Ryan", "name": "Ryan (Male, Narrator)"},
        {"id": "Vivian", "name": "Vivian (Female, Narrator)"},
        {"id": "Aria", "name": "Aria (Female)"},
        {"id": "Ethan", "name": "Ethan (Male)"},
        {"id": "Luna", "name": "Luna (Female)"},
        {"id": "Leo", "name": "Leo (Male)"},
        {"id": "Mia", "name": "Mia (Female)"},
        {"id": "Noah", "name": "Noah (Male)"},
        {"id": "Sophia", "name": "Sophia (Female)"},
    ]


@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    if tts_model is None:
        return Response(content="Model not loaded", status_code=503)

    start = time.time()

    try:
        if hasattr(tts_model, "generate_custom_voice"):
            # CustomVoice model: use preset speaker with optional instruction
            speaker = req.speaker or "Ryan"
            wavs, sr = tts_model.generate_custom_voice(
                text=[req.text],
                language=[req.language],
                speaker=[speaker],
                instruct=[req.instruct or ""],
            )
        elif hasattr(tts_model, "generate_voice_design"):
            # VoiceDesign model: use instruct as voice description
            wavs, sr = tts_model.generate_voice_design(
                text=[req.text],
                language=[req.language],
                instruct=[req.instruct or "A professional male narrator with a clear, engaging voice"],
            )
        elif hasattr(tts_model, "generate_voice_clone") and req.speaker:
            # Base model with reference audio path provided as speaker
            wavs, sr = tts_model.generate_voice_clone(
                text=req.text,
                language=req.language,
                ref_audio=req.speaker,
                ref_text="",
            )
        else:
            return Response(content="Model variant does not support text-only synthesis. Use CustomVoice model.", status_code=400)
    except Exception as e:
        return Response(content=f"Synthesis error: {e}", status_code=500)

    elapsed = time.time() - start

    # Convert to WAV bytes
    buf = io.BytesIO()
    audio = wavs[0] if isinstance(wavs, list) else wavs
    if hasattr(audio, "cpu"):
        audio = audio.cpu().numpy()
    sf.write(buf, audio, sr, format="WAV")
    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type="audio/wav",
        headers={
            "X-Synthesis-Time-Ms": str(int(elapsed * 1000)),
            "X-Sample-Rate": str(sr),
        },
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Qwen3-TTS Server")
    parser.add_argument("--port", type=int, default=9877)
    parser.add_argument("--model", type=str, default="0.6B-custom")
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    print(f"[TTS] Starting server on {args.host}:{args.port}", flush=True)
    load_model(args.model)
    print(f"[TTS] Server ready on http://{args.host}:{args.port}", flush=True)

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
