# Stage 1: Build TypeScript to JavaScript
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./

RUN npm ci || npm install

COPY src/ ./src/

RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
