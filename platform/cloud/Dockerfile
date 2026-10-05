FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY dist ./dist
COPY platform/cloud ./platform/cloud
COPY scripts/cloud.mjs scripts/runtime.mjs scripts/cloud-backup.mjs ./scripts/
COPY workers ./workers
COPY adapters ./adapters
COPY examples ./examples
COPY LICENSE ./LICENSE
COPY docs/THIRD-PARTY-NOTICES.md ./licenses/THIRD-PARTY-NOTICES.md
RUN mkdir -p /workspace/.runtime/eda /workspace/.runtime/cloud /workspace/.runtime/backups && chown -R node:node /workspace/.runtime
USER node
ENV REGISTER_BIND=0.0.0.0 REGISTER_PORT=18766 MOS_WORKSPACE=/workspace
EXPOSE 18766
CMD ["node", "scripts/cloud.mjs"]
