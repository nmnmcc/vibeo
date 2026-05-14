# syntax=docker/dockerfile:1.7

FROM docker.io/nixos/nix:2.34.5 AS deps

RUN mkdir -p /etc/nix \
  && printf 'experimental-features = nix-command flakes\naccept-flake-config = true\n' > /etc/nix/nix.conf

COPY nix /x

COPY sh /sh
COPY js /js
COPY py /py

RUN --mount=type=cache,id=vibeo-worker-npm,target=/root/.npm,sharing=locked \
  --mount=type=cache,id=vibeo-worker-uv,target=/root/.cache/uv,sharing=locked \
  nix develop --no-update-lock-file path:/x#install --command sh /sh/init.sh

FROM deps

COPY nix /x

RUN nix develop --no-update-lock-file path:/x --command true

WORKDIR /workspace

ENV PATH="$PATH:/js/node_modules/.bin:/py/.venv/bin"

EXPOSE 4096

ENTRYPOINT ["nix", "develop", "--no-update-lock-file", "path:/x", "--command"]
CMD ["opencode", "serve", "--hostname=0.0.0.0", "--port=4096"]
