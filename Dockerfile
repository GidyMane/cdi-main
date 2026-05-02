# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --force
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Handle client-side routing and proxy configuration
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  \
  location /api/ { \
    proxy_pass http://host.docker.internal:8000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
  } \
  \
  location /geoserver/ { \
    proxy_pass http://192.168.100.104:8090/geoserver/; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header X-Forwarded-Host $host; \
    proxy_redirect http://192.168.100.104:8090/ /; \
  } \
  \
  location /minio/ { \
    proxy_pass http://192.168.100.104:9000/; \
    proxy_set_header Host $http_host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_connect_timeout 300; \
    proxy_http_version 1.1; \
    proxy_set_header Connection ""; \
    chunked_transfer_encoding off; \
  } \
  \
  location /minio-console/ { \
    proxy_pass http://192.168.100.104:9001/; \
    proxy_set_header Host $http_host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header Upgrade $http_upgrade; \
    proxy_set_header Connection "upgrade"; \
    proxy_http_version 1.1; \
  } \
  \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
