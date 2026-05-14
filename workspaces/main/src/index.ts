import { createOpencodeClient, type OpencodeClient, type Workspace } from "@opencode-ai/sdk/v2";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const script = path.join(path.dirname(self), "./opencode-server.sh");
const remoteDirectory = process.env["OPENCODE_REMOTE_DIRECTORY"] ?? "/workspace";
const prompt = process.argv.slice(2).join(" ").trim() || "123";

const server = await startOpencodeServer({
  script,
  hostname: process.env["OPENCODE_HOSTNAME"] ?? "127.0.0.1",
  port: readPort(process.env["OPENCODE_PORT"]),
  timeoutMs: readTimeout(process.env["OPENCODE_START_TIMEOUT_MS"]),
});

try {
  const client = createOpencodeClient({
    baseUrl: server.url,
    directory: remoteDirectory,
    ...serverAuthConfig(),
  });

  const health = await client.global.health({ throwOnError: true });
  const workspace = await ensureWorkspace(client, remoteDirectory);
  const workspaceParams = workspace
    ? {
        workspace: workspace.id,
        workspaceID: workspace.id,
      }
    : {};
  const session = await client.session.create(
    {
      directory: remoteDirectory,
      title: prompt,
      ...workspaceParams,
    },
    { throwOnError: true },
  );

  const message = await client.session.prompt(
    {
      directory: remoteDirectory,
      sessionID: session.data.id,
      ...(workspace ? { workspace: workspace.id } : {}),
      parts: [{ type: "text", text: prompt }],
    },
    { throwOnError: true },
  );

  console.log(
    JSON.stringify(
      {
        server: server.url,
        version: health.data.version,
        workspace,
        session: session.data,
        message: message.data,
      },
      null,
      2,
    ),
  );
} finally {
  server.close();
}

type ServerOptions = {
  script: string;
  hostname: string;
  port: number;
  timeoutMs: number;
};

type ServerHandle = {
  url: string;
  close(): void;
};

async function ensureWorkspace(client: OpencodeClient, directory: string): Promise<Workspace | undefined> {
  if (process.env["OPENCODE_WORKSPACE_DISABLED"] === "1") {
    return undefined;
  }

  const id = process.env["OPENCODE_WORKSPACE_ID"] ?? "vibeo";
  const requestedType = process.env["OPENCODE_WORKSPACE_TYPE"];

  const list = await client.experimental.workspace.list({ directory }, { throwOnError: true });
  const existing = list.data.find((workspace) => workspace.id === id);

  if (existing) {
    return existing;
  }

  const adapters = await client.experimental.workspace.adapter.list({ directory }, { throwOnError: true });
  const type = requestedType ?? adapters.data[0]?.type;

  if (!type) {
    throw new Error("No opencode workspace adapter is available for this project.");
  }

  const created = await client.experimental.workspace.create(
    {
      directory,
      id,
      type,
    },
    { throwOnError: true },
  );

  return created.data;
}

async function startOpencodeServer(options: ServerOptions): Promise<ServerHandle> {
  const processEnv = {
    ...process.env,
    OPENCODE_HOSTNAME: options.hostname,
    OPENCODE_PORT: String(options.port),
  };

  const proc = spawn(options.script, [], {
    env: processEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      rejectOnce(new Error(`Timed out waiting for opencode server after ${options.timeoutMs}ms.`));
      stopProcess(proc);
    }, options.timeoutMs);

    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({
        url: `http://${options.hostname}:${options.port}`,
        close() {
          stopProcess(proc);
        },
      });
    };

    const collectOutput = (chunk: Buffer) => {
      output += chunk.toString();

      if (output.includes("opencode server listening")) {
        resolveOnce();
      }
    };

    proc.stdout?.on("data", collectOutput);
    proc.stderr?.on("data", collectOutput);
    proc.on("error", (error) => {
      rejectOnce(error);
    });
    proc.on("exit", (code, signal) => {
      if (settled) {
        return;
      }

      const suffix = output.trim() ? `\n${output.trim()}` : "";
      rejectOnce(new Error(`opencode server exited before it was ready: code=${code ?? "null"} signal=${signal ?? "null"}${suffix}`));
    });
  });
}

function readPort(value: string | undefined): number {
  if (!value) {
    return 4096;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid OPENCODE_PORT: ${value}`);
  }

  return port;
}

function serverAuthConfig(): { headers: Record<string, string> } | Record<string, never> {
  const password = process.env["OPENCODE_SERVER_PASSWORD"];

  if (!password) {
    return {};
  }

  const username = process.env["OPENCODE_SERVER_USERNAME"] ?? "opencode";
  const token = Buffer.from(`${username}:${password}`).toString("base64");

  return {
    headers: {
      Authorization: `Basic ${token}`,
    },
  };
}

function readTimeout(value: string | undefined): number {
  if (!value) {
    return 30_000;
  }

  const timeout = Number(value);

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error(`Invalid OPENCODE_START_TIMEOUT_MS: ${value}`);
  }

  return timeout;
}

function stopProcess(proc: ChildProcess): void {
  if (proc.exitCode !== null || proc.killed) {
    return;
  }

  proc.kill("SIGTERM");
}
