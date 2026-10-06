#!/bin/sh
# Startup wrapper for the Base44 dev containers: install workspace dependencies
# from package-lock.json once, then hand over to the command passed in.
# Re-installs automatically whenever the lockfile changes.
set -e

stamp="node_modules/.base44-install-$(sha256sum package-lock.json | cut -c1-16)"
if [ ! -d "$stamp" ]; then
  echo "Installing workspace dependencies from package-lock.json"
  npm ci --no-audit --no-fund
  mkdir -p "$stamp"
fi

# npm nests expo-router under apps/mobile, but Expo's own CLI resolves it from the
# workspace root. Link it there so `expo start` can find it. Path is the container
# mount point used by docker-compose.base44.yml.
if [ -d /app/apps/mobile/node_modules/expo-router ] && [ ! -e /app/node_modules/expo-router ]; then
  ln -s /app/apps/mobile/node_modules/expo-router /app/node_modules/expo-router
fi

exec "$@"
