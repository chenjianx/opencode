FROM alpine AS base

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add libgcc libstdc++ ripgrep

FROM base AS build-amd64
# raccoon_change - use raccoon platform package and binary
COPY dist/raccoon-linux-x64-baseline-musl/bin/raccoon /usr/local/bin/raccoon

FROM base AS build-arm64
# raccoon_change - use raccoon platform package and binary
COPY dist/raccoon-linux-arm64-musl/bin/raccoon /usr/local/bin/raccoon

ARG TARGETARCH
FROM build-${TARGETARCH}
# raccoon_change start - run raccoon binary in container
RUN raccoon --version
ENTRYPOINT ["raccoon"]
# raccoon_change end
