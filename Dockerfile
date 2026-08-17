FROM node:24-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/.npmrc ./app/
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile

FROM deps AS app-build
COPY app ./app
RUN pnpm --filter app build

FROM nginx:1.29-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=app-build /repo/app/build /usr/share/nginx/html

FROM deps AS server
COPY server ./server
WORKDIR /repo/server
ENV NODE_ENV=production PORT=5178
EXPOSE 5178
CMD ["sh", "-c", "pnpm exec drizzle-kit push --force && exec node src/index.ts"]
