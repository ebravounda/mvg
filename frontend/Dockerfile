# ====== Stage 1: Build PWA con Expo Web ======
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json yarn.lock* package-lock.json* ./
# Also copy scripts/ because package.json has a `preinstall` hook
# that runs ./scripts/check-pkg.js
COPY scripts ./scripts

# Install deps (yarn si existe lockfile, sino npm)
RUN if [ -f yarn.lock ]; then \
      npm install -g yarn && yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy the rest of the source
COPY . .

# Production env (BACKEND_URL is same domain via /api proxy)
RUN echo "EXPO_PUBLIC_BACKEND_URL=https://mvg.goroky.es" > .env

# Export PWA static
RUN npx expo export --platform web --output-dir /dist


# ====== Stage 2: Serve with nginx ======
FROM nginx:alpine

COPY --from=builder /dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
