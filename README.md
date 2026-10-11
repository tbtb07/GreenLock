# GreenLock

**A website blocker that makes you touch grass.**

Built for the DEV Hacktoberfest 2026 Open-Source AI Challenge (Week 1: Touch Grass).

GreenLock pairs a Chrome extension with a small Flask server running on the same computer. The extension tracks your time on distracting websites and blocks them once you reach your daily limit. To get them back, you take an outdoor break: photograph the outdoors with your phone, stay outside for the required time, then take another photo. Your phone sends each photo over Wi-Fi to the Flask server on your computer, where a Gemma 3 vision model running locally in Ollama checks it. No cloud service is involved.

## Key features

- **Daily time limit** shared across all the sites you choose to limit (default: 60 minutes per day).
- **Automatic blocking.** Once the limit is reached, limited sites are replaced by a full-page GreenLock lock screen that remembers where you were and sends you back when you're unlocked.
- **Outdoor-break unlock.** Verified by photos checked by a local AI model, with a minimum break length enforced by the server's clock.
- **Phone handoff by QR code.** Scan it on the blocked page to open the unlock page on your phone.
- **Emergency unlock.** Password-protected, with a limited number of uses per day (default: 2 uses of 15 minutes).
- **Toolbar badge** showing minutes left: green (more than 5 min), orange (5 min or less), red (limit reached), blue (unlocked, minutes left in the unlock).
- **Notifications** 5 minutes before your daily limit runs out and 5 minutes before an unlock ends.
- **Configurable**: limited sites (presets plus your own), daily limit, outdoor break length and unlock duration.
- **Fails closed.** If the server can't be reached, blocked sites stay blocked.
- **Private by design.** Photos go from your phone to your own computer over your Wi-Fi network, are analyzed there by Ollama, and are not saved.

## Technology stack

| Part | Technology |
|---|---|
| Browser extension | Chrome Manifest V3, plain JavaScript/HTML/CSS (service worker, `chrome.storage`, `alarms`, `notifications`, `tabs`) |
| Server | Python, Flask |
| Photo checking | [Ollama](https://ollama.com) running Gemma 3 (`gemma3:4b`) |
| Image handling | Pillow, pillow-heif (iPhone HEIC photos supported) |
| QR code | `qrcode` |
| Password hashing | Werkzeug |
| Storage | JSON files in `server/data/` (server) and `chrome.storage.local` (extension) |

## Project structure

```
extension/            Chrome extension (load this folder in Chrome)
  background.js       Time tracking, blocking, badge, notifications
  blocked.html/.js    Lock screen: clock, QR code, status polling, emergency unlock
  options.html/.js    Settings page
  settings.js         Shared default sites and settings helpers
server/
  app.py              Flask server (port 5050)
  outdoor_check.py    Photo preparation + Gemma call
  store.py            Settings/state stored as JSON
  set_password.py     Sets the emergency unlock password
  templates/index.html  Phone page for outdoor breaks
  data/settings.example.json  Default server settings
requirements.txt      Python dependencies
```

## Prerequisites

- **Python 3** (developed with Python 3.13)
- **[Ollama](https://ollama.com/download)** installed and running
- **Gemma 3 (4B)** model pulled into Ollama:
  ```bash
  ollama pull gemma3:4b
  ```
  This is about a **3 GB download** and uses roughly **3-4 GB of RAM** while loaded. 8 GB of RAM is the minimum, 16 GB is recommended. Quit Ollama when you're not using GreenLock to free that memory back up.
- **Google Chrome** (or another Chromium browser that supports unpacked extensions)
- **One computer for both the server and Chrome.** The extension only talks to `http://localhost:5050`, so the Flask server must run on the same computer as the browser where the extension is installed.
- A **phone on the same Wi-Fi network** as that computer

## Installation

### 1. Install the Python dependencies

From the repository root:

**macOS / Linux**
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**Windows**
```bat
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

This installs Flask, ollama, Pillow, pillow-heif, qrcode and Werkzeug into a local virtual environment.

### 2. (Recommended) Set an emergency password

**macOS / Linux**
```bash
.venv/bin/python server/set_password.py
```

**Windows**
```bat
.venv\Scripts\python server/set_password.py
```

Until a password is set, every emergency unlock attempt is rejected.

### 3. Start the Flask server

Run the server on **the same computer as Chrome**. The extension looks for it at `localhost:5050` and won't find a server on another machine. Make sure Ollama is running, then from the repository root:

**macOS / Linux**
```bash
.venv/bin/python server/app.py
```

**Windows**
```bat
.venv\Scripts\python server/app.py
```

On startup the server sends Gemma a small warm-up request so the model is already loaded when your first photo arrives. It then listens on port **5050** on all network interfaces, so your phone can reach it. The first run creates `server/data/settings.json` and `server/data/state.json` from the defaults. Both files are git-ignored.

Keep this terminal open while you use GreenLock.

### 4. Install the Chrome extension

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension/` folder from this repository.

On first install, GreenLock opens its settings page so you can choose your sites and daily limit. The extension talks to the server at `http://localhost:5050`.

## Connecting your phone with the QR code

When you hit your daily limit, the blocked site is replaced by GreenLock's lock screen. It has a dark green theme and shows a live clock and date, the GreenLock logo, the message **"Locked. Go outside to unlock."** and the site you were on. Below that are two cards:

- **Unlock with an outdoor break.** While the server is running, this card shows a **QR code** and the same address as a link (`http://<your-computer's-local-IP>:5050`).
- **Emergency unlock.** A password field for real emergencies, with the number of emergency unlocks left today.

Scan the QR code with your phone's camera to open the outdoor-break page. Your phone must be on the **same Wi-Fi network** as your computer. If the server isn't running, the page says so and keeps retrying every 3 seconds. The QR code appears as soon as the server is up, without reloading the page.

## How outdoor photo verification works

1. **Start the break.** On your phone, tap **Start outdoor break** and take a photo outside.
2. **The photo goes to your computer over Wi-Fi.** The phone page shrinks the photo to at most 1024 px wide and uploads it over your Wi-Fi network to the Flask server on your computer.
3. **Gemma 3 checks it locally.** The server converts the photo to JPEG (at most 1024 px wide) and asks Gemma 3, running in Ollama on the same computer, whether it was taken outdoors. Gemma replies with `outdoor: true/false` and a short reason, which is shown on your phone.
4. **Stay outside.** If the photo is accepted, a countdown starts for your outdoor break length (default: 20 minutes). Timing uses the **server's own clock**, never the photo's metadata.
5. **Finish the break.** When the countdown ends, tap **Finish outdoor break** and take another outdoor photo. It is sent and checked the same way. Trying to finish early is refused.
6. **Unlocked.** If the second photo is also accepted, your sites unlock for your unlock duration (default: 60 minutes). The blocked page notices within a few seconds and takes you back to the site you were on. The toolbar badge turns blue and counts down the unlock.

Photos only travel between your phone and your own computer on your local network. They are processed in memory and are not saved, and nothing is sent to a cloud service.

## Configuration

### Website limits (extension settings)

Open the settings page by right-clicking the GreenLock toolbar icon and choosing **Options**, or from `chrome://extensions` → GreenLock → **Details** → **Extension options**.

- **Sites to limit:** tick any of the presets: YouTube, Twitch, Netflix, Reddit, X, Instagram, MangaDex.
- **Custom sites:** add any other domain (e.g. `example.com`). Full URLs and `www.` are cleaned up automatically, and subdomains are included (e.g. `m.youtube.com` counts as `youtube.com`).
- **Daily limit:** total minutes per day across *all* limited sites. Any whole number of minutes, 1 or more.

These settings are stored in the browser and apply immediately when you click **Save Settings**. Usage resets automatically at local midnight.

### Outdoor break length and unlock duration (server settings)

The same settings page has two server-side settings. The server must be running to change them.

| Setting | Default | Allowed values |
|---|---|---|
| Outdoor break length | 20 minutes | Whole minutes, 1 or more |
| Unlock time after a break | 60 minutes | Whole minutes, 1 or more |

Changes **apply immediately** when you click **Save Settings**. The page shows the current value under each box.

- A break that is **already in progress keeps the length it started with**. The new length applies from the next break.
- An unlock that is **already active keeps its end time**. The new unlock duration applies to the next completed break.

### Emergency unlock

Emergency unlock length (`emergency_minutes`, default 15) and uses per day (`emergency_uses_per_day`, default 2) are set in `server/data/settings.json`. The password is set with `server/set_password.py` (see above).

## Known limitations

- **Only blocks sites in Chrome on this computer** — not apps on your phone, or other browsers/devices.
- **School, work and public Wi-Fi often block phone-to-computer connections.** Use your home Wi-Fi for the phone handoff to work reliably.
- **Gemma can sometimes be fooled** by a photo of an outdoor picture or video shown on a screen.
- **Settings apply immediately** with no lockout on changing them, so GreenLock is a nudge, not a prison — anyone with access to the computer can just turn the limit off.

## Troubleshooting

**Phone page won't load**
- Make sure your phone and computer are on the **same Wi-Fi network**.
- On macOS, the first time the server starts, you may get an incoming-connections permission prompt — click **Allow**.
- Avoid school/work/public Wi-Fi (see Known limitations above); try a home network instead.

**"Port 5050 in use" when starting the server**
- Another copy of the server (or something else) is already using port 5050. Stop it first, e.g. on macOS/Linux:
  ```bash
  lsof -ti :5050 | xargs kill
  ```

**"Can't reach the server" on the lock screen**
- Make sure **Ollama** is running.
- Make sure the Flask **server** is running (see Installation, step 3) and that the terminal running it is still open.

## Contributors

- **Thisara Bamunukula Arachchige**
- **Patrick Akpe**

## License

Released under the [MIT License](LICENSE).
