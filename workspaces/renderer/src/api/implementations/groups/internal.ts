import { Effect, Layer, Stream } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  exposeInternalFinishEndpoint,
  exposeInternalLogEndpoint,
  exposeInternalSourceEndpoint,
  exposeInternalUploadEndpoint,
} from "../../errors";
import { Api } from "../../interfaces";
import { JobInternal } from "../../../services/job-internal";

export const InternalGroup = Layer.unwrap(
  Effect.gen(function* () {
    const jobs = yield* JobInternal;

    return HttpApiBuilder.group(Api, "internal", (handlers) =>
      handlers
        .handleRaw(
          "log",
          Effect.fn("renderer.api.log")(function* ({ params, request }) {
            yield* exposeInternalLogEndpoint(jobs.log(params.id, params.channel, request.stream));
          }),
        )
        .handle(
          "source",
          Effect.fn("renderer.api.source")(function* ({ params }) {
            return yield* exposeInternalSourceEndpoint(jobs.source(params.id));
          }),
        )
        .handleRaw(
          "output",
          Effect.fn("renderer.api.uploadOutput")(function* ({ params, request }) {
            yield* exposeInternalUploadEndpoint(jobs.upload(params.id, request.stream.pipe(Stream.orDie)));
          }),
        )
        .handle(
          "finish",
          Effect.fn("renderer.api.finish")(function* ({ params, payload }) {
            yield* exposeInternalFinishEndpoint(jobs.finish(params.id, payload.status));
          }),
        ),
    );
  }),
);
