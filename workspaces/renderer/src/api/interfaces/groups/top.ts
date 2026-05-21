import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi";
import { Interfaces } from "../schemas";

export const TopGroup = HttpApiGroup.make("top", { topLevel: true }).add(
  HttpApiEndpoint.put("create", "/", {
    payload: Interfaces.RenderCreatePayload,
    success: Interfaces.UUIDv7,
    error: [HttpApiError.InternalServerErrorNoContent, HttpApiError.ServiceUnavailableNoContent],
  }),
  HttpApiEndpoint.get("read", "/:id", {
    params: {
      id: Interfaces.UUIDv7,
    },
    success: Schema.Union([
      Schema.Struct({
        ...Interfaces.RenderJobOutput,
        status: Schema.Literal("working"),
      }),
      Schema.Struct({
        ...Interfaces.RenderJobOutput,
        status: Schema.Literal("failed"),
      }),
      Schema.Struct({
        ...Interfaces.RenderJobOutput,
        status: Schema.Literal("succeed"),
        url: Schema.URLFromString,
      }),
    ]),
    error: [HttpApiError.NotFoundNoContent, HttpApiError.InternalServerErrorNoContent],
  }),
);
