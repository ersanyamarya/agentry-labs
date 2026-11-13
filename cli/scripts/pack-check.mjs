// Packs the CLI, installs the tarball into a temp prefix and runs it, so a broken package fails here and not after publish.
// It checks the packed size against a budget, runs the CLI, then starts `agentry ui` from the installed copy and loads a
// page and one rpc read through the token and cookie. Run: npm run pack:check (builds first)
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Unpacked size of the published tarball. Raise it deliberately, with the reason in the commit.
const BUDGET_BYTES = 5_200_000;

const root = join(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "agentry-pack-"));
const home = join(tmp, "home");
const prefix = join(tmp, "prefix");
const project = join(tmp, "project");
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });

const smokeUi = async (bin, env) => {
  const child = spawn(bin, ["ui", "--no-open"], { cwd: project, env });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`agentry ui printed no URL:\n${log}`)),
        20_000
      );
      const look = setInterval(() => {
        const found = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]+/);
        if (found) {
          clearTimeout(timer);
          clearInterval(look);
          resolve(found[0]);
        }
      }, 50);
    });
    const exchange = await fetch(url, { redirect: "manual" });
    if (exchange.status !== 303) {
      throw new Error(`token exchange gave ${exchange.status}, wanted 303`);
    }
    const [cookie = ""] = (exchange.headers.get("set-cookie") ?? "").split(";");
    const { origin } = new URL(url);
    const page = await fetch(`${origin}/skills`, { headers: { cookie } });
    const html = await page.text();
    if (page.status !== 200 || !html.includes("agentry")) {
      throw new Error(`/skills gave ${page.status} without the app`);
    }
    const input = encodeURIComponent(
      JSON.stringify({ json: { dir: project } })
    );
    const load = await fetch(`${origin}/rpc/load?data=${input}`, {
      headers: { cookie },
    });
    if (load.status !== 200 || !(await load.text()).includes("backupsDir")) {
      throw new Error(`rpc load gave ${load.status}`);
    }
    const bare = await fetch(`${origin}/skills`);
    if (bare.status !== 401) {
      throw new Error(
        `a request without the cookie gave ${bare.status}, wanted 401`
      );
    }
    console.log(
      "ok: agentry ui serves the app, the rpc read and refuses a caller without the cookie"
    );
  } finally {
    child.kill("SIGINT");
  }
};

try {
  run("npm", ["run", "build"], { stdio: "inherit" });
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", tmp])
  );
  const [{ filename, entryCount, unpackedSize }] = packed;
  console.log(
    `packed ${filename}: ${entryCount} files, ${unpackedSize} bytes unpacked (budget ${BUDGET_BYTES})`
  );
  if (unpackedSize > BUDGET_BYTES) {
    throw new Error(
      `the package is ${unpackedSize} bytes unpacked, over the ${BUDGET_BYTES} budget`
    );
  }
  run("npm", ["install", "-g", "--prefix", prefix, join(tmp, filename)], {
    stdio: "inherit",
  });
  mkdirSync(project, { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    AGENTRY_HOME: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
  };
  const bin = join(prefix, "bin", "agentry");
  for (const args of [["--help"], ["--version"], ["status", "--json"]]) {
    if (!run(bin, args, { env }).trim()) {
      throw new Error(`agentry ${args.join(" ")} printed nothing`);
    }
    console.log(`ok: agentry ${args.join(" ")}`);
  }
  await smokeUi(bin, env);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
