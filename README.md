<div align="center">

<!-- Animated Wave Header -->
<img src="https://capsule-render.vercel.app/api?type=waving&height=210&color=0:0f172a,100:7c3aed&text=Arcade%20Nexus%20Game%20Center&fontSize=46&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=A%20desktop-style%20arcade%20hub%20with%20multiple%20mini-games%2C%20a%20local%20admin%20panel%2C%20and%20a%20zero-dependency%20Node.js%20runtime%20built%20for%20instant%20launch%20and%20smooth%20play.&descAlignY=58" />

<!-- Typing SVG -->
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&duration=3000&pause=700&color=60A5FA&center=true&vCenter=true&width=980&lines=Modern+arcade+hub+with+multiple+mini-games+in+one+fast+local+app;Switch+between+Snake%2C+Meteor+Dodge%2C+Target+Tap%2C+Memory%2C+and+Code+Breaker;Built+with+plain+JavaScript+and+a+zero-dependency+Node.js+server" />

<p>
  <img src="https://img.shields.io/badge/Node.js-24-3c873a" />
  <img src="https://img.shields.io/badge/JavaScript-ES202x-f7df1e" />
  <img src="https://img.shields.io/badge/Genre-Arcade Hub-22c55e" />
  <img src="https://img.shields.io/badge/Mode-Local App-f59e0b" />
</p>

</div>

---

## Overview
Arcade Nexus Game Center is a desktop-style arcade hub that transforms the earlier single-game starter into one polished local app with multiple mini-games, a built-in admin panel, and a lightweight local API.

---

## Key Features
## Game Variety
- Play multiple mini-games in one launcher-friendly app
- Switch instantly between arcade modes without restarting the server
- Keep local best-score progress for replayable sessions

## App Experience
- Clean home screen designed to feel more like an app than a plain web page
- Fast local launch with no external runtime packages required
- Stable browser-based rendering with responsive controls and clear HUD panels

## Local Platform Tools
- Built-in admin panel for catalog data and runtime flags
- Local REST API for telemetry, audit, files, sessions, and seed data
- Smoke test script for quick verification after launch

---

## Included Mini-Games
## Core Arcade Modes
- **Neon Snake Arena** - Classic snake with speed ramp and best-score tracking
- **Meteor Dodge X** - Survive falling hazards and rising pressure
- **Target Tap Blitz** - Fast reaction challenge with score bursts
- **Memory Flip Plus** - Match cards under time pressure
- **Code Breaker Vault** - Logic guessing mode with quick retry loops

---

## Tech Stack
- Node.js 24
- Plain browser JavaScript
- HTML and CSS interface
- Zero-dependency local server runtime
- Local JSON data storage for app state, flags, and telemetry

---

## Preview
- Main arcade hub: `public/index.html`
- Admin control room: `public/admin.html`
- Local docs and route guide: `public/docs.html`

```text
public/
├── index.html
├── admin.html
├── docs.html
├── game.js
└── styles.css
```

---

## Quick Start
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run.ps1
npm start
```

---

## Local Routes
- `/` - Arcade Game Center main hub
- `/admin.html` - Admin panel for catalog and runtime controls
- `/docs.html` - Local route and API reference
- `/status` - Status endpoint for quick health checks

---

## Admin Seed Account
- **email:** `admin@example.local`
- **password:** `admin123`

---

## Project Structure
```text
arcade-nexus-game-center-main/
├── config/
│   └── app.json
├── data/
│   ├── audit.json
│   ├── files.json
│   ├── flags.json
│   ├── items.json
│   ├── jobs.json
│   ├── notifications.json
│   ├── sessions.json
│   ├── telemetry.json
│   └── users.json
├── public/
│   ├── admin.html
│   ├── admin.js
│   ├── docs.html
│   ├── game.js
│   ├── index.html
│   └── styles.css
├── scripts/
│   └── smoke-test.js
├── package.json
├── run.ps1
├── run.sh
└── server.js
```

---

## Future Improvements
- Add more mini-games and rotating seasonal modes
- Add richer scoreboards and local player profiles
- Add app-mode launcher enhancements and installable desktop packaging

---

## License
For educational, portfolio, and prototype use.
