# Focalboard LAN Edition (Docker) - Deployment Guide

Image: `focalboard-lan:8.0.0-leave` (the archive also carries the compatibility tag
`focalboard-lan:8.0.0`)
Archive: `focalboard-lan-8.0.0-leave.tar.gz` (~60 MB, `linux/amd64`)
Default port: `8088` (HTTP)
Data: SQLite database, attachments and holiday cache under `./data` (configurable)
Build: 2026-10-25, Focalboard v8.0.0 sources with the leave assistant, lunar-date
API and login fix.

This guide walks through a working deployment in about 10 minutes.

---

## 1. Requirements

- Linux x86_64 (or any Docker host that can run `linux/amd64` images).
- Docker 20.10+ and Docker Compose v2 (`docker compose`). Older
  `docker-compose` v1 also works.
- Port `8088` free on the host.
- 1 GB RAM and 2 GB disk are enough for a small team.

```bash
docker --version
docker compose version
```

If Compose is not installed, install the plugin or use `docker-compose`.

## 2. Copy the files to the server

Copy the whole folder (compose file, `.env`, `config.json`, `conf/`, `Dockerfile`
and the image archive) to the server, for example:

```bash
mkdir -p /root/focalboard/conf
scp -P 22 focalboard-lan-8.0.0-leave.tar.gz root@SERVER_IP:/root/focalboard/
scp -P 22 docker-compose.yml .env config.json Dockerfile root@SERVER_IP:/root/focalboard/
scp -P 22 conf/quotes.txt root@SERVER_IP:/root/focalboard/conf/
cd /root/focalboard
```

## 3. Load the image

```bash
docker load -i focalboard-lan-8.0.0-leave.tar.gz
docker images | grep focalboard-lan
```

You should see `focalboard-lan  8.0.0-leave` and `focalboard-lan  8.0.0`.
Verify the archive if you like:

```bash
sha256sum focalboard-lan-8.0.0-leave.tar.gz
# expected: 0daf6b7668c731d505479370e1a6c32c9e2b7486e8d678b56773518542524209
```

## 4. Configure

All settings are passed as environment variables in `docker-compose.yml`:
`config.json` key `serverRoot` becomes `FOCALBOARD_SERVERROOT`, and so on.

Three things must be checked before the first start:

1. `FOCALBOARD_SERVERROOT` - the address colleagues will use, e.g.
   `http://192.168.1.100:8088`. If it stays `localhost`, links inside push
   messages point to the container itself and do not work.
2. `ports` - `"8088:8088"` maps host port 8088 to container port 8088. If you
   change the host port, change `FOCALBOARD_PORT` only if you also changed the
   container port (normally keep both at 8088).
3. Data location - edit only one line in `.env`, `FB_DATA`:

```dotenv
# A: folder next to the compose file (default, easiest to back up)
FB_DATA=./data

# B: Docker named volume (best I/O on Linux)
# FB_DATA=focalboard_data

# C: absolute path on a dedicated disk
# FB_DATA=/data/focalboard
```

`.env` deliberately exposes a single switch; two mounts pointing at the same path
do not fail, the later one silently wins and the other directory stays empty.

Optional settings in `docker-compose.yml`:

- `FOCALBOARD_AUTHMODE=native` - built-in account/password login (required for
  the member panel and invite links).
- `FOCALBOARD_TOPBARENABLED=true` - show the top hint bar with quotes.
- `FOCALBOARD_DUEREMINDERENABLED` - system-wide default for due reminders. Each
  account can still configure its own webhook, channel, weekdays and time window
  in the web UI.
- `FOCALBOARD_SESSION_EXPIRE_TIME` / `FOCALBOARD_SESSION_REFRESH_TIME` - login
  lifetime in seconds (default 30 days / refresh every 5 hours).

Quotes are mounted read-write from `./conf/quotes.txt`; edit the file and refresh
the page, no restart needed.

## 5. Start

```bash
docker compose up -d
docker compose ps
docker compose logs -f --tail=50
```

Wait for the log line that the server is listening on `:8088`. Then open:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8088/
# 200
```

Open `http://SERVER_IP:8088/` in a browser, click **Register**, and create the
first account. The first account becomes the administrator. Invite colleagues
from the bottom-left user menu -> "Invite user".

## 6. Open it to the LAN

- Allow TCP 8088 in the host firewall (`firewalld`, `ufw` or the cloud security
  group).
- Access from a colleague's PC: `http://SERVER_IP:8088/`.
- For internet access, put an HTTPS reverse proxy in front of it (Nginx or
  Caddy) and bind the container to loopback only:

```yaml
ports:
  - "127.0.0.1:8088:8088"
```

Example Nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Set `FOCALBOARD_SERVERROOT` to the public HTTPS address afterwards.

## 7. Daily operation

```bash
docker compose logs -f --tail=100     # logs
docker compose restart                # restart
docker compose stop                   # stop
docker compose down                   # remove the container (data stays)
```

Data layout inside the container: `/opt/focalboard/data`
(`focalboard.db`, `files/`, `holidays-*.json`).

Backup (folder mode A):

```bash
docker compose stop
tar czf ~/fb-$(date +%F).tgz data
docker compose start
```

Named-volume mode B:

```bash
docker run --rm -v focalboard_data:/d -v "$PWD":/b alpine tar czf /b/data.tgz -C /d .
```

Restore is the same command with `xzf` instead of `czf`.

Upgrade: load the new image archive, then `docker compose up -d`. The data
volume is untouched; old leave records under the 12-month rule are rewritten
automatically when read.

## 8. Troubleshooting

| Symptom | Check |
| --- | --- |
| Container restarts in a loop | `docker compose logs`; usually invalid JSON in `config.json` or a port conflict |
| `pthread_create failed` on older Docker | keep `security_opt: [seccomp:unconfined]` in the compose file |
| Page loads but login fails | `FOCALBOARD_AUTHMODE` must be `native`; browser must have cookies enabled |
| Cannot register | An account already exists; sign in as admin and use "Invite user" |
| Push messages not received | webhook/secret, push weekdays and time window, "Push now" to bypass, then check logs for "due reminder" |
| Links in push open localhost | set `FOCALBOARD_SERVERROOT` to the LAN/public address and restart |
| Calendar has no holiday markers | the container needs outbound access to fetch the public holiday schedule; it is cached after success |
| Data missing after restart | check the `.env` `FB_DATA` setting; only one storage folder should be used |

## 9. Build from source instead (optional)

The folder also contains a `Dockerfile` for rebuilding. It expects a build
context that contains `server/` (Go sources), `pack/` (prebuilt front end),
`config.json` and `quotes.txt`:

```bash
docker build -t focalboard-lan:8.0.0-leave .
```

The image is `linux/amd64`. On ARM hosts (including Apple Silicon), build with
`--platform linux/amd64` and run under emulation, or rebuild the Go binary for
`linux/arm64` yourself.

## 10. Security

- Plain HTTP by default; keep it on a trusted LAN or put HTTPS in front.
- Never expose port 8088 directly to the internet.
- Webhook URLs and secrets grant bot permissions; do not commit them.
- Back up `data` regularly; the SQLite file is the single source of truth.

## 11. Notes

- All users belong to one team; boards can be shared per member.
- Leave data, push settings and preferences are stored per account in the
  database, not in the browser.
- The image contains no preinstalled accounts or data; the first registered
  account becomes the administrator.
