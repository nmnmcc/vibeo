# syntax=docker/dockerfile:1.7

FROM docker.io/nixos/nix:2.34.5 AS deps

RUN mkdir -p /etc/nix \
  && printf 'experimental-features = nix-command flakes\naccept-flake-config = true\n' > /etc/nix/nix.conf

COPY nix /x

COPY sh /sh
COPY py /py

RUN --mount=type=cache,id=vibeo-renderer-npm,target=/root/.npm,sharing=locked \
  --mount=type=cache,id=vibeo-renderer-uv,target=/root/.cache/uv,sharing=locked \
  nix develop --no-update-lock-file path:/x#install --command fish /sh/init.fish

FROM deps

COPY nix /x

RUN nix develop --no-update-lock-file path:/x --command true

WORKDIR /workspace

ENV PATH="$PATH:/js/node_modules/.bin:/py/.venv/bin"

ENTRYPOINT ["nix", "develop", "--no-update-lock-file", "path:/x", "--command"]
CMD ["node", "/runner/render-job-runner.mjs"]
