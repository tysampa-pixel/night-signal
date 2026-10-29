# NIGHT SIGNAL — A REAL-TIME CO-OP MYSTERY

**One crew. Two clues. One way home.** A polished, replayable multiplayer browser game for 2–8 players. Players privately receive half the information needed to solve each round, communicate through shared chat, and vote for the correct beacon before the timer runs out. Five rounds, shared score, speed bonuses, tie handling, and instant rematches.

## Run locally

Requires **Node.js 18+**; no npm dependencies required.

```bash
npm start
```

Open `http://localhost:3000`. Open a second private/incognito browser to join the same room, or use another device on the same network after exposing the port.

## Deploy — public internet

The game needs a Node.js web server: deploying only the `public/` folder to a static host **does not** enable multiplayer.

**Render:** Put these files in a GitHub repository, choose **New → Blueprint** in Render, connect the repo, and use the supplied `render.yaml`. The live HTTPS address will appear after deployment. You can also create a Render Web Service with `npm start` as the start command and Node runtime. A sleeping free instance takes time to wake up.

**Railway / any Node host:** Deploy the entire directory with `npm start`. The service must support long-lived HTTP connections (Server-Sent Events). Set `PORT` if needed, otherwise defaults to 3000.

The app stores temporary rooms in memory, which means a server restart clears rooms and progress. This is fine for a demo/small game session, but production use with many instances would require a shared store (e.g. Redis). For reliability, run just one server instance for this demo.

## How to verify real multiplayer

1. Open the public HTTPS URL on a laptop and create a room (enter a call sign).
2. Copy the five-character room code or shareable invitation link.
3. Open the invitation on another phone/browser, enter a different name, and join. The two screens should show both members in the lobby instantly.
4. Captain starts. Each player sees **different secret intelligence** (color vs. symbol), though both see the same four beacons.
5. Send a chat message on one screen and confirm it appears on the other.
6. Both vote for the beacon matching the **combined clues**. After both votes, round reveals the outcome. The captain advances to rounds 2–5.
7. At the end, the score screen appears. Captain selects **Play again** and returns both players to the same room.
8. Reload during a round; local session should reconnect without another login.
9. Test with phones and different networks, not just two browser tabs.

## Features / fairness

- Responsive desktop/mobile UI; keyboard shortcuts 1–4 to vote.
- Up to eight simultaneous players, 65-second rounds, five rounds per game.
- Synchronized state with server-sent events (SSE) and server-side timer.
- Private clue distribution per user; only the user's own clue is sent to their device.
- One clue gives beacon **color**, another the **symbol**; each alone matches two of four options, so cooperation is necessary.
- Every round has exactly one logically valid target.
- Team majority wins; ties or missing votes lose. Players may change votes until reveal.
- Name/chat length limits, HTML escaping, no passwords or accounts, room codes, reconnect tokens.
- Game is free and has no tracking, account system, database, or external dependencies.

## Handshake challenge submission

Upload/submit in the **Create a Multiplayer Game** mission inside Handshake AI Skills Studio. Required fields (per published official rules):

- **Title:** Night Signal — The Hidden Clue Co-op
- **Cover image:** `public/cover.svg` (some uploaders require PNG; export the SVG to PNG using a browser or graphic tool).
- **Description:** Night Signal is a real-time cooperative mystery for 2–8 friends. Each player receives private intel that is insufficient alone. Only by sharing clues in live chat can the crew identify the safe beacon, vote before the timer expires, and survive five increasingly dramatic transmissions. No logins, downloads, or installs — just a room code, a live URL, and teamwork.
- **Project URL:** the live URL of the **deployed app**, not localhost and not the source-code ZIP.

**Important deadline discrepancy:** The Handshake mission UI says October **31**, 2026 11:59 PM PT, while the PDF of the official rules currently linked from the public mission page says October **30**, 2026 11:59 PM PT. Treat the **earlier deadline** as a safety margin and ask Handshake which is controlling.

**Eligibility note:** Portugal is included among countries in Appendix A of the official contest rules. Being eligible by country does not guarantee eligibility on other factors, including account review and specific contest conditions.

## Technical notes

Start: `node server.js`. Health endpoint: `/`. All application logic is in `server.js`, `public/app.js`, and `public/style.css`. It is a single-process dependency-free application designed to be straightforward to audit, customize, and deploy.
