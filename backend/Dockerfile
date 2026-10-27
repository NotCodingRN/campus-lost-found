# Backend tier: Node.js + Express API
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies first (cached unless package files change)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Application code (SQL migrations live in src/migrations)
COPY src ./src

# Run as the unprivileged "node" user that ships with the image
USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
