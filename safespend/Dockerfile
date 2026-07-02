# SafeSpend — single-container image: builds the SPA, serves API + static.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY db ./db
COPY server ./server
COPY shared ./shared
COPY intelligence ./intelligence
COPY scripts ./scripts
COPY drizzle.config.ts tsconfig.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:5001/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
