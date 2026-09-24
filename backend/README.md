# YOLOE service

This service runs YOLOE visual prompting. It accepts a reference image and a target image, then returns normalized detection boxes and a count.

## Local setup

Use Python 3.10 or newer in a virtual environment:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn yoloe_api:app --reload --host 0.0.0.0 --port 8000
```

The first request downloads the model from Hugging Face. CPU inference is supported but can be slow; a CUDA-enabled PyTorch installation is recommended for repeated use.

Set `VITE_API_URL=http://localhost:8000` when running the frontend locally. For the GitHub Pages frontend, deploy this service separately and set `VITE_API_URL` to its HTTPS URL during the frontend build. The API must allow the GitHub Pages origin through `VISION_COUNTER_ORIGINS`.

The YOLOE repository and weights are AGPL-3.0. Review the license before public or commercial deployment.
