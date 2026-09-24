# React + TypeScript + Vite

## YOLOE setup

The browser UI uses the Python service in [`backend`](backend) for YOLOE visual-prompt inference. Run both processes locally:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn yoloe_api:app --reload --host 0.0.0.0 --port 8000
```

In another terminal, run the frontend with `npm run dev`. Vite proxies `/api` to port 8000. The first YOLOE request downloads the pretrained weights, so it can take a while and needs a machine with enough RAM. CPU works for testing; CUDA is recommended.

For GitHub Pages, deploy the backend separately over HTTPS and create a repository variable named `VITE_API_URL` under **Settings > Secrets and variables > Actions > Variables**. Set it to the backend origin, for example `https://your-yoloe-service.example.com`. Add `https://ariesf829.github.io` to the backend's `VISION_COUNTER_ORIGINS` value.

The official YOLOE code and weights are AGPL-3.0. Review that license before public or commercial deployment.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
