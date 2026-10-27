# Frontend tier: React + TypeScript, built in one stage and served by Nginx in the next

# Stage 1: compile the React app into static files (dist/)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: only Nginx and the static files ship; Node and the source code stay behind
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
