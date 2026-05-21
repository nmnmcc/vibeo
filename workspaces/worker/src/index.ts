import { Agent, tool } from "@openai/agents";
import { z } from "zod";

export const createAgent = () => {
  const editor = [
    tool({
      name: "append_string",
      description: "Append string to the script",
      parameters: z.object({
        new_string: z.string(),
      }),
      execute: console.log,
    }),
    tool({
      name: "prepend_string",
      description: "Prepend string to script",
      parameters: z.object({
        new_string: z.string(),
      }),
      execute: console.log,
    }),
    tool({
      name: "replace_string",
      description: "Replace string in script",
      parameters: z.object({
        old_string: z.string(),
        new_string: z.string(),
      }),
      execute: console.log,
    }),
  ] as const;

  return Agent.create({
    name: "",
    tools: [...editor],
  });
};
