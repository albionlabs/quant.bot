# ── Builder ──────────────────────────────────────────────────────────
FROM rust:1.89-slim AS builder

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY lib/ lib/
COPY config/ config/
COPY migrations/ migrations/

RUN cargo build --release

# ── Runner ───────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/st0x_rest_api ./
COPY --from=builder /app/migrations/ ./migrations/
COPY --from=builder /app/config/ ./config/

RUN mkdir -p /mnt/data/st0x-rest-api

EXPOSE 8000

CMD ["./st0x_rest_api"]
