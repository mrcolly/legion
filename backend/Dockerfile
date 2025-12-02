# Backend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Install all dependencies (including dev for testing)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Test stage - must pass before build
FROM deps AS test
COPY . .
RUN npm test
# Create marker file to prove tests passed
RUN echo "tests passed" > /app/.tests-passed

# Build stage - depends on test stage passing
FROM deps AS build
COPY . .
# Copy marker from test stage - this forces test stage to complete successfully
COPY --from=test /app/.tests-passed /app/.tests-passed
RUN npm run build

# Production dependencies only
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

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
