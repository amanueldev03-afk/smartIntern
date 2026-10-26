# ---------------------------------------------------------------------------
# SmartIntern-ET — Backend Dockerfile (Node.js & Express)
# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim

WORKDIR /app

# Install curl for healthcheck verification
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY . .

# Ensure upload media directories exist
RUN mkdir -p media/student_cvs media/srs_docs media/profile_photos

EXPOSE 8000

ENV NODE_ENV=production \
    PORT=8000

CMD ["node", "server.js"]
