## Renderer Workspace

This workspace implements the RenderJob control plane for Vibeo. It accepts render requests, persists job state in Postgres, dispatches Kubernetes jobs, receives internal callbacks from render containers, stores MP4 output in S3-compatible storage, and exposes job status over the HTTP API.

Root `AGENTS.md` still applies. Keep `references/` read-only and prefer vendored Effect examples when changing Effect v4 or `effect/unstable/httpapi` code.

## Source Boundaries

- `src/api/interfaces.ts` is the schema-first HTTP contract. Keep endpoint payloads, params, headers, success, and error schemas here.
- `src/api/implementations.ts` wires HTTP handlers to services. Handlers should call `RenderJobWorkflow`; they should not access the database, Kubernetes client, or object storage directly.
- `src/api/errors.ts` is the only HTTP error translation layer. Keep domain and infrastructure details out of external response bodies unless the contract explicitly exposes them.
- `src/services/render-jobs/index.ts` owns RenderJob behavior, including workflow methods, repository access, Kubernetes dispatch, output upload, callback authorization, and render-specific helpers.
- `src/services/database/schema/` owns Drizzle table definitions. Other services should import table objects and inferred types from the schema entrypoint.
- `src/config.ts`, `src/services/database/index.ts`, and `src/services/k8s.ts` are infrastructure layers. Keep runtime configuration in `RendererConfig`.
- `container/` is the render runtime image. It is separate from the TypeScript API service and should only communicate back through the internal HTTP callback endpoints.

## Effect Service Style

- Define public services with `Context.Service` and explicit shape types when the service crosses a module boundary.
- Public methods must return `Effect.Effect`; use `Effect.fn("Service.method")` names that match the owning service.
- Acquire dependencies inside `make` or layer construction with `yield* ServiceName`.
- Keep helper services such as repositories, Kubernetes adapters, and object stores file-local unless another module truly needs them.
- Prefer native typed infrastructure errors, such as `EffectDrizzleQueryError`, over broad service-specific wrappers. Translate those errors at the HTTP boundary.
- Use `Data.TaggedError` for expected domain failures such as not found, conflict, invalid callback content, dispatch failure, and upload failure.

## API Rules

- Public endpoints are `PUT /` for job creation and `GET /:id` for status.
- Internal endpoints live under `/internal/:id`; the `id` path segment is the callback capability, so do not add a separate bearer token unless explicitly requested.
- Internal endpoints must also pass `InternalNetworkAccess`; configure `RENDERER_INTERNAL_ALLOWED_CIDRS` as a comma-separated CIDR allowlist. The default allows common LAN, link-local, and loopback networks.
- Do not persist or log extra internal callback credentials.
- Keep raw body endpoints as streams for logs and MP4 output. Do not buffer large output bodies in memory.
- When adding an endpoint, update `interfaces.ts`, `implementations.ts`, `errors.ts`, and the workflow shape together.

## RenderJob Rules

- A job starts as `working`. It can finish as `failed` or `succeed`.
- A job may only be marked `succeed` after output has been uploaded and `outputUrl` is present.
- Dispatch and upload failures should mark the job failed with useful stderr context before surfacing the typed failure.
- Logs are append-only tails capped by `MAX_LOG_BYTES`. Preserve both stdout and stderr channels.
- Serve render source through the internal source endpoint. Do not add separate source URLs or forwarded source headers unless the workflow changes.
- Render artifacts, logs, and previews must not be written back into the agent-managed Git workspace.

## Container Rules

- `container/sh/render.fish` is the runtime contract with the TypeScript service. Keep its required environment variables aligned with the Kubernetes job spec.
- The container should download the source from `/source`, render through Manim and ffmpeg, stream logs to `/log/:channel`, upload MP4 bytes to `/output`, then call `/finish`.
- Keep dependency changes deliberate: update `container/py/pyproject.toml` and `uv.lock` together; update Nix package files and `flake.lock` together.
- Do not edit generated dependency folders such as `node_modules`, `.venv`, or Python cache directories.

## Verification

- After TypeScript changes in this workspace, run `yarn workspace renderer typecheck`.
- After API schema changes, typecheck the renderer and inspect generated OpenAPI behavior through `/openapi.json` or `/docs` when running the service.
- After container changes, build or run the container path when practical, and at minimum inspect `render.fish` against the Kubernetes job env values in `RenderJobWorkflow.create`.
- Use `yarn prettier --write` on touched renderer files for formatting; do not format `references/` or dependency folders.
