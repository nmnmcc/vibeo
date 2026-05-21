import { Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { RendererConfig } from "../../config";
import { Database } from "../../services/database";
import { JobInternal } from "../../services/job-internal";
import { JobRepository } from "../../services/job-repository";
import { KubernetesConfig } from "../../services/k8s";
import { Api as ApiDefinition } from "../interfaces";
import { InternalGroup } from "./groups/internal";
import { TopGroup } from "./groups/top";
import { InternalNetworkAccessLive } from "./middlewares/internal-network-access";

const InternalGroupWithMiddleware = InternalGroup.pipe(
  Layer.provide(InternalNetworkAccessLive.pipe(Layer.provide(RendererConfig.layer))),
);

const infrastructure = Layer.mergeAll(Database.layer, KubernetesConfig.layer).pipe(
  Layer.provideMerge(RendererConfig.layer),
);

const Services = Layer.mergeAll(JobRepository.layer, JobInternal.layer).pipe(Layer.provide(infrastructure));
const Groups = Layer.mergeAll(TopGroup, InternalGroupWithMiddleware).pipe(Layer.provide(Services));

export const Api = HttpApiBuilder.layer(ApiDefinition, { openapiPath: "/openapi.json" }).pipe(
  Layer.provideMerge(Groups),
);

export const Routes = Layer.mergeAll(Api);
export const implementations = Routes;
