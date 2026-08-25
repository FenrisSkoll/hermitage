# Publishing Hermitage to GitHub and GHCR

The repository includes two workflows:

- `.github/workflows/ci.yml` — validates the application on pushes and pull requests.
- `.github/workflows/publish.yml` — publishes multi-architecture images to GHCR when a semantic version tag such as `v0.6.1` is pushed.

The publish workflow creates:

```text
ghcr.io/<github-user>/hermitage:0.6.1
ghcr.io/<github-user>/hermitage:0.6
ghcr.io/<github-user>/hermitage:latest
```

for `linux/amd64` and `linux/arm64`.

The workflow authenticates to GHCR using the repository `GITHUB_TOKEN`, so a separate registry password is not required for normal tagged releases.
