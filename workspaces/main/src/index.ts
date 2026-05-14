import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const runner = path.join(path.dirname(self), "./pi-run.sh");
const prompt = process.argv.slice(2).join(" ").trim() || "123";

const result = await runPi({
  runner,
  prompt,
  timeoutMs: readOptionalPositiveInteger(process.env["VIBEO_PI_TIMEOUT_MS"], "VIBEO_PI_TIMEOUT_MS"),
});

console.log(JSON.stringify(result, null, 2));

type PiRunOptions = {
  runner: string;
  prompt: string;
  timeoutMs: number | undefined;
};

type PiRunResult = {
  runner: "pi";
  prompt: string;
  args: string[];
  response: string;
  tools: PiToolEvent[];
  messages: unknown[];
  events: PiEventSummary[];
  stderr?: string;
  nonJsonOutput?: string[];
};

type PiEventSummary =
  | {
      type: "agent_start" | "agent_end" | "turn_start";
    }
  | {
      type: "turn_end";
      toolResultCount: number;
    }
  | {
      type: "message_start" | "message_end";
      messageType: string | undefined;
    }
  | {
      type: "message_update";
      updateType: string | undefined;
    }
  | PiToolEvent
  | {
      type: string;
    };

type PiToolEvent = {
  type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end";
  toolCallId: string | undefined;
  toolName: string | undefined;
  isError?: boolean;
};

type PiJsonEvent = {
  type?: unknown;
  [key: string]: unknown;
};

async function runPi(options: PiRunOptions): Promise<PiRunResult> {
  const args = buildPiArgs(options.prompt);
  const events: PiEventSummary[] = [];
  const tools: PiToolEvent[] = [];
  const messages: unknown[] = [];
  const response: string[] = [];
  const nonJsonOutput: string[] = [];
  let stderr = "";
  let stdoutBuffer = "";

  const proc = spawn(options.runner, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let timer: NodeJS.Timeout | undefined;
  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      stopProcess(proc);
    }, options.timeoutMs);
  }

  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    stdoutBuffer = drainJsonLines(stdoutBuffer, (line) => {
      const event = parsePiEvent(line);

      if (!event) {
        nonJsonOutput.push(line);
        return;
      }

      const summary = summarizePiEvent(event);
      events.push(summary);

      if (isToolEvent(summary)) {
        tools.push(summary);
      }

      collectAssistantText(event, response);
      collectAgentMessages(event, messages);
    });
  });

  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    proc.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });

    proc.on("exit", (code, signal) => {
      if (timer) {
        clearTimeout(timer);
      }

      const remaining = stdoutBuffer.trim();
      if (remaining) {
        const event = parsePiEvent(remaining);
        if (event) {
          const summary = summarizePiEvent(event);
          events.push(summary);
          if (isToolEvent(summary)) {
            tools.push(summary);
          }
          collectAssistantText(event, response);
          collectAgentMessages(event, messages);
        } else {
          nonJsonOutput.push(remaining);
        }
      }

      if (code !== 0) {
        const suffix = stderr.trim() ? `\n${stderr.trim()}` : "";
        reject(new Error(`pi exited with code=${code ?? "null"} signal=${signal ?? "null"}${suffix}`));
        return;
      }

      resolve({
        runner: "pi",
        prompt: options.prompt,
        args,
        response: response.join(""),
        tools,
        messages,
        events,
        ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
        ...(nonJsonOutput.length > 0 ? { nonJsonOutput } : {}),
      });
    });
  });
}

function buildPiArgs(prompt: string): string[] {
  const args = ["--mode", "json", "--print", "--no-session"];

  appendOption(args, "--provider", process.env["VIBEO_PI_PROVIDER"]);
  appendOption(args, "--model", process.env["VIBEO_PI_MODEL"]);
  appendOption(args, "--thinking", process.env["VIBEO_PI_THINKING"]);
  appendOption(args, "--tools", process.env["VIBEO_PI_TOOLS"]);

  args.push(prompt);
  return args;
}

function appendOption(args: string[], option: string, value: string | undefined): void {
  if (value && value.trim()) {
    args.push(option, value.trim());
  }
}

function drainJsonLines(buffer: string, onLine: (line: string) => void): string {
  let start = 0;

  for (;;) {
    const newline = buffer.indexOf("\n", start);
    if (newline === -1) {
      return buffer.slice(start);
    }

    const line = buffer.slice(start, newline).trim();
    if (line) {
      onLine(line);
    }
    start = newline + 1;
  }
}

function parsePiEvent(line: string): PiJsonEvent | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as PiJsonEvent;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function summarizePiEvent(event: PiJsonEvent): PiEventSummary {
  const type = typeof event.type === "string" ? event.type : "unknown";

  switch (type) {
    case "agent_start":
    case "agent_end":
    case "turn_start":
      return { type };
    case "turn_end":
      return { type, toolResultCount: readArray(event["toolResults"]).length };
    case "message_start":
    case "message_end":
      return { type, messageType: readMessageType(event["message"]) };
    case "message_update":
      return { type, updateType: readAssistantMessageEventType(event["assistantMessageEvent"]) };
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      return {
        type,
        toolCallId: readString(event["toolCallId"]),
        toolName: readString(event["toolName"]),
        ...(typeof event["isError"] === "boolean" ? { isError: event["isError"] } : {}),
      };
    default:
      return { type };
  }
}

function collectAssistantText(event: PiJsonEvent, response: string[]): void {
  if (event.type !== "message_update") {
    return;
  }

  const assistantMessageEvent = readObject(event["assistantMessageEvent"]);
  if (!assistantMessageEvent || assistantMessageEvent["type"] !== "text_delta") {
    return;
  }

  const delta = readString(assistantMessageEvent["delta"]);
  if (delta !== undefined) {
    response.push(delta);
  }
}

function collectAgentMessages(event: PiJsonEvent, messages: unknown[]): void {
  if (event.type !== "agent_end") {
    return;
  }

  messages.push(...readArray(event["messages"]));
}

function isToolEvent(summary: PiEventSummary): summary is PiToolEvent {
  return summary.type === "tool_execution_start" || summary.type === "tool_execution_update" || summary.type === "tool_execution_end";
}

function readAssistantMessageEventType(value: unknown): string | undefined {
  const event = readObject(value);
  if (!event) {
    return undefined;
  }

  return readString(event["type"]);
}

function readMessageType(value: unknown): string | undefined {
  const message = readObject(value);
  if (!message) {
    return undefined;
  }

  return readString(message["type"]);
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function stopProcess(proc: ChildProcess): void {
  if (proc.exitCode !== null || proc.killed) {
    return;
  }

  proc.kill("SIGTERM");
}
