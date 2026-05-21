import { Config, Context, flow, Layer, Redacted } from "effect";

export const DEFAULT_INTERNAL_ALLOWED_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "127.0.0.0/8",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
] as const;

export class RendererConfig extends Context.Service<RendererConfig>()("renderer/config/RendererConfig", {
  make: () =>
    Config.all({
      database: Config.all({
        url: Config.url("DATABASE_URL").pipe(Config.map(flow((u) => u.toString(), Redacted.make))),
      }),
      s3: Config.all({
        endpoint: Config.nonEmptyString("S3_ENDPOINT"),
        region: Config.nonEmptyString("S3_REGION").pipe(Config.withDefault("auto")),
        accessKeyId: Config.nonEmptyString("S3_ACCESS_KEY_ID"),
        secretAccessKey: Config.nonEmptyString("S3_SECRET_ACCESS_KEY"),
        publicBaseUrl: Config.string("S3_PUBLIC_BASE_URL").pipe(Config.withDefault("")),
        prefix: Config.string("S3_PREFIX").pipe(Config.withDefault("renders")),
      }),
      kubernetes: Config.nonEmptyString("KUBERNETES"),
      job: Config.all({
        namespace: Config.nonEmptyString("RENDERER_K8S_NAMESPACE").pipe(Config.withDefault("default")),
        image: Config.nonEmptyString("RENDERER_IMAGE"),
        internalBaseUrl: Config.nonEmptyString("RENDERER_INTERNAL_BASE_URL").pipe(
          Config.withDefault("http://renderer.default.svc.cluster.local"),
        ),
        backoffLimit: Config.int("RENDERER_JOB_BACKOFF_LIMIT").pipe(Config.withDefault(0)),
        ttlSecondsAfterFinished: Config.int("RENDERER_JOB_TTL_SECONDS").pipe(Config.withDefault(3600)),
        whitelist: Config.nonEmptyString("RENDERER_INTERNAL_ALLOWED_CIDRS").pipe(
          Config.withDefault(DEFAULT_INTERNAL_ALLOWED_CIDRS.join(",")),
        ),
      }),
    }).pipe(Config.unwrap),
}) {
  public static readonly layer = Layer.effect(RendererConfig, RendererConfig.make());
}
