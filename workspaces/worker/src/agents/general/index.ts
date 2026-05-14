import { Agent } from "@openai/agents";
import { Context, Effect, Layer } from "effect";
import { ProgrammerAgent } from "../programmer";
import { Config } from "../../config";

export class GeneralAgent extends Context.Service<GeneralAgent>()("General", {
  make: Effect.fn(function* () {
    const {
      agent: { general },
    } = yield* Config;

    const programmer = yield* ProgrammerAgent;

    return Agent.create({
      name: "general",
      instructions,
      model: general.model,
      tools: [programmer.asTool({})],
    });
  }),
}) {
  public static readonly layer = Layer.effect(GeneralAgent, GeneralAgent.make());
}

const instructions = ``;
