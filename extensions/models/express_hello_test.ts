import {
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { model } from "./express_hello.ts";

// --- Model structure ---

Deno.test("model exports correct type and version", () => {
  assertEquals(model.type, "@bixu/express-hello");
  assertMatch(model.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
});

Deno.test("model has required methods", () => {
  const methodNames = Object.keys(model.methods);
  assertEquals(methodNames.sort(), ["start", "status", "stop"]);
});

Deno.test("model has state resource", () => {
  assertExists(model.resources.state);
  assertEquals(model.resources.state.lifetime, "infinite");
});

// --- Schema validation ---

Deno.test("globalArguments schema has correct defaults", () => {
  const parsed = model.globalArguments.parse({});
  assertEquals(parsed.port, 3000);
  assertEquals(parsed.containerName, "swamp-express-hello");
});

Deno.test("globalArguments schema accepts overrides", () => {
  const parsed = model.globalArguments.parse({
    port: 8080,
    containerName: "my-app",
  });
  assertEquals(parsed.port, 8080);
  assertEquals(parsed.containerName, "my-app");
});

Deno.test("globalArguments schema rejects invalid port", () => {
  let threw = false;
  try {
    model.globalArguments.parse({ port: "not-a-number" });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("state resource schema validates correct data", () => {
  const result = model.resources.state.schema.safeParse({
    containerId: "abc123",
    containerName: "test",
    imageName: "test:latest",
    port: 3000,
    url: "http://localhost:3000",
    status: "running",
    startedAt: "2026-01-01T00:00:00Z",
  });
  assertEquals(result.success, true);
});

Deno.test("state resource schema rejects missing fields", () => {
  const result = model.resources.state.schema.safeParse({ containerId: "abc" });
  assertEquals(result.success, false);
});

// --- Method metadata ---

Deno.test("start method has a description", () => {
  assertStringIncludes(model.methods.start.description, "start");
});

Deno.test("stop method has a description", () => {
  assertStringIncludes(model.methods.stop.description, "Stop");
});

Deno.test("status method has a description", () => {
  assertStringIncludes(model.methods.status.description, "container");
});

Deno.test("all methods accept empty arguments", () => {
  for (const [name, method] of Object.entries(model.methods)) {
    const result = method.arguments.safeParse({});
    assertEquals(result.success, true, `${name} should accept empty args`);
  }
});

// --- Embedded Dockerfile ---

Deno.test("Dockerfile uses denoland/deno base image", () => {
  // Access the embedded Dockerfile via the module's string constants.
  // We re-import the raw source to inspect embedded strings.
  const source = Deno.readTextFileSync(
    new URL("./express_hello.ts", import.meta.url).pathname,
  );
  assertStringIncludes(source, "FROM denoland/deno:alpine");
});

Deno.test("Dockerfile exposes port 3000", () => {
  const source = Deno.readTextFileSync(
    new URL("./express_hello.ts", import.meta.url).pathname,
  );
  assertStringIncludes(source, "EXPOSE 3000");
});

Deno.test("Dockerfile uses --allow-net and --allow-read permissions", () => {
  const source = Deno.readTextFileSync(
    new URL("./express_hello.ts", import.meta.url).pathname,
  );
  assertStringIncludes(source, "--allow-net");
  assertStringIncludes(source, "--allow-read=.");
});

// --- Embedded app code ---

Deno.test("embedded app uses Deno.serve", () => {
  const source = Deno.readTextFileSync(
    new URL("./express_hello.ts", import.meta.url).pathname,
  );
  assertStringIncludes(source, "Deno.serve");
});

Deno.test("embedded app has escapeHtml function", () => {
  const source = Deno.readTextFileSync(
    new URL("./express_hello.ts", import.meta.url).pathname,
  );
  assertStringIncludes(source, "function escapeHtml");
});

Deno.test("embedded HTML template has image placeholder", () => {
  const source = Deno.readTextFileSync(
    new URL("./express_hello.ts", import.meta.url).pathname,
  );
  assertStringIncludes(source, "{{IMAGE_BLOCK}}");
});

// --- swamp model validate integration (requires swamp CLI) ---

Deno.test({
  name: "swamp model validate passes",
  ignore: !Deno.env.get("SWAMP_INTEGRATION"),
}, async () => {
  const proc = new Deno.Command("swamp", {
    args: ["model", "validate", "hello-app", "--json"],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  assertEquals(output.code, 0, "swamp model validate should exit 0");
  const result = JSON.parse(new TextDecoder().decode(output.stdout));
  assertEquals(result.passed, true);
  for (const v of result.validations) {
    assertEquals(v.passed, true, `Validation "${v.name}" should pass`);
  }
});
