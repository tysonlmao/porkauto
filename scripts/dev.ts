#!/usr/bin/env bun

async function freePort(port: number) {
  try {
    const proc = Bun.spawn(["fuser", "-k", `${port}/tcp`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  } catch {
    // fuser may be unavailable; ignore
  }
}

await freePort(3001);

const procs = [
  { name: "renderer", cmd: ["bun", "run", "dev:renderer"] },
  { name: "app", cmd: ["bun", "run", "dev:app"] },
  { name: "api", cmd: ["bun", "run", "dev:api"] },
] as const;

const children: ReturnType<typeof Bun.spawn>[] = [];

for (const proc of procs) {
  const child = Bun.spawn(proc.cmd, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });
  children.push(child);
  console.log(`[dev] started ${proc.name} (pid ${child.pid})`);
}

const shutdown = () => {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // already exited
    }
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race(children.map((c) => c.exited));
shutdown();
