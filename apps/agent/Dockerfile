FROM node:22-slim

RUN npm install -g openclaw

WORKDIR /app
COPY workspace/ ./workspace/
COPY openclaw.json ./

EXPOSE 18789
CMD ["openclaw", "serve", "--config", "openclaw.json"]
