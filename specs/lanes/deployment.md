# Deployment runbook

## Target

- **URL:** `https://multiprice.farealahmed.com`
- **Host:** dedicated DigitalOcean Docker droplet, operated by the non-root `deploy` user.
- **Topology:** Caddy is the only public service. It proxies the frontend; the frontend's build-time `BACKEND_ORIGIN=http://backend:3001` keeps API and authentication traffic on the Compose `internal` network. MongoDB and the backend have no published host ports.

## Required configuration

The droplet owns `~/multiprice/infra/.env`. It is copied from `infra/.env.example` only when absent and is never replaced by deployment. Before the first release, set a unique value:

```sh
ssh deploy@multiprice.farealahmed.com
cd ~/multiprice
cp infra/.env.example infra/.env
chmod 600 infra/.env
# Edit infra/.env and set JWT_SECRET to a unique value generated with:
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The repository requires these GitHub Actions secrets:

| Secret | Value |
|--------|-------|
| `DEPLOY_SSH_KEY` | Private key authorized for the non-root `deploy` user. |
| `DEPLOY_HOST` | `multiprice.farealahmed.com`. |
| `DEPLOY_USER` | `deploy`. |
| `DEPLOY_KNOWN_HOSTS` | The droplet's full, independently verified `known_hosts` entry. Obtain the key fingerprint during droplet provisioning through the DigitalOcean console or another trusted channel; do not derive this secret with `ssh-keyscan` during deployment. |

The workflow has no permission to create these secrets or configure protection. In GitHub **Settings → Branches**, require the `backend-ci` and `frontend-ci` checks from the `ci` workflow for `main`.

## Release

A push to `main` runs both CI jobs, builds both Linux/amd64 images once, then deploys their artifacts in one serialized job. To deliberately redeploy the current `main` revision without a new commit:

```sh
gh workflow run ci.yml --repo farealahmed/multiprice --ref main
gh run list --repo farealahmed/multiprice --workflow ci.yml --branch main --limit 1
gh run watch <run-id> --repo farealahmed/multiprice --exit-status
```

The workflow preserves the droplet's `infra/.env`, transfers `infra/` and both image tarballs, loads both images, starts the stack without building, and smoke-tests `/api/health` and `/` through the public hostname.

## Rollback

The deployment workflow builds from the exact `main` revision it releases. Roll back a bad production revision by reverting it on `main` (or merging a revert PR when branch protection requires it); the resulting push rebuilds and deploys the previous source state:

```sh
git revert --no-edit <bad-main-commit>
git push origin main
```

Do not overwrite `infra/.env` during rollback. If the failing deployment changed an image digest, verify the reverted `infra/compose.yml` restores the prior reviewed digest before pushing.

## Post-deployment verification

After the first deployment and after an infrastructure change, verify in a browser with no existing session:

1. `https://multiprice.farealahmed.com` serves a valid certificate and redirects HTTP to HTTPS.
2. Register, enter the PDF sample, confirm `421.50`, finalize it, and confirm later edits fail.
3. Confirm Caddy exposes the documented HSTS, anti-sniffing, framing, and referrer-policy headers.
4. Confirm the health endpoint responds through the public hostname and no MongoDB or backend port is publicly reachable.
