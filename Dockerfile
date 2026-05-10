# =========================
# Stage 1: Build frontend
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

RUN npm run build


# =========================
# Stage 2: Nginx runtime
# =========================
FROM nginx:alpine

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Create nginx config
RUN echo 'server {

    listen 80;

    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # =========================================
    # General nginx tuning
    # =========================================

    client_max_body_size 100M;

    keepalive_timeout 65;

    large_client_header_buffers 8 64k;

    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    send_timeout 300;

    proxy_buffer_size 128k;
    proxy_buffers 8 256k;
    proxy_busy_buffers_size 256k;

    # =========================================
    # Frontend SPA
    # =========================================

    location / {
        try_files $uri $uri/ /index.html;
    }

    # =========================================
    # Backend API
    # =========================================

    location /api/ {

        proxy_pass http://host.docker.internal:8000/;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Connection "";

    }

    # =========================================
    # GeoServer
    # =========================================

    location /geoserver/ {

        proxy_pass http://192.168.100.104:8090/geoserver/;

        proxy_http_version 1.1;

        # Forward headers
        proxy_set_header Host 192.168.100.104:8090;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # Preserve cookies/session
        proxy_set_header Cookie $http_cookie;
        proxy_cookie_path / /;

        # Required for GeoServer/Wicket
        proxy_set_header Connection "";

        # Disable buffering
        proxy_buffering off;
        proxy_request_buffering off;

        # Prevent redirect rewrite issues
        proxy_redirect off;

        # Long-running requests
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;

    }

    # =========================================
    # MinIO API
    # =========================================

    location /minio/ {

        proxy_pass http://192.168.100.104:9000/;

        proxy_http_version 1.1;

        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Connection "";

        chunked_transfer_encoding off;

        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;

    }

    # =========================================
    # MinIO Console
    # =========================================

    location /minio-console/ {

        proxy_pass http://192.168.100.104:9001/;

        proxy_http_version 1.1;

        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Websocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;

    }

}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]