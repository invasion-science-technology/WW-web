# Deploy Field lab to EC2 (self-hosted GitHub runner)

Static Next.js export served by **nginx** on Ubuntu. **No CloudFront.** Builds run **on the EC2 instance** via a **self-hosted Actions runner** — no inbound SSH from GitHub IP ranges.

Repo: `invasion-science-technology/WW-web`

## Marketing site (unchanged)

| | Marketing (GitHub Pages) | Field lab (EC2) |
|--|--------------------------|-----------------|
| Workflow | [`deploy.yml`](../.github/workflows/deploy.yml) | [`deploy-ec2.yml`](../.github/workflows/deploy-ec2.yml) |
| URL | `https://<org>.github.io/WW-web/` | `http://<elastic-ip>/prototype/` or `https://prototype.weedwatch.ai/prototype/` |
| Base path | `/WW-web` | none |
| Triggers on `main` | **Every push** | **Prototype-related paths only** (or manual) |

Editing `components/Hero.tsx`, `app/page.tsx`, etc. only redeploys **Pages**, not EC2. The two workflows are independent; an offline EC2 runner does not block Pages.

## Architecture

```text
git push main  →  GitHub Actions workflow
                      ↓ (queued job)
                 EC2 self-hosted runner (same box as nginx)
                      ├─ npm ci && npm run build  →  out/
                      └─ rsync  →  /var/www/weedwatch/
Browser  →  https://app.yourdomain.com/prototype/
         →  Supabase Auth (configure Site URL to match)
```

---

## Part 1 — AWS (one time)

### 1.1 Security group

EC2 → Security groups → Create `weedwatch-web-sg`:

| Type  | Port | Source        |
|-------|------|---------------|
| SSH   | 22   | **Your IP**/32 only |
| HTTP  | 80   | 0.0.0.0/0     |
| HTTPS | 443  | 0.0.0.0/0     |

Do **not** open SSH to `0.0.0.0/0`.

### 1.2 Launch EC2

| Setting        | Value                    |
|----------------|--------------------------|
| AMI            | Ubuntu 24.04 LTS         |
| Type           | **t3.small** (2 GB RAM)  |
| Key pair       | Download `.pem`          |
| Security group | `weedwatch-web-sg`       |
| Storage        | 20 GiB gp3               |

### 1.3 Elastic IP

Allocate → Associate with the instance. Note the IP (e.g. `54.1.2.3`).

### 1.4 DNS (optional for now)

**No domain yet?** Skip DNS — use **Elastic IP** only (Step 2 with `--ip-only`).

**When you control `weedwatch.ai` DNS**, prefer a **subdomain** (not a path on the marketing site):

```text
prototype.weedwatch.ai   A   54.1.2.3
```

Then: `sudo bash setup-web-server.sh --domain prototype.weedwatch.ai --email you@example.com`

**Why not `weedwatch.ai/lab` on GitHub Pages?** Pages and EC2 are different hosts. A path like `weedwatch.ai/lab` on the **same** URL as marketing needs a reverse proxy or pointing the apex at EC2. A **subdomain** is the simple fix.

### 1.5 SSH

```bash
chmod 400 ~/path/to/weedwatch.pem
ssh -i ~/path/to/weedwatch.pem ubuntu@54.1.2.3
```

---

## Part 2 — Bootstrap EC2 (automated script)

On EC2 (after `git clone` …/WW-web and `cd scripts/ec2`, `chmod +x *.sh`):

### Option A — No domain (Elastic IP only) ← start here

```bash
sudo bash setup-web-server.sh --ip-only
```

The script prints your public IP. Open:

- `http://54.1.2.3/` (marketing copy on EC2)
- `http://54.1.2.3/prototype/` (Field lab)

**HTTPS:** Let’s Encrypt does **not** support bare IPs. Use **HTTP** for now, or add a subdomain later.

**Supabase** → Authentication → URL configuration:

| Field | Value |
|--------|--------|
| Site URL | `http://54.1.2.3` (your Elastic IP) |
| Redirect URLs | `http://54.1.2.3/**` |

### Option B — Subdomain under weedwatch.ai (when DNS is ready)

```bash
# DNS first: prototype.weedwatch.ai  A  →  Elastic IP
sudo bash setup-web-server.sh \
  --domain prototype.weedwatch.ai \
  --email you@example.com
```

Use `https://prototype.weedwatch.ai/prototype/` and set Supabase Site URL to that host (with `https`).

### Option C — Domain known but DNS not propagated yet

```bash
sudo bash setup-web-server.sh --domain prototype.weedwatch.ai --skip-certbot
# later:
sudo certbot --nginx -d prototype.weedwatch.ai -m you@example.com --agree-tos
```

---

## Part 3 — GitHub runner (one time per EC2)

### 3.1 Repo secrets

GitHub → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |

Do **not** set `NEXT_PUBLIC_PROTO_EMAIL` / `PASSWORD` for production.

(Unset demo vars — Supabase mode is used when URL + anon key are present.)

### 3.2 Registration token

**GitHub → Settings → Actions → Runners → New self-hosted runner → Linux**

Copy the repo URL and generate a token, **or** on your laptop with [`gh`](https://cli.github.com/) logged in:

```bash
gh api --method POST \
  repos/invasion-science-technology/WW-web/actions/runners/registration-token \
  --jq .token
```

Token expires in about **one hour**.

### 3.3 Install runner on EC2

Still on EC2, in `WW-web/scripts/ec2`:

```bash
export RUNNER_TOKEN='paste-token-here'
./install-github-runner.sh
```

Verify: GitHub → **Settings → Actions → Runners** — status **Idle**, labels include `weedwatch`.

Runner runs as systemd service `actions.runner.*` — survives reboot.

### 3.4 Push workflow file

Ensure `.github/workflows/deploy-ec2.yml` is on `main` (merge/push from your branch).

---

## Part 4 — Supabase

**Authentication → URL configuration**

| Field | Value |
|--------|--------|
| Site URL | Same origin you use in the browser (`http://<elastic-ip>` or `https://prototype.weedwatch.ai`) |
| Redirect URLs | That origin with `/**`, plus `http://localhost:3000/**` |

Admin user:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where email = 'you@example.com';
```

---

## Part 5 — First deploy

```bash
# Local: merge workflow to main, or on GitHub → Actions → Deploy to EC2 → Run workflow
```

Watch **Actions** tab. Job must run on `weedwatch` runner.

Then open:

- `http://<elastic-ip>/prototype/` (or your subdomain equivalent)
- `…/prototype/admin/` (admin)

---

## Day-to-day

| Action | How |
|--------|-----|
| Deploy | Push/merge to `main` (automatic) or **Actions → Deploy to EC2 → Run workflow** |
| Logs | EC2: `journalctl -u 'actions.runner.*' -f` |
| Manual publish | On EC2 in repo: `STATIC_EXPORT=1 npm run build && ./scripts/ec2/publish-static.sh` |

### GitHub Pages

Leave **`deploy.yml` as-is** — it is the canonical marketing deploy. Do not disable it when adding EC2; they serve different URLs and configs.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Workflow stuck “Queued” | Runner offline — `sudo ./svc.sh status` in `/home/ubuntu/actions-runner` |
| Runner not listed | Re-run `install-github-runner.sh` with fresh `RUNNER_TOKEN` |
| `npm run build` OOM | Upgrade to t3.small; add swap: `sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| 404 on `/prototype` | Use trailing slash: `/prototype/` |
| Auth fails | Re-check Supabase Site URL; secrets in GitHub; rebuild via Actions |
| certbot fails | DNS A record must point to Elastic IP; port 80 open |

### Replace runner

```bash
cd /home/ubuntu/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh uninstall
cd ~ && rm -rf /home/ubuntu/actions-runner
export RUNNER_TOKEN='...'
./install-github-runner.sh
```

---

## Later: tasking, S3, Stripe

- **S3 buckets** (private): imagery — not served by this nginx host initially.
- **Lambda / Batch**: separate workflows; code in same repo.
- **Stripe / OneAtlas**: need server routes → add ECS or `next start` on EC2; static-only path is not enough.

See [`PROTOTYPE_AWS.md`](../PROTOTYPE_AWS.md) and [`docs/DATA_ACQUISITION_PIPELINE.md`](DATA_ACQUISITION_PIPELINE.md).
