# ---------------------------------------------------------------------------
# SmartIntern-ET — Nginx Reverse Proxy Dockerfile
# Production reverse proxy, WebSocket router, and static asset server.
# ---------------------------------------------------------------------------

FROM nginx:alpine

# Remove default configuration and default html files
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
