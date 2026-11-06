# Serviço de backup do Architecture 360 — roda como cron no Railway (mesmo projeto, rede privada).
FROM node:22-alpine
RUN apk add --no-cache postgresql16-client ca-certificates
WORKDIR /app
COPY backup.mjs crypto.mjs ./
ENV NODE_ENV=production
CMD ["node", "backup.mjs"]
