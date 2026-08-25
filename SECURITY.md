# Security Policy

Hermitage is a web client/proxy for a Navidrome/OpenSubsonic server. Treat the container and its `/data` directory as security-sensitive because persisted sessions contain encrypted Navidrome credentials.

## Recommended deployment

- Keep `/data` private and backed up.
- Use `HERMITAGE_ALLOWED_HOSTS` when the instance is reachable by untrusted users.
- Prefer single-server mode with `HERMITAGE_DEFAULT_SERVER_URL` and `HERMITAGE_LOCK_SERVER_URL=true` for public deployments.
- Enable `HERMITAGE_SECURE_COOKIES=true` when Hermitage is served exclusively over HTTPS.
- Do not expose Unraid, Docker, NGINX Proxy Manager or other management interfaces merely because Hermitage itself is public.
- Keep Hermitage and Navidrome updated.

## Reporting a vulnerability

Please report security issues privately to the repository maintainer rather than opening a public issue containing exploit details. Add a GitHub Security Advisory/reporting channel to the repository before public release if you want to accept private reports through GitHub.
