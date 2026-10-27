FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
COPY frontdesk/ /build/frontdesk/
RUN npm run build && npm run build:frontdesk

FROM node:22-alpine AS backend-build
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache postgresql-client
WORKDIR /app
COPY --from=backend-build /build/backend/dist ./backend/dist
COPY --from=backend-build /build/backend/node_modules ./backend/node_modules
COPY --from=backend-build /build/backend/package.json ./backend/package.json
COPY --from=backend-build /build/backend/tsconfig.json ./backend/tsconfig.json
COPY --from=backend-build /build/backend/prisma ./backend/prisma
COPY --from=backend-build /build/backend/scripts ./backend/scripts
# Seed scripts import application helpers from src.
COPY --from=backend-build /build/backend/src ./backend/src
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
COPY --from=frontend-build /build/frontdesk/dist ./frontdesk/dist
WORKDIR /app/backend
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/demo-init.cjs && exec node dist/index.js"]
