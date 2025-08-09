# Sudoking — Render One-Click Deploy (No Login)

## Quick deploy
1. Push this folder to a new **GitHub** repository (public or private).
2. Go to **Render → New → Blueprint** and select your repo.
3. Confirm the service (free plan is OK) and click **Apply**.
4. Wait for build to finish (~1–2 mins). Open the URL Render gives you.

## What’s inside
- `server.js` — Node + Express + Socket.IO server
- `public/` — static client (index.html, client.js, style.css)
- `package.json` — dependencies (express, socket.io)
- `render.yaml` — tells Render how to build and start
- `README.txt` — local run instructions

## Local run (optional)
```bash
npm install
npm start
# open http://localhost:3000
```

## Use
- Enter a **name** and a **room code** (e.g., TEAM1), then **Join**.
- Share the site URL + the **same room code** with officemates.
