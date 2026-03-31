FROM node:22-slim

RUN apt-get update && apt-get install -y git socat curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@2026.3.24

WORKDIR /app
COPY apps/agent/workspace/ ./workspace/
COPY apps/agent/openclaw.json ./

ENV OPENCLAW_CONFIG_PATH=/app/openclaw.json
ENV OPENCLAW_STATE_DIR=/app/.openclaw-state

RUN mkdir -p /app/.openclaw-state/agents/main/sessions && \
	chmod 700 /app/.openclaw-state && \
	chmod 600 /app/openclaw.json

EXPOSE 18789
CMD ["sh", "-c", "socat TCP6-LISTEN:18789,fork,reuseaddr TCP4:127.0.0.1:18790 & exec openclaw gateway run --port 18790 --bind loopback --auth token --verbose"]
