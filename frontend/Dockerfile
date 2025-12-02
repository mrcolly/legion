# Frontend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
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

# Build with production API URL
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
