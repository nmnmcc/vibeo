import { BatchV1Api } from "@kubernetes/client-node";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { eq, sql } from "drizzle-orm";
import { Array as Arr, Context, Data, Effect, Layer, Option } from "effect";
import * as u from "uuid";
import type { Interfaces } from "../../api/interfaces";
import { RendererConfig } from "../../config";
import { Database, schema } from "../database";
import { KubernetesConfig } from "../k8s";

export type JobRepositoryShape = {
  readonly create: (
    input: JobRepository.Input.Create,
  ) => Effect.Effect<string, JobRepository.Error.Dispatch | EffectDrizzleQueryError>;
  readonly get: (
    id: string,
  ) => Effect.Effect<JobRepository.RenderJob, JobRepository.Error.NotFound | EffectDrizzleQueryError>;
};

export class JobRepository extends Context.Service<JobRepository, JobRepositoryShape>()("renderer/JobRepository") {
  public static readonly layer = Layer.effect(
    JobRepository,
    Effect.gen(function* () {
      const database = yield* Database;
      const k8s = yield* KubernetesConfig;
      const config = yield* RendererConfig;

      const create = Effect.fn("JobRepository.create")(function* (input: JobRepository.Input.Create) {
        const id = u.v7();
        const client = k8s.makeApiClient(BatchV1Api);
        const namespace = config.job.namespace;
        const internalBaseUrl = trimTrailingSlash(config.job.internalBaseUrl);

        yield* database.insert(schema.jobs).values({
          id,
          input: input.source,
          constraints: input.constraints,
        });

        yield* Effect.tryPromise({
          try: () =>
            client.createNamespacedJob({
              namespace,
              body: {
                apiVersion: "batch/v1",
                kind: "Job",
                metadata: {
                  name: id,
                  namespace,
                },
                spec: {
                  backoffLimit: config.job.backoffLimit,
                  ttlSecondsAfterFinished: config.job.ttlSecondsAfterFinished,
                  template: {
                    spec: {
                      automountServiceAccountToken: false,
                      restartPolicy: "Never",
                      containers: [
                        {
                          name: "renderer",
                          image: config.job.image,
                          imagePullPolicy: "IfNotPresent",
                          args: ["fish", "/sh/render.fish"],
                          env: [
                            { name: "RENDER_JOB_ID", value: id },
                            { name: "RENDER_INTERNAL_URL", value: `${internalBaseUrl}/internal/${id}` },
                            { name: "RENDER_WIDTH", value: String(input.constraints.resolution.width) },
                            { name: "RENDER_HEIGHT", value: String(input.constraints.resolution.height) },
                            { name: "RENDER_FRAMERATE", value: String(input.constraints.framerate) },
                            { name: "RENDER_BITRATE", value: String(input.constraints.bitrate) },
                            { name: "RENDER_CONSTRAINTS", value: JSON.stringify(input.constraints) },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            }),
          catch: (cause) => new JobRepository.Error.Dispatch({ cause }),
        }).pipe(
          Effect.catchTag("RenderJobDispatchError", (error) =>
            database
              .update(schema.jobs)
              .set({
                status: "failed",
                stderr: sql<string>`${schema.jobs.stderr} || ${formatDispatchFailure(error.cause)}`,
                finishedAt: new Date(),
              })
              .where(eq(schema.jobs.id, id))
              .pipe(Effect.andThen(Effect.fail(error))),
          ),
        );

        return id;
      });

      const get = Effect.fn("JobRepository.get")((id: string) =>
        database
          .select({
            status: schema.jobs.status,
            stdout: schema.jobs.stdout,
            stderr: schema.jobs.stderr,
            output: schema.jobs.output,
          })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, id))
          .limit(1)
          .pipe(
            Effect.map(Arr.head),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new JobRepository.Error.NotFound({ id })),
                onSome: (row) => Effect.succeed(toRenderJob(row)),
              }),
            ),
          ),
      );

      return JobRepository.of({ create, get });
    }),
  );
}

export namespace JobRepository {
  export type RenderJob =
    | {
        readonly status: "working" | "failed";
        readonly stdout: string;
        readonly stderr: string;
      }
    | {
        readonly status: "succeed";
        readonly stdout: string;
        readonly stderr: string;
        readonly url: URL;
      };

  export namespace Input {
    export type Create = {
      readonly source: string;
      readonly constraints: Interfaces.RenderConstraints;
    };
  }

  export type Error = Error.Dispatch | Error.NotFound | Error.Conflict | Error.LogContent | Error.OutputUpload;

  export namespace Error {
    export class Dispatch extends Data.TaggedError("RenderJobDispatchError")<{
      readonly cause: unknown;
    }> {}

    export class NotFound extends Data.TaggedError("RenderJobNotFoundError")<{
      readonly id: string;
    }> {}

    export class Conflict extends Data.TaggedError("RenderJobConflictError")<{
      readonly id: string;
    }> {}

    export class LogContent extends Data.TaggedError("RenderJobLogContentError")<{
      readonly cause: unknown;
    }> {}

    export class OutputUpload extends Data.TaggedError("RenderJobOutputUploadError")<{
      readonly cause: unknown;
    }> {}
  }
}

export type CreateRenderJobError = JobRepository.Error.Dispatch | EffectDrizzleQueryError;
export type GetRenderJobError = JobRepository.Error.NotFound | EffectDrizzleQueryError;
export type AppendRenderJobLogError =
  | JobRepository.Error.NotFound
  | JobRepository.Error.LogContent
  | EffectDrizzleQueryError;
export type UploadRenderJobOutputError =
  | JobRepository.Error.NotFound
  | JobRepository.Error.Conflict
  | JobRepository.Error.OutputUpload
  | EffectDrizzleQueryError;
export type FinishRenderJobError =
  | JobRepository.Error.NotFound
  | JobRepository.Error.Conflict
  | EffectDrizzleQueryError;

function toRenderJob(row: {
  readonly status: "working" | "failed" | "succeed";
  readonly stdout: string;
  readonly stderr: string;
  readonly output: string | null;
}): JobRepository.RenderJob {
  if (row.status === "succeed") {
    return {
      status: row.status,
      stdout: row.stdout,
      stderr: row.stderr,
      url: new URL(row.output!),
    };
  }

  return {
    status: row.status,
    stdout: row.stdout,
    stderr: row.stderr,
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function formatDispatchFailure(cause: unknown) {
  return `\n[renderer] failed to dispatch Kubernetes job: ${cause instanceof Error ? cause.message : String(cause)}\n`;
}
