FROM node:20-alpine

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Don't run as root
USER node

EXPOSE 3000
CMD ["node", "server/index.js"]
