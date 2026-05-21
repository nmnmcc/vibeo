import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Effect } from "effect";
import type { HttpServerError } from "effect/unstable/http/HttpServerError";
import { HttpApiError } from "effect/unstable/httpapi";
import type { JobInternal } from "../services/job-internal";
import type { CreateRenderJobError, GetRenderJobError } from "../services/job-repository";

export function exposeCreateEndpoint<A, R>(effect: Effect.Effect<A, CreateRenderJobError, R>) {
  return effect.pipe(
    Effect.catchTags({
      EffectDrizzleQueryError: (_error: EffectDrizzleQueryError) =>
        Effect.fail(new HttpApiError.InternalServerError({})),
      RenderJobDispatchError: () => Effect.fail(new HttpApiError.ServiceUnavailable({})),
    }),
  );
}

export function exposeGetEndpoint<A, R>(effect: Effect.Effect<A, GetRenderJobError, R>) {
  return effect.pipe(
    Effect.catchTags({
      EffectDrizzleQueryError: (_error: EffectDrizzleQueryError) =>
        Effect.fail(new HttpApiError.InternalServerError({})),
      RenderJobNotFoundError: () => Effect.fail(new HttpApiError.NotFound({})),
    }),
  );
}

export function exposeInternalLogEndpoint<A, R>(
  effect: Effect.Effect<
    A,
    JobInternal.Error.NotFound | JobInternal.Error.Finished | EffectDrizzleQueryError | HttpServerError,
    R
  >,
) {
  return effect.pipe(
    Effect.catchTags({
      RenderJobNotFoundError: () => Effect.fail(new HttpApiError.NotFound({})),
      RenderJobFinishedError: () => Effect.fail(new HttpApiError.BadRequest({})),
      EffectDrizzleQueryError: (_error: EffectDrizzleQueryError) =>
        Effect.fail(new HttpApiError.InternalServerError({})),
      HttpServerError: () => Effect.fail(new HttpApiError.InternalServerError({})),
    }),
  );
}

export function exposeInternalSourceEndpoint<A, R>(
  effect: Effect.Effect<A, JobInternal.Error.NotFound | JobInternal.Error.Finished | EffectDrizzleQueryError, R>,
) {
  return effect.pipe(
    Effect.catchTags({
      RenderJobNotFoundError: () => Effect.fail(new HttpApiError.NotFound({})),
      RenderJobFinishedError: () => Effect.fail(new HttpApiError.BadRequest({})),
      EffectDrizzleQueryError: (_error: EffectDrizzleQueryError) =>
        Effect.fail(new HttpApiError.InternalServerError({})),
    }),
  );
}

export function exposeInternalUploadEndpoint<A, R>(
  effect: Effect.Effect<
    A,
    JobInternal.Error.NotFound | JobInternal.Error.Finished | JobInternal.Error.Upload | EffectDrizzleQueryError,
    R
  >,
) {
  return effect.pipe(
    Effect.catchTags({
      RenderJobNotFoundError: () => Effect.fail(new HttpApiError.NotFound({})),
      RenderJobFinishedError: () => Effect.fail(new HttpApiError.Conflict({})),
      EffectDrizzleQueryError: (_error: EffectDrizzleQueryError) =>
        Effect.fail(new HttpApiError.InternalServerError({})),
      RenderJobOutputUploadError: () => Effect.fail(new HttpApiError.ServiceUnavailable({})),
    }),
  );
}

export function exposeInternalFinishEndpoint<A, R>(
  effect: Effect.Effect<
    A,
    JobInternal.Error.NotFound | JobInternal.Error.Finished | JobInternal.Error.Conflict | EffectDrizzleQueryError,
    R
  >,
) {
  return effect.pipe(
    Effect.catchTags({
      RenderJobNotFoundError: () => Effect.fail(new HttpApiError.NotFound({})),
      RenderJobFinishedError: () => Effect.fail(new HttpApiError.Conflict({})),
      RenderJobConflictError: () => Effect.fail(new HttpApiError.Conflict({})),
      EffectDrizzleQueryError: (_error: EffectDrizzleQueryError) =>
        Effect.fail(new HttpApiError.InternalServerError({})),
    }),
  );
}
