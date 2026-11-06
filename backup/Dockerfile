# Serviço de backup do Architecture 360 — roda como cron no Railway (mesmo projeto, rede privada).
# Base postgres:18-alpine garante pg_dump da mesma versão maior do servidor (18.x). Node vem do apk.
FROM postgres:18-alpine
RUN apk add --no-cache nodejs ca-certificates
WORKDIR /app
COPY backup.mjs crypto.mjs ./
ENV NODE_ENV=production
ENTRYPOINT []
CMD ["node", "backup.mjs"]
