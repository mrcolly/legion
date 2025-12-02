# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Install ALL dependencies and build
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# Build with production API URL
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
