import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
  port: z.number().default(3000).describe("Host port to expose the app on"),
  containerName: z.string().default("swamp-express-hello").describe(
    "Docker container name",
  ),
});

const StateSchema = z.object({
  containerId: z.string(),
  containerName: z.string(),
  imageName: z.string(),
  port: z.number(),
  url: z.string(),
  status: z.string(),
  startedAt: z.string(),
});

async function runCmd(
  cmd: string[],
  logger: { info: (msg: string) => void; error: (msg: string) => void },
): Promise<{ stdout: string; stderr: string; code: number }> {
  logger.info(`$ ${cmd.join(" ")}`);
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  const stdout = new TextDecoder().decode(output.stdout).trim();
  const stderr = new TextDecoder().decode(output.stderr).trim();
  if (stdout) logger.info(stdout);
  if (stderr && !output.success) logger.error(stderr);
  return { stdout, stderr, code: output.code };
}

const ASSETS_DIR = new URL("./express_hello_files/", import.meta.url)
  .pathname;

async function loadAsset(filename: string): Promise<string> {
  return await Deno.readTextFile(`${ASSETS_DIR}${filename}`);
}

export const model = {
  type: "@bixu/express-hello",
  version: "2026.03.19.3",
  globalArguments: GlobalArgsSchema,
  resources: {
    state: {
      description: "Running container state",
      schema: StateSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },
  methods: {
    start: {
      description:
        "Build the Deno Docker image and start the container. Access via browser at http://localhost:<port>",
      arguments: z.object({}),
      execute: async (_args: unknown, context: {
        globalArgs: { port: number; containerName: string };
        logger: { info: (msg: string) => void; error: (msg: string) => void };
        writeResource: (
          spec: string,
          instance: string,
          data: Record<string, unknown>,
        ) => Promise<unknown>;
        readResource: (
          spec: string,
          instance: string,
        ) => Promise<Record<string, unknown> | null>;
      }) => {
        const { port, containerName } = context.globalArgs;
        const imageName = "swamp-express-hello:latest";
        const logger = context.logger;

        // Purge cached swamp bundle and Docker image so code changes are
        // always picked up on next start.
        const bundlePath = ".swamp/bundles/express_hello.js";
        try {
          await Deno.remove(bundlePath);
          logger.info(`Removed stale bundle: ${bundlePath}`);
        } catch {
          // Bundle doesn't exist yet — nothing to clean
        }
        await runCmd(["docker", "rmi", "-f", imageName], logger);

        // Check if already running
        const existing = await context.readResource("state", "current");
        if (existing) {
          const check = await runCmd(
            ["docker", "inspect", "-f", "{{.State.Running}}", containerName],
            logger,
          );
          if (check.code === 0 && check.stdout === "true") {
            throw new Error(
              `Container ${containerName} is already running at http://localhost:${existing.port}`,
            );
          }
        }

        // Load assets from separate files
        const [dockerfile, appTs, indexHtml] = await Promise.all([
          loadAsset("Dockerfile"),
          loadAsset("app.ts"),
          loadAsset("index.html"),
        ]);

        // Write build context to a temp dir
        const tmpDir = await Deno.makeTempDir({ prefix: "swamp-express-" });
        await Deno.writeTextFile(`${tmpDir}/Dockerfile`, dockerfile);
        await Deno.writeTextFile(`${tmpDir}/app.ts`, appTs);
        await Deno.writeTextFile(`${tmpDir}/index.html`, indexHtml);

        // Build image
        logger.info("Building Docker image...");
        const build = await runCmd(
          ["docker", "build", "--no-cache", "-t", imageName, tmpDir],
          logger,
        );
        if (build.code !== 0) {
          throw new Error(`Docker build failed: ${build.stderr}`);
        }

        // Remove stale container if exists
        await runCmd(["docker", "rm", "-f", containerName], logger);

        // Run container
        logger.info(`Starting container on port ${port}...`);
        const run = await runCmd([
          "docker",
          "run",
          "-d",
          "--name",
          containerName,
          "-p",
          `${port}:3000`,
          imageName,
        ], logger);
        if (run.code !== 0) {
          throw new Error(`Docker run failed: ${run.stderr}`);
        }

        const containerId = run.stdout;

        // Clean up temp dir
        await Deno.remove(tmpDir, { recursive: true });

        const url = `http://localhost:${port}`;
        logger.info(`Container started: ${url}`);

        const handle = await context.writeResource("state", "current", {
          containerId,
          containerName,
          imageName,
          port,
          url,
          status: "running",
          startedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    stop: {
      description: "Stop and remove the running container",
      arguments: z.object({}),
      execute: async (_args: unknown, context: {
        globalArgs: { containerName: string };
        logger: { info: (msg: string) => void; error: (msg: string) => void };
        readResource: (
          spec: string,
          instance: string,
        ) => Promise<Record<string, unknown> | null>;
      }) => {
        const { containerName } = context.globalArgs;
        const logger = context.logger;

        logger.info(`Stopping container ${containerName}...`);
        const stop = await runCmd(
          ["docker", "rm", "-f", containerName],
          logger,
        );
        if (stop.code !== 0) {
          throw new Error(`Failed to stop container: ${stop.stderr}`);
        }
        logger.info("Container stopped and removed.");
        return { dataHandles: [] };
      },
    },

    status: {
      description: "Check if the container is running",
      arguments: z.object({}),
      execute: async (_args: unknown, context: {
        globalArgs: { containerName: string };
        logger: { info: (msg: string) => void; error: (msg: string) => void };
        writeResource: (
          spec: string,
          instance: string,
          data: Record<string, unknown>,
        ) => Promise<unknown>;
        readResource: (
          spec: string,
          instance: string,
        ) => Promise<Record<string, unknown> | null>;
      }) => {
        const { containerName } = context.globalArgs;
        const logger = context.logger;

        const check = await runCmd(
          [
            "docker",
            "inspect",
            "-f",
            "{{.State.Running}}|{{.Id}}|{{.NetworkSettings.Ports}}",
            containerName,
          ],
          logger,
        );

        const existing = await context.readResource("state", "current");
        const port = existing?.port ?? 3000;

        if (check.code !== 0) {
          logger.info(`Container ${containerName} is not running.`);
          const handle = await context.writeResource("state", "current", {
            containerId: "",
            containerName,
            imageName: "swamp-express-hello:latest",
            port,
            url: `http://localhost:${port}`,
            status: "stopped",
            startedAt: existing?.startedAt ?? "",
          });
          return { dataHandles: [handle] };
        }

        const running = check.stdout.startsWith("true");
        logger.info(
          `Container ${containerName} is ${running ? "running" : "stopped"}.`,
        );

        const handle = await context.writeResource("state", "current", {
          containerId: existing?.containerId ?? "",
          containerName,
          imageName: "swamp-express-hello:latest",
          port,
          url: `http://localhost:${port}`,
          status: running ? "running" : "stopped",
          startedAt: existing?.startedAt ?? "",
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
