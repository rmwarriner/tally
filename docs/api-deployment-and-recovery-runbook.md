# API Deployment And Recovery Runbook

Last reviewed: 2026-04-06

## Selected Default Target

The default production-oriented deployment target for `apps/api` is:

- one Linux host
- one `systemd` service for the API process
- one reverse proxy or load balancer in front of the API if public HTTP exposure is needed
- one local persistent filesystem for workspace documents and repository-managed backups

This is intentionally conservative. The current API runtime, workspace persistence model, and backup flows are all optimized for a single durable node rather than a distributed deployment.

## Host Layout

Recommended layout on the host:

- application checkout: `/srv/tally`
- runtime env file: `/etc/tally/api.env`
- auth token file: `/etc/tally/api-token`
- data directory: `/var/lib/tally/api`
- backup directory:
  `/var/lib/tally/api/_backups`
- service user:
  `tally`

Recommended ownership and permissions:

- `/etc/tally/api.env`: readable by root and the `tally` service user
- `/etc/tally/api-token`: `0600`, owned by root or the service user
- `/var/lib/tally/api`: writable only by the service user
- `_backups` kept on the same durable volume as the workspace data unless a separate backup copy job is configured

## Runtime Configuration

Use file-backed auth secrets instead of inline token env vars.

Example `/etc/tally/api.env`:

```dotenv
TALLY_API_RUNTIME_MODE=production
TALLY_API_HOST=127.0.0.1
TALLY_API_PORT=4000
TALLY_DATA_DIR=/var/lib/tally/api
TALLY_API_AUTH_TOKEN_FILE=/etc/tally/api-token
TALLY_API_BODY_LIMIT_BYTES=1048576
TALLY_API_RATE_LIMIT_WINDOW_MS=60000
TALLY_API_RATE_LIMIT_READS=120
TALLY_API_RATE_LIMIT_MUTATIONS=30
TALLY_API_RATE_LIMIT_IMPORTS=10
TALLY_API_SHUTDOWN_TIMEOUT_MS=10000
TALLY_LOG_LEVEL=info
TALLY_LOG_FORMAT=json
```

Do not set:

- `TALLY_API_SEED_DEMO_WORKSPACE`
  production mode rejects it
- inline auth tokens if a file-backed secret is available

## Rename Migration Appendix (Old -> New)

Transition mapping:

- env prefix: `GNUCASH_NG_*` -> `TALLY_*`
- api key header: `x-gnucash-ng-api-key` -> `x-tally-api-key`
- service name: `gnucash-ng-api` -> `tally-api`
- service user/group: `gnucash-ng` -> `tally`
- default paths:
  - `/srv/gnucash-ng` -> `/srv/tally`
  - `/etc/gnucash-ng` -> `/etc/tally`
  - `/var/lib/gnucash-ng` -> `/var/lib/tally`

Compatibility behavior:

- runtime accepts legacy `GNUCASH_NG_*` env keys during transition
- runtime accepts legacy `x-gnucash-ng-api-key` during transition
- if both legacy and canonical values are set, canonical `TALLY_*` values win

## Systemd Service

Example unit:

```ini
[Unit]
Description=Tally API
After=network.target

[Service]
Type=simple
User=tally
Group=tally
WorkingDirectory=/srv/tally
EnvironmentFile=/etc/tally/api.env
ExecStart=/usr/bin/pnpm --filter @tally/api start
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

After changing runtime config:

1. `sudo systemctl daemon-reload`
2. `sudo systemctl restart tally-api`
3. `sudo systemctl status tally-api`

## Reverse Proxy Expectations

If a reverse proxy is used:

- terminate TLS at the proxy
- forward requests to `127.0.0.1:4000`
- preserve `x-request-id` when already present or generate one upstream if desired
- do not cache API responses
- restrict public access if the API is intended for a private household deployment only

## Deployment Procedure

1. Pull the target revision into `/srv/tally`.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm ci:verify`.
4. Confirm `/etc/tally/api.env` and the auth token file exist.
5. Confirm `/var/lib/tally/api` exists and is writable by the service user.
6. Restart the service with `systemctl`.
7. Run the smoke checks below.

## Smoke Checks

Run after each deployment:

1. `curl -sf http://127.0.0.1:4000/healthz`
2. `curl -sf http://127.0.0.1:4000/readyz`
3. `curl -sf http://127.0.0.1:4000/metrics | head`
4. `curl -sf -H "Authorization: Bearer $(cat /etc/tally/api-token)" http://127.0.0.1:4000/api/workspaces/workspace-household-demo`
   Only if the deployment intentionally carries the demo workspace or another known workspace id.
5. `journalctl -u tally-api -n 50 --no-pager`

Success criteria:

- `/healthz` and `/readyz` return `200`
- `/metrics` returns plain text
- the authenticated workspace read succeeds for a known workspace id
- startup logs show production runtime config without leaking secret material

## Backup Operations

The API can create repository-managed backups through:

- `POST /api/workspaces/:workspaceId/backups`
- `GET /api/workspaces/:workspaceId/backups`
- `POST /api/workspaces/:workspaceId/backups/:backupId/restore`

Operational guidance:

- create a fresh API backup before any manual restore or risky maintenance step
- copy the `_backups` directory to an external durable store on a schedule outside the API process
- treat repository-managed backups as application-level recovery points, not the only disaster-recovery control

## Recovery Runbook

### Case 1: Service Fails To Start

1. `systemctl status tally-api`
2. `journalctl -u tally-api -n 100 --no-pager`
3. Check the env file and token file paths.
4. Confirm the data directory exists and is writable.
5. Fix config, then restart the service.

Most likely causes:

- missing or unreadable auth secret file
- invalid runtime env value
- data directory permission error
- dependency install drift on the host

### Case 2: Workspace Data Suspected Corrupt

1. Stop the API: `sudo systemctl stop tally-api`
2. Copy the current workspace JSON and `_backups` directory to a dated incident folder.
3. Inspect available backups through the filesystem or the API once it is safe to start read-only checks.
4. Restore the selected backup either:
   - through the authenticated backup restore endpoint, or
   - by replacing the workspace JSON manually from a validated backup file if the API cannot start
5. Start the API again.
6. Run smoke checks.
7. Preserve the pre-restore files for incident review.

### Case 3: Host Loss Or Disk Loss

1. Provision a replacement Linux host.
2. Restore the application checkout or redeploy from source control.
3. Restore `/etc/tally/api.env` and the auth token file from secure configuration storage.
4. Restore `/var/lib/tally/api` from the latest durable backup copy.
5. Start the service.
6. Run smoke checks.

### Case 4: Bad Application Deploy

1. Stop the API.
2. Check out the previous known-good revision.
3. Run `pnpm install --frozen-lockfile`.
4. Start the service again.
5. If the bad deploy also mutated workspace data unexpectedly, create a fresh backup of the current state before deciding whether a workspace restore is required.

## Retention Guidance

Use these defaults unless operational needs say otherwise:

- keep at least 7 daily external copies of the `_backups` directory
- keep at least 4 weekly external copies
- keep at least 3 monthly external copies
- verify restoreability periodically by restoring into a non-production data directory and running the API smoke checks

## Out Of Scope For This Runbook

This runbook does not yet define:

- multi-node deployment
- distributed tracing or external metrics backends
- encryption-at-rest and key rotation policy
- automated object-storage backup sync implementation
