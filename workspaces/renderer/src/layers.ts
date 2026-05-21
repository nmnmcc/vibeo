import { Layer, pipe } from "effect";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { interfaces } from "./api/interfaces";
import { implementations } from "./api/implementations";
import { NodeHttpPlatform, NodeServices } from "@effect/platform-node";
import * as Etag from "effect/unstable/http/Etag";

export const ApiLayer = Layer.mergeAll(
  HttpApiBuilder.layer(interfaces, {
    openapiPath: "/openapi.json",
  }),
  HttpApiScalar.layer(interfaces, {
    path: "/docs",
  }),
).pipe(Layer.provide(implementations));

export const BaseLayer = Layer.mergeAll(NodeServices.layer, NodeHttpPlatform.layer, Etag.layer);

export const AppLayer = pipe(ApiLayer, Layer.provide(BaseLayer));
