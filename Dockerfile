FROM node:20-slim

# Install system dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Install only Chromium with its OS dependencies
RUN npx playwright install chromium --with-deps

COPY . .
RUN mkdir -p data

EXPOSE 3001

ENV NODE_ENV=production
CMD ["sh", "-c", "node db/setup.js && node index.js"]
