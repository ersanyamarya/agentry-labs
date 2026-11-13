// Packs the CLI, installs the tarball into a temp prefix and runs it, so a broken package fails here and not after publish.
// Run: npm run pack:check (builds first)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "agentry-pack-"));
const home = join(tmp, "home");
const prefix = join(tmp, "prefix");
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });

try {
  run("npm", ["run", "build"], { stdio: "inherit" });
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", tmp])
  );
  const tarball = join(tmp, packed[0].filename);
  console.log(
    `packed ${packed[0].filename}: ${packed[0].entryCount} files, ${packed[0].unpackedSize} bytes unpacked`
  );
  run("npm", ["install", "-g", "--prefix", prefix, tarball], {
    stdio: "inherit",
  });
  const env = {
    ...process.env,
    HOME: home,
    AGENTRY_HOME: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
  };
  const bin = join(prefix, "bin", "agentry");
  for (const args of [["--help"], ["--version"], ["status", "--json"]]) {
    const out = run(bin, args, { env });
    if (!out.trim()) {
      throw new Error(`agentry ${args.join(" ")} printed nothing`);
    }
    console.log(`ok: agentry ${args.join(" ")}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
