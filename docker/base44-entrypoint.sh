#!/bin/sh
# Startup wrapper for the Base44 dev container: install workspace dependencies
# from package-lock.json once, then hand over to the command passed in.
# Re-installs automatically whenever the lockfile changes.
set -e

stamp="node_modules/.base44-install-$(sha256sum package-lock.json | cut -c1-16)"
if [ ! -d "$stamp" ]; then
  echo "Installing workspace dependencies from package-lock.json"
  npm ci --no-audit --no-fund
  mkdir -p "$stamp"
fi

exec "$@"
