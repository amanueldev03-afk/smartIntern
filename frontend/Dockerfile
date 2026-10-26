# ---------------------------------------------------------------------------
# SmartIntern-ET — Frontend Dockerfile
# Node 20 Alpine environment for React 18 / Vite / Tailwind SPA.
# ---------------------------------------------------------------------------

FROM node:20-alpine

WORKDIR /app

# Copy dependency specifications first to leverage Docker layer caching
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy source code
COPY . .

EXPOSE 5173

# Bind Vite server to 0.0.0.0 so it is accessible outside container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

