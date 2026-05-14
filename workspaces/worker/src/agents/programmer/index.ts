import { Agent, applyPatchTool, shellTool } from "@openai/agents";
import { Context, Effect, Layer } from "effect";

export class ProgrammerAgent extends Context.Service<ProgrammerAgent>()("ProgrammerAgent", {
  make: Effect.fn(function* () {
    return Agent.create({
      name: "programmer",
      tools: [shellTool({}), applyPatchTool({ editor: {} })],
    });
  }),
}) {
  public static readonly layer = Layer.effect(ProgrammerAgent, ProgrammerAgent.make());
}
