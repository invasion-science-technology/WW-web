# Deploy Field lab to EC2 (self-hosted GitHub runner)

Static Next.js export served by **nginx** on Ubuntu. **No CloudFront.** Builds run **on the EC2 instance** via a **self-hosted Actions runner** — no inbound SSH from GitHub IP ranges.

Repo: `invasion-science-technology/WW-web`

## Marketing site (unchanged)

| | Marketing (GitHub Pages) | Field lab (EC2) |
|--|--------------------------|-----------------|
| Workflow | [`deploy.yml`](../.github/workflows/deploy.yml) | [`deploy-ec2.yml`](../.github/workflows/deploy-ec2.yml) |
| URL | `https://<org>.github.io/WW-web/` | `https://app.yourdomain.com/prototype/` |
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

### 1.4 DNS

Create an **A record** at your DNS host:

```text
app.weedwatch.ai   →   54.1.2.3
```

Wait until `dig +short app.weedwatch.ai` returns that IP.

### 1.5 SSH

```bash
chmod 400 ~/path/to/weedwatch.pem
ssh -i ~/path/to/weedwatch.pem ubuntu@54.1.2.3
```

---

## Part 2 — Bootstrap EC2 (automated script)

On your laptop, clone the repo (or copy scripts). On EC2 you can clone or curl scripts.

**Option A — clone on EC2 (recommended)**

```bash
ssh -i ~/path/to/weedwatch.pem ubuntu@54.1.2.3

git clone https://github.com/invasion-science-technology/WW-web.git
cd WW-web/scripts/ec2
chmod +x setup-web-server.sh install-github-runner.sh publish-static.sh

sudo bash setup-web-server.sh \
  --domain app.weedwatch.ai \
  --email you@example.com
```

- `--email` runs **certbot** (HTTPS). Omit and add `--skip-certbot` if DNS is not ready yet.
- Re-run with `--email` once DNS works.

**Option B — HTTP only first**

```bash
sudo bash setup-web-server.sh --domain app.weedwatch.ai --skip-certbot
# after DNS + A record:
sudo certbot --nginx -d app.weedwatch.ai -m you@example.com --agree-tos
```

Check: `https://app.weedwatch.ai/` should show nginx default or 404 until first deploy.

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
| Site URL | `https://app.weedwatch.ai` |
| Redirect URLs | `https://app.weedwatch.ai/**`, `http://localhost:3000/**` |

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

- `https://app.weedwatch.ai/prototype/`
- `https://app.weedwatch.ai/prototype/admin/` (admin)

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
