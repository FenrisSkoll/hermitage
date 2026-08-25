# Changelog

## 0.6.1 - 2026-08-25

- Stream artwork cache misses immediately to the browser rather than buffering the entire Navidrome response first.
- Disable NGINX proxy buffering for artwork responses.
- Add persistent artwork caching under `/data/cover-cache` with configurable entry limit.
- Coalesce concurrent artwork requests and standardise artwork size buckets.
- Improve synced-lyrics timing with a local high-frequency media clock while lyrics are visible.
- Add user-configurable lyrics timing offset and make fullscreen/normal lyrics offset handling consistent.
- Allow direct HTTP LAN diagnostics to establish a host-local session even when secure cookies are enabled for the HTTPS reverse-proxy path.

## 0.6.0 - 2026-08-25

Release-candidate/productisation pass for public GitHub and container distribution.

- Added optional single-server mode with `HERMITAGE_DEFAULT_SERVER_URL` and `HERMITAGE_LOCK_SERVER_URL`.
- Added public `/api/config` deployment metadata endpoint.
- Expanded `/api/health` and added a Docker `HEALTHCHECK`.
- Added per-client login attempt rate limiting.
- Added configurable Express reverse-proxy trust via `HERMITAGE_TRUST_PROXY`.
- Added baseline HTTP security headers.
- Added a React error boundary and reduced-motion support.
- Added release/about information to Settings.
- Added GitHub Actions CI and multi-architecture GHCR publishing workflows.
- Added Docker Compose examples for local builds and GHCR deployments.
- Added Unraid Community Apps metadata/template starter files.
- Added MIT license, security policy, contribution guide and release documentation.
- Retains all v0.5.1 UI, fullscreen visualizer, library, lyrics, queue, playlist, PWA and playback functionality.

## 0.5.1

- Ultrawide Home shelves use available width and respect album-grid density.
- Home artist links navigate to artist pages.

Earlier pre-release changes are documented in Git history and prior releases.
