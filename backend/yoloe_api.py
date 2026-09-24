import os
import tempfile
import time
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLOE
from ultralytics.models.yolo.yoloe.predict_vp import YOLOEVPSegPredictor

MODEL_NAME = os.getenv("YOLOE_MODEL", "jameslahm/yoloe-v8s-seg")
CONFIDENCE = float(os.getenv("YOLOE_CONFIDENCE", "0.05"))
ALLOWED_ORIGINS = os.getenv(
    "VISION_COUNTER_ORIGINS",
    "http://localhost:5173,https://ariesf829.github.io",
).split(",")

app = FastAPI(title="Vision Counter YOLOE API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

model = None


def get_model():
    global model
    if model is None:
        model = YOLOE.from_pretrained(MODEL_NAME)
    return model


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.get("/")
def root():
    return {
        "service": "Vision Counter YOLOE API",
        "ok": True,
        "health": "/health",
        "analyze": "/api/analyze",
    }


@app.post("/api/analyze")
async def analyze(reference: UploadFile = File(...), target: UploadFile = File(...)):
    if not reference.content_type or not reference.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Reference must be an image")
    if not target.content_type or not target.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Target must be an image")

    with tempfile.TemporaryDirectory() as directory:
        reference_path = Path(directory) / "reference.jpg"
        target_path = Path(directory) / "target.jpg"
        reference_path.write_bytes(await reference.read())
        target_path.write_bytes(await target.read())

        try:
            started_at = time.perf_counter()
            reference_width, reference_height = Image.open(reference_path).size
            inset_x = reference_width * 0.05
            inset_y = reference_height * 0.05
            visuals = {
                "bboxes": [
                    np.array([[inset_x, inset_y, reference_width - inset_x, reference_height - inset_y]], dtype=np.float32)
                ],
                "cls": [np.array([0], dtype=np.int64)],
            }
            results = get_model().predict(
                [str(reference_path), str(target_path)],
                prompts=visuals,
                predictor=YOLOEVPSegPredictor,
                conf=CONFIDENCE,
                verbose=False,
            )
            result = results[-1]
            image_height, image_width = result.orig_shape
            boxes = result.boxes.xyxy.cpu().numpy() if result.boxes is not None else []
            confidences = result.boxes.conf.cpu().numpy() if result.boxes is not None else []
            detections = []
            for box, confidence in zip(boxes, confidences):
                x1, y1, x2, y2 = box.tolist()
                detections.append({
                    "x": round(x1 / image_width, 4),
                    "y": round(y1 / image_height, 4),
                    "width": round((x2 - x1) / image_width, 4),
                    "height": round((y2 - y1) / image_height, 4),
                    "confidence": round(float(confidence), 4),
                })
            return {
                "count": len(detections),
                "detections": detections,
                "model": MODEL_NAME,
                "confidence": CONFIDENCE,
                "inference_ms": round((time.perf_counter() - started_at) * 1000),
            }
        except Exception as error:
            raise HTTPException(status_code=500, detail=f"YOLOE inference failed: {error}") from error
