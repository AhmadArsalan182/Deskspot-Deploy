# DeskSpot API image.
#
# Alpine is used because it already ships the OpenSSL libraries Prisma needs at
# runtime, so the image needs no OS packages beyond the Node base.
#
# The Prisma CLI is kept in the image because the container applies its own
# migrations and seed data on startup (`prisma migrate deploy`), so a reviewer
# only needs `docker compose up`.

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# Install before NODE_ENV=production so Prisma CLI (needed for migrate/seed) is present.
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrate, seed (idempotent), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
