Sudoking — No-Login Multiplayer (Starter)
======================================================

What you have
-------------
- Node.js + Express + Socket.IO server
- No accounts, just a name and a room code
- Server generates the Sudoku (same puzzle for everyone in the room)
- Real-time updates, basic FIRST BLOOD + wrong announcements
- Shared board (co-op race) — first correct entries lock in for everyone

Run locally
-----------
1) Install Node.js (18+)
2) In this folder:
   npm install
   npm start
3) Open http://localhost:3000
4) Enter a name + room code (e.g., TEAM1) and click Join
5) Share the same URL/room code with officemates

Deploy free (Railway/Render)
----------------------------
- Create a new Web Service from this repo/zip
- Set start command: `npm start`
- Expose port 3000

Notes
-----
- This demo keeps room state *in memory*; if the server restarts, rooms reset.
- For per-player boards, add per-user states and progress calc.
- Add your announcer logic in `server.js` around the `move` handler.
