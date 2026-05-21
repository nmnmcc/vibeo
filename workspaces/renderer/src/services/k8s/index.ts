import { Context, Effect, Layer } from "effect";
import * as k8s from "@kubernetes/client-node";
import { RendererConfig } from "../../config";

export class KubernetesConfig extends Context.Service<KubernetesConfig, k8s.KubeConfig>()(
  "renderer/services/k8s/KubernetesConfig",
) {
  public static readonly layer = Layer.effect(
    KubernetesConfig,
    Effect.gen(function* () {
      const config = yield* RendererConfig;
      const kube = new k8s.KubeConfig();

      kube.loadFromString(config.kubernetes);

      return kube;
    }),
  );
}
