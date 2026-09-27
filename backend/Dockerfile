FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci

FROM golang:1.25.12-alpine AS wacli-builder
RUN apk add --no-cache git gcc musl-dev sqlite-dev
ENV CGO_ENABLED=1
RUN GOBIN=/out go install -tags sqlite_fts5 github.com/openclaw/wacli/cmd/wacli@v0.15.0

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY backend/package.json ./backend/package.json
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
RUN npm run build:backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache fontconfig ttf-dejavu sqlite-libs
COPY --from=wacli-builder /out/wacli /usr/local/bin/wacli
COPY scripts/start-backend.sh /usr/local/bin/start-backend.sh
RUN chmod +x /usr/local/bin/start-backend.sh
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY backend/package.json ./backend/package.json
COPY display-web ./display-web
COPY --from=build /app/backend/dist ./backend/dist
EXPOSE 4000
CMD ["/usr/local/bin/start-backend.sh"]
