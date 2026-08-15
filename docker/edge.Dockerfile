FROM oven/bun:1.3.14-alpine AS frontend-builder

WORKDIR /src

COPY management-center/package.json management-center/bun.lock ./
RUN bun install --frozen-lockfile

COPY management-center/ ./

ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN bun run build

FROM nginx:1.29-alpine

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /src/dist/ /usr/share/nginx/html/
