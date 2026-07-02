# Deploy SurakshaMitra

This guide deploys:

- MongoDB on MongoDB Atlas
- The Express and Socket.io backend on Render
- The React/Vite frontend on Vercel

Deploy the backend first, then the frontend, and finally update the backend with
the public frontend URL.

## Before You Deploy

You need:

- A GitHub repository containing this project
- A MongoDB Atlas database
- A Render account
- A Vercel account
- An OpenRouteService API key for Safe Route
- A Cloudinary account for incident photo uploads
- A Google Gemini API key if the AI assistant is required
- A verified Brevo sender and API key or SMTP key for SOS emails

Never commit `.env` or `frontend/.env`. The included `.gitignore` excludes both.
Rotate any credential that has previously appeared in a screenshot, terminal
log, commit, or shared message.

## 1. Push the Project to GitHub

Run these commands from the VS Code terminal:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified
git init
git branch -M main
git add .
git status
```

Confirm that these are not staged:

- `.env`
- `frontend/.env`
- `backend/node_modules/`
- `frontend/node_modules/`
- `frontend/dist/`

Then commit and push:

```bash
git commit -m "Initial commit: SurakshaMitra"
git remote add origin https://github.com/thesatyamraj/SurakshaMitra.git
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/thesatyamraj/SurakshaMitra.git
git push -u origin main
```

GitHub may open a browser authentication window. GitHub account passwords are
not accepted for command-line Git authentication; use browser sign-in or a
personal access token.

## 2. Configure MongoDB Atlas

1. Create a project and an Atlas cluster.
2. Open **Database Access** and create a database user.
3. Open **Network Access** and allow the backend to connect.
4. Copy the Node.js connection string.
5. Replace the username, password, and cluster host.
6. Use `surakshamitra` as the database name.

Example:

```text
mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/surakshamitra?retryWrites=true&w=majority
```

URL-encode special characters in the database password. For example, `@`
becomes `%40`.

Render outbound addresses may vary depending on the selected service plan. For
a demo, Atlas Network Access can temporarily allow `0.0.0.0/0`; use a more
restricted network configuration for a production system.

## 3. Deploy the Backend to Render

### Option A: Render dashboard

1. In Render, select **New > Web Service**.
2. Connect `thesatyamraj/SurakshaMitra`.
3. Configure:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Render supplies `PORT`; do not hard-code a production port.

### Option B: Render Blueprint

The root [render.yaml](./render.yaml) contains the base backend configuration.
In Render, select **New > Blueprint**, connect the repository, and provide the
environment values marked as not synchronized.

The Blueprint only contains the core variables. Add optional email, AI, SMS,
and push variables manually in the Render dashboard.

### Required Render environment variables

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=generate_a_unique_secret
JWT_REFRESH_SECRET=generate_a_different_unique_secret
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
FRONTEND_URL=https://temporary.example.com
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Generate two different JWT secrets locally:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Do not reuse the access-token secret as the refresh-token secret.

`FRONTEND_URL` is temporary at this stage. Replace it with the Vercel URL after
deploying the frontend.

### Gemini AI

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MAX_OUTPUT_TOKENS=4096
```

Without this key, the chat endpoint uses its built-in fallback responses.

### Cloudinary media storage

Incident report photos are uploaded directly from the backend to Cloudinary.
MongoDB stores the secure Cloudinary URL and public ID, and admin deletion of an
incident also deletes the related Cloudinary images.

Required in Render if users will upload report photos:

```env
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Alternative Render variables:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Cloudinary custom keys must have permission to upload assets. In Cloudinary
**Settings > API Keys**, assign the key an upload-capable role. For this app,
**Master Admin** is the simplest working role. If the key has only Media
Library access, incident image uploads can fail with a `403`.

Reports without photos can still be submitted if `CLOUDINARY_URL` is missing,
but any report with photos will be rejected until Cloudinary is configured.
Do not use local server storage for incident photos on Render.

### Brevo email

The Brevo API is the preferred production option:

```env
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM=SurakshaMitra <your-verified-sender@example.com>
```

Alternatively, configure Brevo SMTP:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_FROM=SurakshaMitra <your-verified-sender@example.com>
```

If `BREVO_API_KEY` is set, SOS email uses the API. Otherwise, it falls back to
SMTP. The sender address must be verified in Brevo.

### Optional SMS and web push

```env
TWILIO_ENABLED=false
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

Deploy the service and copy its public URL, for example:

```text
https://surakshamitra-api.onrender.com
```

Verify:

```text
https://surakshamitra-api.onrender.com/api/health
```

The response should report `status: "ok"` and `db: "connected"`.

## 4. Seed the Production Database

The seed script creates Bengaluru locations, ratings, trust data, safe zones,
and the admin account.

Important: `npm run seed` deletes all existing Bengaluru locations and all
ratings and trust records before rebuilding them. Run it only for initial setup
or when you intentionally want to replace that data.

Set the production Atlas URI in the root `.env`, set strong seed credentials,
and run:

```bash
cd /Users/satyam/Downloads/SurakshaMitra-Unified/backend
npm run seed
```

Relevant root `.env` values:

```env
MONGODB_URI=mongodb+srv://...
SEED_ADMIN_EMAIL=your-admin@example.com
SEED_ADMIN_PASSWORD=use-a-strong-unique-password
```

Do not use the demo admin password in production.

## 5. Deploy the Frontend to Vercel

1. In Vercel, select **Add New > Project**.
2. Import `thesatyamraj/SurakshaMitra`.
3. Set **Root Directory** to `frontend`.
4. Vercel should detect Vite automatically.
5. Confirm:

| Setting | Value |
|---|---|
| Build Command | `npm run build` |
| Output Directory | `dist` |

Add these Vercel environment variables:

```env
VITE_API_URL=https://surakshamitra-api.onrender.com/api
VITE_SOCKET_URL=https://surakshamitra-api.onrender.com
VITE_MAP_CENTER_LAT=12.9716
VITE_MAP_CENTER_LNG=77.5946
VITE_ORS_API_KEY=your_openrouteservice_key
```

Do not add a trailing slash to `VITE_API_URL` or `VITE_SOCKET_URL`.

Deploy and copy the production URL, for example:

```text
https://suraksha-mitra.vercel.app
```

The included `frontend/vercel.json` provides the SPA rewrite required for
routes such as `/login`, `/incidents`, and `/track/:token`.

## 6. Connect Vercel and Render

Return to the Render service and replace `FRONTEND_URL`:

```env
FRONTEND_URL=https://suraksha-mitra.vercel.app
```

Save the environment and redeploy or restart the backend.

This value controls:

- Express CORS
- Socket.io CORS
- Public SOS tracking links
- Links in notification emails

For multiple allowed frontends, use a comma-separated value:

```env
FRONTEND_URL=https://suraksha-mitra.vercel.app,https://preview.example.com
```

Use the production Vercel URL first because SOS emails use the first URL when
building tracking links.

## Browser Location Permission

Browser geolocation works only in secure contexts. The deployed frontend must
use HTTPS, which Vercel provides. The browser should request location access
when the user starts SOS or another feature that needs the current position.

If no prompt appears:

1. Open the browser's site settings.
2. Reset or allow the Location permission.
3. Reload the page.
4. Make sure the site is using HTTPS.

A previously denied permission usually prevents the browser from displaying a
new prompt until the site permission is reset manually.

## Post-Deployment Checklist

- [ ] `/api/health` reports `status: "ok"` and `db: "connected"`
- [ ] The Vercel site loads directly on nested routes
- [ ] Signup, login, logout, and token refresh work
- [ ] The safety map displays seeded Bengaluru locations
- [ ] Safe Route suggestions appear and route calculation succeeds
- [ ] A user can submit and view an incident
- [ ] A user can upload an incident photo and see the Cloudinary image in Incidents/Admin
- [ ] Admin can update, moderate, and delete incidents
- [ ] Browser location permission is requested for SOS
- [ ] SOS email contains the public Vercel `/track/:token` URL
- [ ] Live tracking updates on a second device
- [ ] Realtime map and notification events connect through Socket.io
- [ ] Gemini returns a complete response when its key is configured

## Troubleshooting

### Backend cannot connect to MongoDB

- Verify `MONGODB_URI`.
- URL-encode special characters in the password.
- Check Atlas Database Access and Network Access.
- Confirm `/api/health` reports `db: "connected"`.

### Browser reports a CORS error

- Set Render `FRONTEND_URL` to the exact Vercel origin.
- Do not include a path such as `/api`.
- Remove a trailing slash.
- Restart the Render service after changing the value.

### Frontend requests localhost after deployment

- Set `VITE_API_URL` and `VITE_SOCKET_URL` in Vercel.
- Redeploy the frontend because Vite embeds these values at build time.

### SOS email contains localhost

- Set Render `FRONTEND_URL` to the production Vercel URL.
- Restart the backend.
- Trigger a new SOS; previously sent emails cannot be changed.

### SOS email is not delivered

- Verify the emergency-contact email stored in the user's profile.
- Confirm the Brevo sender address is verified.
- Check the Render logs for `[Email]` messages.
- Verify either the Brevo API variables or all SMTP variables.
- Check Brevo's transactional logs and spam folder.

### Safe Route does not calculate

- Set `VITE_ORS_API_KEY` in Vercel.
- Redeploy Vercel after changing it.
- Select both endpoints from the autocomplete suggestions.

### Incident photo upload fails

- Set `CLOUDINARY_URL` in Render.
- Confirm the value uses `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.
- If uploads return `403`, assign the Cloudinary API key the **Master Admin** role or another role with upload permission.
- Redeploy or restart the backend after changing the value.
- Rotate the Cloudinary API secret if it was exposed in a screenshot or chat.

### First backend request is slow

Some Render service plans may suspend an idle service. Check the current Render
plan behavior and service logs. The frontend should handle a delayed first API
response gracefully.
