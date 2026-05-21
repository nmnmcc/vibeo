import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { InternalNetworkAccess } from "../middlewares/internal-network-access";
import { Interfaces } from "../schemas";

export const InternalGroup = HttpApiGroup.make("internal")
  .add(
    HttpApiEndpoint.post("log", "/:id/log/:channel", {
      params: { id: Interfaces.UUIDv7, channel: Interfaces.RenderLogChannel },
      payload: Interfaces.RenderLogPayload,
      success: HttpApiSchema.NoContent,
      error: [
        HttpApiError.ForbiddenNoContent,
        HttpApiError.NotFoundNoContent,
        HttpApiError.BadRequestNoContent,
        HttpApiError.InternalServerErrorNoContent,
      ],
    }),
    HttpApiEndpoint.get("source", "/:id/source", {
      params: { id: Interfaces.UUIDv7 },
      success: Interfaces.RenderSourcePayload,
      error: [
        HttpApiError.ForbiddenNoContent,
        HttpApiError.NotFoundNoContent,
        HttpApiError.BadRequestNoContent,
        HttpApiError.InternalServerErrorNoContent,
      ],
    }),
    HttpApiEndpoint.put("output", "/:id/output", {
      params: { id: Interfaces.UUIDv7 },
      payload: Interfaces.RenderOutputPayload,
      success: HttpApiSchema.NoContent,
      error: [
        HttpApiError.ForbiddenNoContent,
        HttpApiError.NotFoundNoContent,
        HttpApiError.ConflictNoContent,
        HttpApiError.ServiceUnavailableNoContent,
        HttpApiError.InternalServerErrorNoContent,
      ],
    }),
    HttpApiEndpoint.post("finish", "/:id/finish", {
      params: { id: Interfaces.UUIDv7 },
      payload: Interfaces.RenderFinish,
      success: HttpApiSchema.NoContent,
      error: [
        HttpApiError.ForbiddenNoContent,
        HttpApiError.NotFoundNoContent,
        HttpApiError.ConflictNoContent,
        HttpApiError.InternalServerErrorNoContent,
      ],
    }),
  )
  .middleware(InternalNetworkAccess)
  .prefix("/internal");
