# Backend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy package files and install ALL dependencies
COPY package.json yarn.lock ./
RUN yarn install

# Copy source and build
COPY . .
RUN yarn build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Install production dependencies only
COPY package.json yarn.lock ./
RUN yarn install --production

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 legion
USER legion

EXPOSE 3000
CMD ["node", "dist/index.js"]
