# Backend Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app

# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy package files and yarn config
COPY package.json yarn.lock .yarnrc.yml ./

# Install ALL dependencies
RUN yarn install || yarn install --immutable

# Copy source (for dev mode)
COPY . .

# Builder stage (for production)
FROM deps AS builder
RUN yarn build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built files and node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 legion
USER legion

EXPOSE 3000
CMD ["node", "dist/index.js"]
