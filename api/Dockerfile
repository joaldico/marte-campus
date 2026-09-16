FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

RUN apk add --no-cache openssl libc6-compat \
  && addgroup -S nestjs \
  && adduser -S nestjs -G nestjs

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
  && npm install prisma@6.19.3 ts-node typescript \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY tsconfig.json ./
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
  && chown -R nestjs:nestjs /app

USER nestjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
