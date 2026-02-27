FROM node:22-slim

RUN npm install -g openclaw

WORKDIR /app
COPY apps/agent/workspace/ ./workspace/
COPY apps/agent/openclaw.json ./

EXPOSE 18789
CMD ["openclaw", "serve", "--config", "openclaw.json"]
