import { Context, Layer } from "effect";

export interface ConfigShape {
  readonly agent: Record<
    "general" | "programmer" | "reviewer" | "writer",
    ConfigAgentShape
  >;
}

export interface ConfigAgentShape {
  readonly model: string;
}

export class Config extends Context.Service<Config, ConfigShape>()("Config") {
  public static readonly layer = (config: Context.Service.Shape<Config>) =>
    Layer.succeed(Config, config);
}
