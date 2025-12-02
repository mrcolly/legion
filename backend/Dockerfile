# Backend Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for build
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build stage
FROM deps AS build
COPY . .
RUN npm run build

# Production dependencies only
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 legion

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

USER legion

EXPOSE 3000

CMD ["node", "dist/index.js"]
