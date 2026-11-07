# Hosting IronTrack on your own server

One small Linux server runs everything: the web app, the API and the database, behind automatic HTTPS.
A 1 vCPU / 2 GB VPS (about $5 to $10 a month at Hetzner, DigitalOcean, Vultr, etc.) is plenty to start.

You need:

1. **A domain** (or subdomain) such as `app.example.com`.
2. **A VPS** running Ubuntu 22.04 or 24.04 or Debian 12, with ports 80 and 443 open.
3. **An email provider** for password reset emails (Postmark, Resend, Brevo, Mailgun, Amazon SES...). Most have a free tier. Verify your sending domain with them (they walk you through SPF/DKIM DNS records) or reset emails will land in spam.

## First setup

1. **DNS.** Add an `A` record for your domain pointing at the server's IP address. Wait until `ping app.example.com` shows that IP.
2. **Install Docker** on the server:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. **Get the code:**
   ```bash
   git clone https://github.com/qbartlett/lifting-tracker.git /opt/irontrack
   cd /opt/irontrack/deploy
   cp .env.example .env
   nano .env        # set DOMAIN, POSTGRES_PASSWORD, SMTP_URL, MAIL_FROM
   ```
   Make the database password with `openssl rand -base64 24`.
4. **Start it:**
   ```bash
   docker compose up -d --build
   docker compose logs -f      # Ctrl+C to leave; look for "listening" and no errors
   ```
   The first start takes a few minutes to build. Then open `https://app.example.com`. The certificate is requested automatically (it can take a minute).
5. **Create your coach account** in the app, then use "Forgot your password?" once to confirm email works.

## Updating

```bash
cd /opt/irontrack && git pull
cd deploy && docker compose up -d --build
```
Database changes are applied automatically when the server starts. Users get the new app version the next time they open it.

## Backups (do this before real clients sign up)

```bash
chmod +x /opt/irontrack/deploy/backup.sh
crontab -e
# add this line (runs every night at 03:15, keeps the last 14):
15 3 * * * /opt/irontrack/deploy/backup.sh >> /var/log/irontrack-backup.log 2>&1
```
Run `./backup.sh` once by hand and check that a file appears in `deploy/backups/`.
**Copy backups off the server too** (another machine, or object storage with `rclone`); a backup on the same disk does not survive losing the server. Many VPS providers also offer whole-server snapshots for a few dollars a month.

**Restoring** into an empty database:
```bash
cd /opt/irontrack/deploy
docker compose stop api web
docker compose exec -T db psql -U irontrack -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c backups/irontrack-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U irontrack irontrack
docker compose start api web
```
Practise a restore on a spare machine once, so you know it works.

## Google Sheets (optional)

This lets a coach run athletes' plans from a Google Sheet: edit the sheet, and each athlete's app shows the change. It needs a free Google "service account" that acts as the app's own Google user. You set it up once.

1. Go to https://console.cloud.google.com and create a project (any name).
2. In that project open **APIs & Services, then Library**, search for **Google Sheets API**, and click **Enable**.
3. Open **IAM & Admin, then Service Accounts**, click **Create service account**, name it (for example `irontrack`), and finish without granting any roles.
4. Open the new service account, go to **Keys, then Add key, then Create new key, then JSON**. A file downloads. Keep it private: anyone with it can read every sheet shared with the account.
5. Put it on one line in `deploy/.env`, inside single quotes:
   ```bash
   echo "GOOGLE_SERVICE_ACCOUNT_JSON='$(tr -d '\n' < ~/Downloads/your-key.json)'" >> .env
   ```
   Check `.env` has just one `GOOGLE_SERVICE_ACCOUNT_JSON` line (delete the empty one from the example).
6. `docker compose up -d`, then `docker compose logs api` should say `Google Sheets plans enabled` and show the service account's address (it ends in `.iam.gserviceaccount.com`).

Coaches then open **Coach, then Sheets** in the app, which shows that address. They share their sheet with it as an **Editor** and paste the link.

Good to know:
- The app reads a connected sheet at most about once a minute, and only when someone opens their plan or the coach taps the refresh button. Google allows about 300 reads a minute per project, so one project comfortably serves many coaches.
- A sheet can be connected by only one coach at a time.
- Tabs the app creates need the Editor role; reading alone would only need Viewer.
- Rotate the key (Keys, then add a new one and delete the old) if it ever leaks.

## Checks and troubleshooting

- `docker compose ps`: all three services should be running (api "healthy").
- `docker compose logs api`: server messages. A warning about SMTP means reset emails are not being sent.
- `curl https://app.example.com/api/health` should answer `{"ok":true}`.
- Certificate not issued: DNS is not pointing at the server yet, or ports 80/443 are blocked by a firewall.
- Reset email not arriving: check your provider's activity log, then the spam folder, then that `MAIL_FROM` is on the verified domain.
- Security: keep the server updated (`apt upgrade`), allow only ports 22, 80 and 443 (`ufw allow 22,80,443/tcp && ufw allow 443/udp && ufw enable`), and use SSH keys instead of a password.

## Before real users

Publish a **privacy policy and terms**. The app stores workout data, which coaches can see. Say so, say who runs the service and how to ask for deletion (the Account dialog can already delete an account). A lawyer or a reputable policy generator is worth it here.

## Notes

- The Content-Security-Policy is in report-only mode: it logs problems in the browser console (F12) but blocks nothing. After a few days with no warnings, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `Caddyfile` and rebuild.
- This runs a single API process, which is right for hundreds to a few thousand users. Beyond that, rate limiting moves to Redis (see `server/README.md`).
