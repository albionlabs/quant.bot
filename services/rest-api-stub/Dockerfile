# ── Builder ──────────────────────────────────────────────────────────
FROM rust:1.89-slim AS builder

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src/ src/

RUN cargo build --release

# ── Runner ───────────────────────────────────────────────────────────
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y \
    ca-certificates libssl3t64 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/rest-api-stub ./

EXPOSE 8000

CMD ["./rest-api-stub"]
