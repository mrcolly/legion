# Frontend Dockerfile
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

# Build with production API URL
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN yarn build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
