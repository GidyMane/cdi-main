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

RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  \
  large_client_header_buffers 4 16k; \
  proxy_buffer_size 128k; \
  proxy_buffers 4 256k; \
  proxy_busy_buffers_size 256k; \
  client_max_body_size 100M; \
  \
  location /api/ { \
    proxy_pass http://host.docker.internal:8000; \
    proxy_http_version 1.1; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header Connection ""; \
  } \
  \
  location /admin/ { \
    proxy_pass http://host.docker.internal:8000/admin/; \
    proxy_http_version 1.1; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header Connection ""; \
  } \
  \
  location /geoserver/ { \
    proxy_pass http://192.168.100.104:8090/geoserver/; \
    proxy_http_version 1.1; \
    proxy_set_header Host 192.168.100.104:8090; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header X-Forwarded-Host $host; \
    proxy_set_header Cookie $http_cookie; \
    proxy_set_header Referer $http_referer; \
    proxy_set_header Origin ""; \
    proxy_set_header Connection ""; \
    proxy_cookie_path /geoserver /geoserver; \
    proxy_cookie_domain 192.168.100.104 multihazard.rosewillbome.com; \
    proxy_buffering off; \
    proxy_request_buffering off; \
    proxy_redirect http://192.168.100.104:8090/geoserver/ /geoserver/; \
    proxy_connect_timeout 300; \
    proxy_send_timeout 300; \
    proxy_read_timeout 300; \
  } \
  \
  location /data/ { \
    proxy_pass http://192.168.100.104:8070/; \
    proxy_http_version 1.1; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header Connection ""; \
    proxy_connect_timeout 300; \
    proxy_send_timeout 300; \
    proxy_read_timeout 300; \
  } \
  \
  location /minio/ { \
    proxy_pass http://192.168.100.104:9000/; \
    proxy_http_version 1.1; \
    proxy_set_header Host $http_host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header Connection ""; \
    chunked_transfer_encoding off; \
    proxy_connect_timeout 300; \
    proxy_send_timeout 300; \
    proxy_read_timeout 300; \
  } \
  \
  location /minio-console/ { \
    proxy_pass http://192.168.100.104:9001/; \
    proxy_http_version 1.1; \
    proxy_set_header Host $http_host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_set_header Upgrade $http_upgrade; \
    proxy_set_header Connection "upgrade"; \
    proxy_connect_timeout 300; \
    proxy_send_timeout 300; \
    proxy_read_timeout 300; \
  } \
  \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
