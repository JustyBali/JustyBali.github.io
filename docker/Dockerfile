FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y python3 make g++ && \
    npm ci --production && \
    apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY src/ ./src/
COPY api/ ./api/
ENV CLIENT_ID=default
ENV NODE_ENV=production
CMD ["node","src/index.js"]
