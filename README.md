# SurakshaMitra

SurakshaMitra is a MERN-based women's safety platform that combines one-tap emergency SOS, live GPS tracking, crowd-powered safety ratings, incident reporting, safer route planning, and an AI safety assistant.

The idea is simple: **know before you go, and get help fast when you need it.**

## Features

- **Authentication**
  - Signup/login with JWT access and refresh tokens.
  - Anonymous token support for public safety ratings.
  - Admin/moderator role support.

- **Emergency SOS**
  - One-tap SOS with a 10-second cancel countdown.
  - Browser location permission prompt before SOS starts.
  - Live GPS updates every 3 seconds.
  - Public no-login tracking link for emergency contacts.
  - Email alerts via Brevo API or SMTP.
  - Nearby volunteer and nearest police/safe-zone support.

- **Safety Trust Index**
  - 0-10 location safety score per time slot.
  - Uses lighting, crowd behavior, police visibility, incident risk, network availability, NLP sentiment, and trust weighting.
  - Trust Reliability Score helps reduce fake/spam ratings.

- **Community Map**
  - Leaflet/OpenStreetMap safety map.
  - Time-slot heatmap.
  - Live updates through Socket.io.
  - Place detail panel with score breakdown.

- **Safe Route**
  - Bengaluru location autocomplete from seeded database locations.
  - Uses OpenRouteService for walking route planning.
  - Avoids unreliable free-text geocoding by using verified saved coordinates.

- **Incident Reports**
  - Anonymous incident reports.
  - Optional image upload.
  - Public incident listing with fixed-size image cards.
  - Admin can update, verify, escalate, reject, or delete reports.

- **AI Safety Assistant**
  - Gemini-powered `/api/chat`.
  - Built-in fallback answers if Gemini is not configured.

- **PWA**
  - Installable frontend.
  - Service worker and offline fallback.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router |
| Maps | Leaflet, React Leaflet, OpenStreetMap, leaflet.heat |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Realtime | Socket.io |
| Auth | JWT access/refresh tokens, bcryptjs |
| AI | Google Gemini API |
| Email | Brevo API or Brevo SMTP through Nodemailer |
| Routing | OpenRouteService |
| Deployment | Vercel frontend, Render backend |

## Project Structure

```text
SurakshaMitra-Unified/
├── backend/
│   ├── middleware/
│   │   └── auth.js
│   ├── models/
│   │   ├── Incident.js
│   │   ├── Location.js
│   │   ├── Notification.js
│   │   ├── Rating.js
│   │   ├── SafeZone.js
│   │   ├── SOSEvent.js
│   │   ├── STIHistory.js
│   │   ├── Survey.js
│   │   ├── User.js
│   │   └── UserTrust.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js
│   │   ├── chat.js
│   │   ├── incidents.js
│   │   ├── locations.js
│   │   ├── notifications.js
│   │   ├── ratings.js
│   │   ├── safezones.js
│   │   ├── sos.js
│   │   └── survey.js
│   ├── utils/
│   │   ├── emailService.js
│   │   ├── geoService.js
│   │   ├── nlpAnalyser.js
│   │   ├── pushService.js
│   │   ├── regression.js
│   │   ├── seed.js
│   │   ├── smsService.js
│   │   ├── stiEngine.js
│   │   └── stiWeights.js
│   ├── package.json
│   ├── server.js
│   └── socket.js
├── frontend/
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   ├── offline.html
│   │   ├── shield.svg
│   │   └── sw.js
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── vercel.json
│   └── vite.config.js
├── .env.example
├── DEPLOYMENT.md
├── render.yaml
├── README.md
└── .gitignore
```

## Prerequisites

Install these before setup:

- Node.js 18 or newer
- npm
- MongoDB Atlas account
- OpenRouteService API key
- Google Gemini API key, optional but recommended
- Brevo API key or SMTP key, optional for SOS emails
- Vercel account for frontend deployment
- Render account for backend deployment

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/thesatyamraj/SurakshaMitra.git
cd SurakshaMitra
```

If you are working from the existing local folder:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified
```

### 2. Configure backend environment

Create the root `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and fill the required values:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-url>/surakshamitra?retryWrites=true&w=majority
FRONTEND_URL=http://localhost:3000

JWT_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
```

Generate JWT secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Optional AI:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_MAX_OUTPUT_TOKENS=4096
```

Optional Brevo email:

```env
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM=SurakshaMitra <your_verified_brevo_sender@example.com>
```

Or SMTP fallback:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_FROM=SurakshaMitra <your_verified_brevo_sender@example.com>
```

For deployment, `FRONTEND_URL` must be your Vercel URL:

```env
FRONTEND_URL=https://your-vercel-app.vercel.app
```

### 3. Configure frontend environment

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_MAP_CENTER_LAT=12.9716
VITE_MAP_CENTER_LNG=77.5946
VITE_ORS_API_KEY=your_openrouteservice_key
```

### 4. Install dependencies

Backend:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified/backend
npm install
```

Frontend:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified/frontend
npm install
```

### 5. Seed the database

Run this after setting `MONGODB_URI`:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified/backend
npm run seed
```

This creates:

- Bengaluru locations
- Demo safety ratings
- STI scores
- Trust records
- Safe zones
- Admin user

Default seeded admin:

```text
Email: admin@surakshamitra.app
Password: Admin@12345
```

Change these credentials before production use.

### 6. Run locally

Terminal 1, backend:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified/backend
npm run dev
```

Backend runs at:

```text
http://localhost:5000
```

Terminal 2, frontend:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified/frontend
npm run dev
```

Frontend runs at:

```text
http://localhost:3000
```

## Useful Scripts

Backend:

```bash
npm run dev
npm start
npm run seed
```

Frontend:

```bash
npm run dev
npm run build
npm run preview
```

## API Overview

| Route | Purpose |
|---|---|
| `/api/auth` | signup, login, refresh, profile |
| `/api/sos` | SOS trigger, live tracking, cancellation, test email |
| `/api/locations` | location list, detail, heatmap, autocomplete |
| `/api/ratings` | safety ratings and STI updates |
| `/api/incidents` | incident report creation/list/update/delete |
| `/api/admin` | moderator/admin dashboard data |
| `/api/safezones` | safe-zone and police-point management |
| `/api/notifications` | notification inbox and preferences |
| `/api/chat` | Gemini AI safety assistant |
| `/api/survey` | survey data and regression weights |

## Deployment

Recommended deployment:

- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas

High-level steps:

1. Push this repository to GitHub.
2. Deploy `backend/` to Render.
3. Deploy `frontend/` to Vercel.
4. Set Render environment variables:
   - `NODE_ENV=production`
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `FRONTEND_URL=https://your-vercel-app.vercel.app`
   - optional keys like `GEMINI_API_KEY`, `BREVO_API_KEY`
5. Set Vercel environment variables:
   - `VITE_API_URL=https://your-render-api.onrender.com/api`
   - `VITE_SOCKET_URL=https://your-render-api.onrender.com`
   - `VITE_ORS_API_KEY`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Publish to GitHub

The repository's `.gitignore` excludes environment files, API keys, dependencies,
generated uploads, build output, logs, and local editor files.

From the VS Code terminal:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified
git init
git branch -M main
git add .
git status
```

Before committing, confirm that `.env`, `frontend/.env`, `node_modules/`,
`frontend/dist/`, and `backend/uploads/incidents/` do not appear in `git status`.
Then create the first commit and push it:

```bash
git commit -m "Initial commit: SurakshaMitra"
git remote add origin https://github.com/thesatyamraj/SurakshaMitra.git
git push -u origin main
```

If Git reports that `origin` already exists, update it instead:

```bash
git remote set-url origin https://github.com/thesatyamraj/SurakshaMitra.git
git push -u origin main
```

GitHub may open a browser sign-in window. If it asks for terminal credentials,
use your GitHub username and a personal access token, not your GitHub password.

## Security Notes

- Never commit `.env` files.
- Rotate keys if they were exposed in screenshots or chat.
- Use a verified Brevo sender for SOS emails.
- Use strong JWT secrets in production.
- Set `FRONTEND_URL` correctly in Render so SOS emails do not use localhost links.

## Troubleshooting

### Report/SOS emails are not sent

- Check that emergency contact email is complete and valid.
- Check `BREVO_API_KEY` or SMTP credentials.
- Make sure `BREVO_FROM` or `SMTP_FROM` is a verified Brevo sender.
- Restart backend after changing `.env`.

### Safe Route gives wrong routes

- Select locations from the autocomplete suggestions.
- Do not rely on plain typed text.
- Make sure `VITE_ORS_API_KEY` is present in `frontend/.env`.
- Restart frontend after editing `frontend/.env`.

### Map is empty

Run:

```bash
cd backend
npm run seed
```

### MongoDB auth error

- Check username/password in `MONGODB_URI`.
- URL-encode special characters in the password.
- Add your IP in MongoDB Atlas Network Access.

## License

This project is built for academic, portfolio, and demonstration purposes.
