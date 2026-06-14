FROM oven/bun:debian

ENV PATH="/root/.bun/bin:/root/.rokit/bin:${PATH}"

RUN ln -sf /usr/local/bin/bun /usr/local/bin/node

RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        curl \
        zsh \
        unzip \
        wget \
        procps \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /root/.rokit/bin /root/.local/bin

WORKDIR /workspaces