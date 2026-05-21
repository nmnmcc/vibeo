import { Array, Effect, flow, Layer, Match, Number, Option, pipe, String, Tuple } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiError } from "effect/unstable/httpapi";
import { BlockList, isIP } from "node:net";
import { RendererConfig } from "../../../config";
import { InternalNetworkAccess } from "../../interfaces";

export const InternalNetworkAccessLive = Layer.effect(
  InternalNetworkAccess,
  Effect.gen(function* () {
    const config = yield* RendererConfig;

    const blockList = new BlockList();
    yield* pipe(
      String.split(",", config.job.whitelist),
      Array.map(
        Effect.fn(function* (i) {
          return Match.value(i).pipe(
            Match.when(flow(isIP, Number.isGreaterThan(0)), (ipv4) => blockList.addAddress(ipv4, "ipv4")),
            Match.when(
              flow(String.split("-"), Tuple.isTupleOf(2)),
              flow(String.split("-"), ([start, end]) => blockList.addRange(start, end!)),
            ),
            Match.when(
              flow(String.split("/"), Tuple.isTupleOf(2)),
              flow(String.split("/"), ([net, prefix]) => blockList.addSubnet(net, parseInt(prefix!))),
            ),
            Match.orElseAbsurd,
          );
        }),
      ),
      (i) => Effect.all(i, { concurrency: Infinity, discard: true, mode: "result" }),
    );

    return InternalNetworkAccess.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const remoteAddress = request.remoteAddress;

        if (Option.isSome(remoteAddress) && blockList.check(remoteAddress.value)) return yield* effect;

        return yield* new HttpApiError.Forbidden();
      }),
    );
  }),
);
