import { HttpApi } from "effect/unstable/httpapi";

import { InternalGroup } from "./groups/internal";
import { TopGroup } from "./groups/top";

export const Api = HttpApi.make("renderer").add(TopGroup, InternalGroup);
export const interfaces = Api;

export * from "./groups/internal";
export * from "./groups/top";
export * from "./middlewares/internal-network-access";
export * from "./schemas";
