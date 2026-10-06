# Development-only base image: matches the pinned toolchain in package.json
# (node >=22.9, npm 11.19.1). Application dependencies are installed from the
# lockfile at container startup so the bind-mounted source stays live.
FROM node:24-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global npm@11.19.1
WORKDIR /app
