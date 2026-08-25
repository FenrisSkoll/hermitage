# Contributing

Contributions and bug reports are welcome.

Before opening a pull request:

1. Run `npm install`.
2. Run `npm run build`.
3. Run `node --check server/index.mjs`.
4. If the change affects Docker behaviour, build the image with `docker build -t hermitage:test .`.
5. Keep changes focused and include screenshots for visible UI changes where useful.

For bug reports, include the Hermitage version, Navidrome version, browser, deployment method, relevant container logs, and reproducible steps. Do not post passwords, tokens or session files.
