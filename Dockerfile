FROM mcr.microsoft.com/playwright:v1.58.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install chromium

COPY . .
RUN mkdir -p data

EXPOSE 3001

ENV NODE_ENV=production
CMD ["node", "index.js"]
