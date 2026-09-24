# Один образ для всех сервисов; какой сервис запускать — задаёт аргумент SERVICE
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY common/package.json common/
COPY services/auth-service/package.json services/auth-service/
COPY services/clients-service/package.json services/clients-service/
COPY services/parking-service/package.json services/parking-service/
RUN npm ci --omit=dev
COPY common common
COPY services services
ARG SERVICE
ENV SERVICE=${SERVICE} NODE_ENV=production
USER node
CMD ["sh", "-c", "exec node services/$SERVICE/src/index.js"]
