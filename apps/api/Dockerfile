# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build -w apps/api && npm prune --omit=dev -w apps/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
