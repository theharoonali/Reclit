# Deployment

| Piece | Where | How it ships |
| --- | --- | --- |
| API (`apps/api`) | EC2 `13.63.233.116` (Amazon Linux 2023), `https://api.reclit.com` | GitHub Actions on push to `main` → SSH → `deploy/api/deploy.sh` |
| Background tasks (`apps/api/src/trigger`) | Trigger.dev cloud, `prod` environment | same workflow, `trigger.dev deploy --env prod` after the API |
| Dashboard (`apps/dashboard`) | Vercel, `https://app.reclit.com` | Vercel's own Git integration on push to `main` |

## The API server

- **Checkout**: `/home/ec2-user/reclit`, cloned over SSH with a read-only
  GitHub deploy key (`~/.ssh/github_deploy`, repo → Settings → Deploy keys).
  The server never has local changes: every deploy resets to `origin/main`.
- **Process**: systemd unit `reclit-api` (`deploy/api/reclit-api.service`),
  `bun src/main.ts` on port 4001 (reachable only through nginx; not open in the
  security group), restarted on failure. Bun loads `apps/api/.env`.
- **Secrets**: `apps/api/.env` on the server only (mode 600), never in git.
  Production differs from local in `DEV=FALSE`, `ALLOWED_API_ORIGINS`,
  `NODE_ENV=production`, the Supabase **session pooler** `DATABASE_URL` (the
  box has no IPv6; the direct host is IPv6-only) and the `tr_prod_…`
  `TRIGGER_SECRET_KEY`.
- **nginx**: `/etc/nginx/conf.d/api.reclit.com.conf`
  (`deploy/api/api.reclit.com.conf`) proxies to 4001 with buffering off for
  the SSE subscriptions, 25 MB bodies. HTTPS by Let's Encrypt (`certbot
  --nginx`, renewed by `certbot-renew.timer`); the DNS record is DNS-only.
- **Swap**: 2 GB `/swapfile` for installs on the 4 GB box.

## CI/CD (`.github/workflows/deploy-api.yml`)

On a push to `main` touching the API, the packages, the lockfile or the
deploy files (or by hand: Actions → Deploy API → Run workflow):

1. **api** — SSH in with a key only CI holds and run `deploy/api/deploy.sh`:
   reset to `origin/main`, `bun install`, `prisma generate`,
   `prisma migrate deploy`, restart the service, wait for `/health`.
2. **trigger** — `trigger.dev deploy --env prod` from `apps/api`.

Repository secrets: `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_KNOWN_HOSTS`,
`TRIGGER_ACCESS_TOKEN`. One deploy runs at a time.

## By hand

```bash
ssh -i ignore/Reclit-key.pem ec2-user@13.63.233.116
bash ~/reclit/deploy/api/deploy.sh          # deploy main now
sudo journalctl -u reclit-api -f            # logs
sudo systemctl restart reclit-api           # after editing apps/api/.env
```
