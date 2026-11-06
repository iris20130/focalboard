# Focalboard LAN Edition (v8.0.0, customized)

**中文说明：[README.md](README.md)**

A **self-hosted multi-user kanban system for LAN teams**, built on the source of [Mattermost Focalboard](https://github.com/mattermost/focalboard) v8.0.0. No cloud account, no external dependency — run it on one PC or an internal server and share it with your team.

On top of the upstream kanban features, this edition adds **due-date reminders (sidebar + multi-channel push)**, a **leave / time-off assistant**, a **weekday working-hours property**, a **top date bar**, **workflow swimlanes**, and an **Android WebView app**, plus a **Windows taskbar calendar** companion. It ships as a portable Windows package, a Windows tray calendar, a Docker image, and an APK.

---

## Features

### Boards and views
- Kanban, table, gallery and calendar views with filters, sorting and grouping
- 13 built-in templates that switch between Chinese and English with the UI language
- **Workflow view**: split a board into swimlane rows by any select property; collapse, rename or add workflows; cards cannot be dragged across workflows
- **Compact mode** and **card hiding**, both restorable at any time

### Due-date reminders
- Read-only formula property **Due status**: overdue / due today / due soon / on track / no date, based on automatically detected deadline properties
- **Right sidebar** grouping overdue (red), due soon (orange) and pending-return (purple) counts per board, resizable, click a card to jump to it with a highlight ring
- **Push channels**: Feishu, WeCom, DingTalk, ServerChan (ftqq) and custom JSON; configured per account with lead days, weekdays, time windows, interval/daily schedules and a "push now" action
- Push messages reuse the same server-side query as the sidebar, so the numbers always match
- **Actual completion date**: set automatically when a card moves to "Completed" and removed from reminders

### Leave and working hours
- **Leave assistant**: annual leave and compensatory leave ledger; statutory annual leave tiers granted automatically by years of service (≥20 → 15 days, ≥10 → 10 days, ≥1 → 5 days), plus manual grants
- Reset rule "accumulation year + fixed month/day after N years", FIFO deduction, half days, expiry, and rejection when the balance is insufficient
- The board calendar overlays your own leave and the 24 solar terms; the ledger exports to txt
- **Working days** formula property: computes a weekday span between two date properties, inclusive and skipping weekends

### Top bar and daily use
- Top date bar with Gregorian date, weekday, sexagenary year, lunar date and leave badges; left-click for a popup, right-click to pin the leave calendar
- Single-line scrolling quotes maintained in `quotes.txt` (`[idle]` / `[busy]` sections); refresh the page to apply
- Chinese/English UI, tray icon, silent auto-start at login, one-click firewall rule
- **Windows taskbar calendar**: a standalone tray app; click the taskbar icon to open the leave assistant. In-app web login with remembered sessions, offline cache of the last sync, automatic resync when the server is back

### Users and data
- Built-in account login; **the first registered account becomes the administrator**; invite-link registration
- Admin member panel: online status, add accounts, reset passwords, remove members
- SQLite single-file database plus an attachments folder — copy the whole `data` directory to back up or migrate

---

## Download

All artifacts are published on the [Releases](https://github.com/iris20130/focalboard/releases/latest) page:

| Platform | File | Notes |
|---|---|---|
| Windows (portable) | `Focalboard-Windows-8.0.0-lan-20261106.zip` | Unzip and run `Focalboard.exe`; no admin rights needed |
| Windows calendar | `FocalboardCalendar-1.0.0-win.zip` | Standalone tray app; click the taskbar icon to open the leave calendar (also bundled in the Windows package under `calendar\`) |
| Linux / Docker | `focalboard-docker-8.0.0-lan-20261026.tar.gz` | Prebuilt image, compose file and sample config |
| Android | `FocalboardMobile-1.1.0.apk` | WebView shell app, Android 8.0+ |

### Windows quick start
1. Unzip and run `Focalboard.exe` — a tray icon appears and your browser opens the LAN address
2. Click **Register** to create the first account (it becomes the administrator)
3. As admin, open the user menu (bottom-left) → **Invite users** and share the registration link
4. If colleagues cannot connect: tray icon → **Allow LAN access (firewall)**

> Silent auto-start at login is enabled by default; toggle it from the tray menu.
> The port is 8088 and the config file is `config.json` (comments with `//` are supported).

Full guide: [Windows user guide (EN)](docs/delivery/UserGuide_EN.txt) ｜ [中文使用说明](docs/delivery/使用说明.txt)

### Windows taskbar calendar
Use the `calendar\` folder inside the Windows package, or download `FocalboardCalendar-1.0.0-win.zip`:

1. Run `FocalboardCalendar.exe`; a calendar icon appears in the tray
2. Right-click the tray icon → **Set server address** and enter your Focalboard URL (e.g. `http://192.168.1.100:8088`)
3. Click the tray icon to open the leave assistant; log in inside the popup once, then the session is remembered
4. When offline it shows the last synced data and syncs automatically once the server is reachable again

> Requires the Microsoft Edge WebView2 Runtime (usually preinstalled on Windows 10/11).
> Guide: [任务栏日历使用说明](docs/delivery/任务栏日历使用说明.txt) ｜ Source and build: [windows-calendar/README.md](windows-calendar/README.md)

### Docker quick start
```bash
docker load -i focalboard-docker-8.0.0-lan-20261026.tar.gz
docker compose up -d          # uses the bundled compose file and config
```
Open `http://<server-ip>:8088/` and register the first account.

Full guide: [Docker guide (EN)](docs/delivery/DockerGuide_EN.md) ｜ [Docker 部署手册](docs/delivery/镜像使用说明.md)

### Android app
1. Install `FocalboardMobile-1.1.0.apk`
2. On first launch enter the server address, e.g. `http://192.168.1.100:8088`
3. Three bottom tabs: **Board**, **Calendar / Leave**, **Reminder settings**; long-press for 3 seconds to drag and reorder tabs
4. To switch servers, clear the app data from the settings tab and enter a new address

Full guide: [手机 APP 使用说明](docs/delivery/手机APP使用说明.md)

---

## Screenshots

> Screenshots are not uploaded yet. Once the maintainer adds the images to `docs/screenshots/`, this section will be replaced with the actual pictures (filenames below).

| Screenshot needed | Suggested filename |
|---|---|
| Board view with reminder sidebar (and top date bar) | `docs/screenshots/board.png` |
| Leave calendar popup / pinned panel (solar terms and ledger) | `docs/screenshots/leave-calendar.png` |
| Windows taskbar leave calendar | `docs/screenshots/windows-calendar.png` |
| Reminder settings panel (push + per-board options) | `docs/screenshots/reminder-settings.png` |
| Mobile app: board / calendar / settings, three pages | `docs/screenshots/mobile.png` |

---

## Repository layout

```
.
├── server/              # Go server (custom: reminder push, leave, top bar, lunar/solar terms)
├── webapp/              # React + TypeScript frontend (custom: dueLayout, leaveCalendar, …)
├── mattermost-plugin/   # Mattermost integration plugin (upstream)
├── launcher/            # Windows tray launcher (C#)
├── windows-calendar/    # Windows taskbar leave calendar (C# + WebView2)
├── mobile/              # Android app source (Kotlin WebView shell)
├── docs/delivery/       # Delivery docs: Windows / Docker / APP guides (zh + en)
├── docker/              # Docker build files (upstream)
└── Makefile             # Build entry points
```

## Build from source

**Requirements**: Go 1.21+, Node.js 18+ (20 recommended), npm.

```bash
# 1. Frontend
cd webapp && npm install && npm run pack        # output in webapp/pack

# 2. Server (Windows example)
cd ../server
go build -ldflags "-X github.com/mattermost/focalboard/server/model.Edition=dev" \
  -o ../bin/focalboard-server.exe ./main

# 3. Assemble a runtime folder
#    Put focalboard-server.exe, config.json, quotes.txt and webapp/pack/ together.
#    The Windows package additionally needs launcher/ compiled to Focalboard.exe.
```

- Template archives: `make templates-archive` (English) / `make templates-archive-zh` (Chinese)
- Tray launcher: see [launcher/README.md](launcher/README.md)
- Taskbar calendar: see [windows-calendar/README.md](windows-calendar/README.md) (`build.bat`, requires .NET Framework 4.8)
- Android app: see [mobile/README.md](mobile/README.md)

## Configuration

The packaged `config.json` contains Chinese comments; the commonly used keys:

| Key | Description |
|---|---|
| `port` | Listen port, default `8088` |
| `authMode` | `native` (built-in accounts) |
| `topBarEnabled` | Top date bar on/off |
| `dueReminderEnabled` | Server-side reminder scanner on/off |
| `dueReminderCheckInterval` | Scan interval in minutes |

Webhook URLs and signing secrets are configured per account in the web UI (sidebar gear → push settings); leaving them empty falls back to the defaults in `config.json`.

## Security notes

- Traffic is plain HTTP by default — **use it only on a trusted LAN**. For internet access, put an HTTPS reverse proxy (Nginx / Caddy) in front
- Webhook URLs and signing secrets grant bot permissions; do not share `config.json`
- Back up the `data` directory regularly (quit the program before copying)

## License and credits

This project is a modification of [Mattermost Focalboard](https://github.com/mattermost/focalboard) v8.0.0 (MIT / AGPL, see [LICENSE.txt](LICENSE.txt)). Original copyright notices are retained and the modifications are distributed under the same licenses.
Focalboard is a trademark of Mattermost, Inc. This project is not affiliated with Mattermost.
