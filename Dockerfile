# Образ застосунку (spec Завдання 4): один для стейджу й проду. На старті
# контейнер сам застосовує міграції (src/server.js), тож раннеру CI доступ до
# БД не потрібен. GIT_SHA вшивається в образ і видно на /version.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# лише залежності часу виконання; --ignore-scripts: хуки git в образі не потрібні
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
USER node
EXPOSE 3000
# node — PID 1 і сам отримує SIGTERM: /ready = 503, дороблення запитів, вихід
CMD ["node", "src/server.js"]
