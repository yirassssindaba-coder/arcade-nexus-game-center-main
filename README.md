# Arcade Nexus App Center

A lightweight **desktop-style game center app** built with plain browser JavaScript and a zero-dependency Node.js server.

This version shifts the previous browser hub into something that feels much more like an **application**:

- Local launcher scripts that open the app in **browser app mode** (no normal tab bar)
- Installable **PWA** support for app-like launching and pinning
- Desktop-style window chrome and control-room layout
- Multiple varied mini-games in one place
- Local REST API for catalog data, telemetry, files, feature flags, auth, and audit
- Admin panel to manage the arcade catalog and runtime flags
- No external runtime dependencies required beyond Node.js

## Included mini-games

- **Neon Snake Arena** — classic snake with speed ramp and best-score saving
- **Meteor Dodge X** — survive waves of falling meteors
- **Target Tap Blitz** — fast reaction clicking game
- **Memory Flip Plus** — card matching puzzle
- **Code Breaker Vault** — 4-digit logic guessing challenge

## Main pages

- `/` → Game Center app
- `/admin.html` → Control Room
- `/docs.html` → Help / controls / API notes

## Run

### App mode (recommended)

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.un-app.ps1
```

Or double-click `run-app.bat` on Windows.

### Server only

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.un.ps1
```

### Node directly

```powershell
node .\server.js
```

### npm

```powershell
npm start
```

Then open:

- `http://127.0.0.1:3210/`
- `http://127.0.0.1:3210/admin.html`
- `http://127.0.0.1:3210/docs.html`

## Stop background server (if launched with app mode)

```powershell
.\stop-app.ps1
```

## Admin seed account

- **email:** `admin@example.local`
- **password:** `admin123`

## Notes

This build is intentionally kept dependency-light for stability and easier local runs.
It uses browser local storage for best scores, a service worker for app-shell caching, and the local API for telemetry events.
