FROM node:22-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw

WORKDIR /app
COPY apps/agent/workspace/ ./workspace/
COPY apps/agent/openclaw.json ./

ENV OPENCLAW_CONFIG_PATH=/app/openclaw.json

EXPOSE 18789
CMD ["openclaw", "gateway", "run", "--port", "18789", "--bind", "custom", "--auth", "token"]
