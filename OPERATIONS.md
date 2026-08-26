# Go Web Platform Operations Runbook

## Surface Rebrand Seed Rollout

Migration `048_go_web_platform_get_started.sql` upgrades only the exact pristine
legacy `get-started` page. Before applying it, back up each tenant and record the
page title, description, ownership, visibility, SEO fields, content hash, and
`landing_page_slug`. Customized pages and homepage selections must remain
unchanged.

Apply the migration before shipping the matching backend and frontend. For a
tenant whose pristine page changed, remove only its Redis semantic SEO keys for
`/`, `/page/get-started`, and `/sitemap.xml` under the existing
`<client>:seo:meta:v3:` namespace. Do not flush Redis: other tenant caches,
sessions, security budgets, and realtime state are unrelated. Restart/recreate
the tenant backend as part of the release, then verify `/health`, `/ready`, `/`,
`/page/get-started`, and raw SSR metadata. A second migration run must report no
page change.

The durable contract is `.specs/operations_readiness_spec`. These commands are
the repeatable operator sequence; run them from the repository root.

## Release gate

```sh
grengo migrate <tenant>
grengo verify release <tenant> --url https://tenant.example
grengo load-check http://localhost/ready --requests 50 --concurrency 4 --max-average-ms 500
grengo load-check ws://localhost/ws --websocket --requests 20 --concurrency 4 --max-average-ms 500
```

The JSON release/load decision must be `proceed`. Record the revision, latest
migration, latency/error result, and the operator diagnostics DB-pool and queue
snapshot. Never use the load command against production or a third party;
`--allow-remote` is only an explicit acknowledgement for an approved non-prod
target.

## Backup verification

Migration safety dumps retain the newest five copies and declare seven-day
retention. Portable tenant/node archives declare 30-day retention.

```sh
grengo verify backup <backup.sql-or-archive.tar.gz>
```

The adjacent mode-0600 manifest must match digest, size, filename, class, and
retention metadata. `encryption_required_at_rest` is a storage requirement, not
a claim that the local file is encrypted. Move retained copies only to encrypted,
access-controlled backup storage.

## Isolated restore drill

1. Verify the backup manifest before reading it.
2. Create a uniquely named disposable database/tenant. Refuse an existing name.
3. Restore the dump, then apply all migrations in normal filename order.
4. Compare representative source/restore counts for users, pages, events, and
   products; verify `service_incidents` and `service_incident_events` exist.
5. Start the disposable backend with its own DB, Redis prefix, uploads root, and
   port. Require `/ready` to report every required component operational.
6. Connect with a non-superuser application role and prove incident audit hard
   deletion is rejected.
7. Record archive SHA-256, source revision, timestamps, counts, readiness result,
   and any warnings. Remove only the exact disposable target after retaining the
   evidence. Never restore over an existing tenant.

The 2026-08-23 local drill used `home-backup-20260823-150318.sql`: after applying
migration 040, source and restore both contained 2 users, 7 pages, 288 events,
and 1 product; both status tables existed, the disposable backend reported all
four required readiness components operational, and a direct non-superuser
delete probe was denied. The disposable database, role, and container were
removed; the verified source backup was retained under its declared seven-day
class.
