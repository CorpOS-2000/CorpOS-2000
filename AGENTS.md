# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

CorpOS 2000 is an Electron desktop game (business simulation) with a retro Windows 2000 UI. There are two Electron apps:

- **Main game** (`/workspace`) — `npm start` → `electron .`
- **Content Studio** (`/workspace/content-studio`) — `cd content-studio && npm start` → `electron .`

Both use npm (lockfiles: `package-lock.json`). There are no backend servers, databases, or external API dependencies. All game data lives in JSON files under `data/`.

### Running the game in Cloud Agent VMs

Electron requires a display. The VM has `DISPLAY=:1` available.

```
DISPLAY=:1 CORPOS_NO_GPU=1 npx electron .
```

- `CORPOS_NO_GPU=1` disables hardware acceleration (required in containerized environments).
- `CORPOS_DEVTOOLS=1` opens Chrome DevTools on launch (useful for debugging).
- For headless-only testing (no visible display), use `xvfb-run --auto-servernum npx electron .`

### Remote debugging / DOM automation

Launch with `--remote-debugging-port=9222` to use Chrome DevTools Protocol:

```
DISPLAY=:1 CORPOS_NO_GPU=1 npx electron --remote-debugging-port=9222 .
```

Then use `curl -s http://localhost:9222/json` to get the WebSocket URL and send `Runtime.evaluate` commands via Python `websockets` (pre-installed via pip).

### Boot sequence and enrollment

The game has a multi-stage boot: UEFI Boot Manager → BIOS POST → Logo → Enrollment (4 steps) → Login → Desktop.

- **Boot Manager**: requires pressing Enter to proceed.
- **Enrollment Step 1**: Validates names (2+ alpha chars), DOB (must match age ±1 year from Jan 1 2000), sex, race, height (54–84 inches). **3 failed validation attempts = license termination** — be careful.
- **Enrollment Step 3**: Uses Moogle Maps address picker. Search for an address (e.g., type "123"), click a result, click "Use this address".
- **Enrollment Step 4**: Set username/password, check attestation checkbox, click Register.
- **Login**: use the credentials from enrollment.

### Data build scripts

```
npm run build:data      # builds pages.json
npm run build:brands    # builds parody-brands.json
npm run build:mytube    # builds mytube-videos.json
npm run build:maps      # generates addresses.json
```

### D-Bus errors are expected

Electron in containers outputs many `Failed to connect to the bus` errors — these are harmless and do not affect functionality.

### No linter or test runner configured

This project does not have ESLint, Prettier, or any automated test framework configured. There are no `test` or `lint` npm scripts.
