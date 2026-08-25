# Hermitage on Unraid

## Local installation before GHCR is published

Build Hermitage directly on the NAS:

```bash
cd /mnt/user/appdata/hermitage/app
docker build -t hermitage:0.6.1 .
```

Create persistent data storage:

```bash
mkdir -p /mnt/user/appdata/hermitage/data
```

Then run it, replacing the sample Navidrome IP:

```bash
docker rm -f hermitage 2>/dev/null || true

docker run -d \
  --name hermitage \
  --restart unless-stopped \
  -p 3001:3001 \
  -e HERMITAGE_DATA_DIR=/data \
  -e HERMITAGE_SESSION_TTL_DAYS=30 \
  -e HERMITAGE_COVER_CACHE_ITEMS=160 \
  -e HERMITAGE_COVER_DISK_CACHE_ITEMS=1200 \
  -e HERMITAGE_DEFAULT_SERVER_URL=http://192.168.1.50:4533 \
  -e HERMITAGE_LOCK_SERVER_URL=true \
  -e HERMITAGE_ALLOWED_HOSTS=192.168.1.50 \
  -e HERMITAGE_TRUST_PROXY=1 \
  -v /mnt/user/appdata/hermitage/data:/data \
  hermitage:0.6.1
```

If Hermitage is currently being accessed directly as `http://NAS-IP:3001`, leave `HERMITAGE_SECURE_COOKIES` unset/false. Once it is available exclusively through an HTTPS reverse proxy, recreate the container with:

```text
-e HERMITAGE_SECURE_COOKIES=true
```

Check status:

```bash
docker ps --filter name=hermitage
docker inspect --format '{{json .State.Health}}' hermitage
docker logs -f hermitage
```

Open:

```text
http://NAS-IP:3001
```

## After GHCR is live

You no longer need to build the image on the NAS:

```bash
docker pull ghcr.io/fenrisskoll/hermitage:latest
```

Then recreate the container using the GHCR image name instead of `hermitage:0.6.1`.

Your `/mnt/user/appdata/hermitage/data` bind mount remains unchanged, so container replacement does not remove persisted Hermitage sessions.

## Community Apps

`templates/hermitage.xml` and `ca_profile.xml` point at the FenrisSkoll repository/GHCR package. Publish the tagged GHCR image, test the template locally, validate the XML, then use Unraid Community Apps' submission flow and run **Validate and Scan** before submitting.
