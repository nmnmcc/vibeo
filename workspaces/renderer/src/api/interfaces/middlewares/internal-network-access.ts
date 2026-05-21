import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi";

export class InternalNetworkAccess extends HttpApiMiddleware.Service<InternalNetworkAccess>()(
  "renderer/api/InternalNetworkAccess",
  {
    error: HttpApiError.ForbiddenNoContent,
  },
) {}
