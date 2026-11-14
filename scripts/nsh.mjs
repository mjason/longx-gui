import { spawnSync } from "node:child_process";

// NSH remains the compiler/test runner; npm only coordinates development tools.
// An explicit path is useful for project-local installations not on PATH.
const executable = process.env.NSH_BIN || "nsh";
const result = spawnSync(executable, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(
    `Cannot run NSH (${executable}). Put nsh on PATH or set NSH_BIN to its executable path.`,
  );
  console.error(result.error.message);
  process.exit(1);
}
if (result.signal) {
  console.error(`NSH was interrupted by ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
