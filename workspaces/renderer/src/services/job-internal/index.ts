import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Array, Context, Data, Effect, Layer, Option, Stream } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";
import S3mini from "s3mini";
import { RendererConfig } from "../../config";
import { Database, schema } from "../database";

export class JobInternal extends Context.Service<
  JobInternal,
  {
    readonly source: (
      id: string,
    ) => Effect.Effect<string, JobInternal.Error.NotFound | JobInternal.Error.Finished | EffectDrizzleQueryError>;
    readonly log: <E>(
      id: string,
      channel: "stdout" | "stderr",
      chunks: Stream.Stream<Uint8Array, E>,
    ) => Effect.Effect<void, E | JobInternal.Error.NotFound | JobInternal.Error.Finished | EffectDrizzleQueryError>;
    readonly upload: (
      id: string,
      content: Stream.Stream<Uint8Array>,
    ) => Effect.Effect<
      void,
      JobInternal.Error.NotFound | JobInternal.Error.Finished | JobInternal.Error.Upload | EffectDrizzleQueryError
    >;
    readonly finish: (
      id: string,
      status: "succeed" | "failed",
    ) => Effect.Effect<
      void,
      JobInternal.Error.NotFound | JobInternal.Error.Finished | JobInternal.Error.Conflict | EffectDrizzleQueryError
    >;
  }
>()("renderer/JobInternal") {
  public static readonly layer = Layer.effect(
    JobInternal,
    Effect.gen(function* () {
      const database = yield* Database;
      const config = yield* RendererConfig;

      const s3 = new S3mini({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      });

      const requireWorking = Effect.fn("JobInternal.requireWorking")(function* (
        id: string,
        job: Option.Option<{
          readonly status: "working" | "failed" | "succeed";
          readonly finishedAt: Date | null;
        }>,
      ) {
        const current = yield* Option.match(job, {
          onNone: () => Effect.fail(new JobInternal.Error.NotFound({ id })),
          onSome: Effect.succeed,
        });

        if (current.status !== "working" || current.finishedAt !== null) {
          return yield* new JobInternal.Error.Finished({ id });
        }
      });

      const mapTransactionError = <A, E, R>(effect: Effect.Effect<A, E | SqlError, R>) =>
        Effect.catchTag(
          effect,
          "SqlError",
          (cause) => new EffectDrizzleQueryError({ query: "transaction", params: [], cause }),
        );

      const appendLogChunk = Effect.fn("JobInternal.appendLogChunk")(function* (
        id: string,
        channel: "stdout" | "stderr",
        chunk: string,
      ) {
        if (chunk.length === 0) {
          return;
        }

        return yield* database
          .transaction((tx) =>
            Effect.gen(function* () {
              const job = yield* tx
                .select({ status: schema.jobs.status, finishedAt: schema.jobs.finishedAt })
                .from(schema.jobs)
                .where(eq(schema.jobs.id, id))
                .limit(1)
                .for("update")
                .pipe(Effect.map(Array.head));

              yield* requireWorking(id, job);

              yield* tx
                .update(schema.jobs)
                .set(
                  channel === "stdout"
                    ? { stdout: sql<string>`${schema.jobs.stdout} || ${chunk}` }
                    : { stderr: sql<string>`${schema.jobs.stderr} || ${chunk}` },
                )
                .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "working"), isNull(schema.jobs.finishedAt)));
            }),
          )
          .pipe(mapTransactionError);
      });

      return JobInternal.of({
        source: Effect.fn("JobInternal.source")(function* (id) {
          return yield* database
            .transaction((tx) =>
              Effect.gen(function* () {
                const job = yield* tx
                  .select({
                    input: schema.jobs.input,
                    status: schema.jobs.status,
                    finishedAt: schema.jobs.finishedAt,
                  })
                  .from(schema.jobs)
                  .where(eq(schema.jobs.id, id))
                  .limit(1)
                  .for("update")
                  .pipe(Effect.map(Array.head));

                const current = yield* Option.match(job, {
                  onNone: () => Effect.fail(new JobInternal.Error.NotFound({ id })),
                  onSome: Effect.succeed,
                });

                yield* requireWorking(id, Option.some(current));

                return current.input;
              }),
            )
            .pipe(mapTransactionError);
        }),
        log: Effect.fn("JobInternal.log")(function* <E>(
          id: string,
          channel: "stdout" | "stderr",
          chunks: Stream.Stream<Uint8Array, E>,
        ) {
          const decoder = new TextDecoder();

          yield* chunks.pipe(
            Stream.map((chunk) => decoder.decode(chunk, { stream: true })),
            Stream.runForEach((chunk) => appendLogChunk(id, channel, chunk)),
          );

          return yield* appendLogChunk(id, channel, decoder.decode());
        }),
        upload: Effect.fn("JobInternal.upload")(function* (id, content) {
          const key = `${config.s3.prefix}/${id}`;
          const output = new URL(key, config.s3.publicBaseUrl);

          return yield* database
            .transaction((tx) =>
              Effect.gen(function* () {
                const job = yield* tx
                  .select({ status: schema.jobs.status, finishedAt: schema.jobs.finishedAt })
                  .from(schema.jobs)
                  .where(eq(schema.jobs.id, id))
                  .limit(1)
                  .for("update")
                  .pipe(Effect.map(Array.head));

                yield* requireWorking(id, job);

                yield* Effect.tryPromise({
                  try: async () => {
                    const response = await s3.putAnyObject(key, Stream.toReadableStream(content), "video/mp4");
                    if (!response.ok) {
                      throw new Error(`S3 upload failed with status ${response.status}`);
                    }
                  },
                  catch: (cause) => new JobInternal.Error.Upload({ cause }),
                });

                yield* tx.update(schema.jobs).set({ output: output.href }).where(eq(schema.jobs.id, id));
              }),
            )
            .pipe(mapTransactionError);
        }),
        finish: Effect.fn("JobInternal.finish")(function* (id, status) {
          return yield* database
            .transaction((tx) =>
              Effect.gen(function* () {
                const job = yield* tx
                  .select({
                    status: schema.jobs.status,
                    finishedAt: schema.jobs.finishedAt,
                    output: schema.jobs.output,
                  })
                  .from(schema.jobs)
                  .where(eq(schema.jobs.id, id))
                  .limit(1)
                  .for("update")
                  .pipe(Effect.map(Array.head));

                const current = yield* Option.match(job, {
                  onNone: () => Effect.fail(new JobInternal.Error.NotFound({ id })),
                  onSome: Effect.succeed,
                });

                if (current.status !== "working" || current.finishedAt !== null) {
                  return yield* new JobInternal.Error.Finished({ id });
                }

                if (status === "succeed" && current.output === null) {
                  return yield* new JobInternal.Error.Conflict({ id });
                }

                yield* tx
                  .update(schema.jobs)
                  .set({ status, finishedAt: new Date() })
                  .where(
                    status === "succeed"
                      ? and(
                          eq(schema.jobs.id, id),
                          eq(schema.jobs.status, "working"),
                          isNull(schema.jobs.finishedAt),
                          isNotNull(schema.jobs.output),
                        )
                      : and(eq(schema.jobs.id, id), eq(schema.jobs.status, "working"), isNull(schema.jobs.finishedAt)),
                  );
              }),
            )
            .pipe(mapTransactionError);
        }),
      });
    }),
  );
}

export namespace JobInternal {
  export type Error = Error.NotFound | Error.Finished | Error.Conflict | Error.Upload;

  export namespace Error {
    export class NotFound extends Data.TaggedError("RenderJobNotFoundError")<{
      readonly id: string;
    }> {}

    export class Finished extends Data.TaggedError("RenderJobFinishedError")<{
      readonly id: string;
    }> {}

    export class Conflict extends Data.TaggedError("RenderJobConflictError")<{
      readonly id: string;
    }> {}

    export class Upload extends Data.TaggedError("RenderJobOutputUploadError")<{
      readonly cause: unknown;
    }> {}
  }
}
