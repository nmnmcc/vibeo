import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { readFile } from "node:fs/promises";
import { exposeCreateEndpoint, exposeGetEndpoint } from "../../errors";
import { Api } from "../../interfaces";
import { JobRepository } from "../../../services/job-repository";

export const TopGroup = Layer.unwrap(
  Effect.gen(function* () {
    const jobs = yield* JobRepository;

    return HttpApiBuilder.group(Api, "top", (handlers) =>
      handlers
        .handle(
          "create",
          Effect.fn("renderer.api.create")(function* ({ payload }) {
            const source = yield* Effect.tryPromise({
              try: () => readFile(payload.input.path, "utf8"),
              catch: () => new HttpApiError.InternalServerError({}),
            });

            return yield* exposeCreateEndpoint(
              jobs.create({
                source,
                constraints: payload.constraints,
              }),
            );
          }),
        )
        .handle(
          "read",
          Effect.fn("renderer.api.get")(function* ({ params }) {
            return yield* exposeGetEndpoint(jobs.get(params.id));
          }),
        ),
    );
  }),
);
