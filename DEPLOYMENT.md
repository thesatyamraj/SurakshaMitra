# 🚀 Deployment — Render (backend) + Vercel (frontend)

Both free. Total cost ₹0. Do them in this order.

## 1. Push to GitHub
```bash
cd SurakshaMitra-Unified
git init && git add . && git commit -m "SurakshaMitra Unified"
git branch -M main
git remote add origin https://github.com/amanshekhar0/surakshamitra-unified.git
git push -u origin main
```
`.gitignore` already excludes `.env` and `node_modules`, so no secrets leave your machine.

## 2. Database — MongoDB Atlas
Use the same M0 cluster from setup. In **Network Access**, make sure `0.0.0.0/0` is allowed (Render's IPs are dynamic).

## 3. Backend → Render
1. Go to **https://render.com** → sign in with GitHub → **New → Web Service** → pick your repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - **Health Check Path:** `/api/health`
3. **Environment variables** (Advanced → Add): `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL` (fill after step 4), plus any optional keys (`GEMINI_API_KEY`, etc.).
4. Deploy. Your API will be at `https://surakshamitra-api.onrender.com`. Test `…/api/health`.
   > Free Render web services **spin down after ~15 min idle** — the first request after that takes ~30–50s to wake. Normal for a demo; mention it if asked.

*(The included `render.yaml` blueprint can also auto-configure this — use **New → Blueprint** and point it at the repo.)*

## 4. Frontend → Vercel
1. Go to **https://vercel.com** → **Add New → Project** → import the repo.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build` · **Output:** `dist`
3. **Environment Variables:**
   - `VITE_API_URL=https://surakshamitra-api.onrender.com/api`
   - `VITE_SOCKET_URL=https://surakshamitra-api.onrender.com`
   - `VITE_MAP_CENTER_LAT=12.9716`, `VITE_MAP_CENTER_LNG=77.5946`
   - `VITE_ORS_API_KEY=…` (optional)
4. Deploy → you get `https://your-app.vercel.app`.

## 5. Close the loop
Back in **Render**, set `FRONTEND_URL=https://your-app.vercel.app` and redeploy so CORS, WebSockets, and SOS email tracking links use the public Vercel URL instead of localhost.

## 6. Seed production (once)
From your Mac, temporarily point root `.env`'s `MONGODB_URI` at the Atlas cluster and run:
```bash
cd backend && npm run seed
```
Then set it back for local dev.

## Post-deploy checklist
- [ ] `https://…onrender.com/api/health` returns `{ status: "ok" }`
- [ ] Vercel site loads and the map fills with places
- [ ] Sign up / sign in works (silent token refresh)
- [ ] SOS trigger → open the `/track/<token>` link on a second device and watch the dot move
- [ ] Submitting a rating updates the map live (WebSocket)
- [ ] Admin login reaches the dashboard; non-admins are rejected at the API
