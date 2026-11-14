import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notarizeMacos } from "./notarize-macos.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const config = JSON.parse(readFileSync("nsh.json", "utf8"));
const npm = JSON.parse(readFileSync("package.json", "utf8"));
const mode = process.argv[2] ?? "full";
if (!["full", "ota"].includes(mode))
  throw new Error("Usage: npm run release:prepare -- [full|ota]");
if (config.version !== npm.version || !Number.isSafeInteger(config.build) || config.build < 1)
  throw new Error("Version/build configuration is inconsistent.");
if (config.id !== "io.github.mjason.longxgui" || config.updater.github !== "mjason/longx-gui")
  throw new Error("Unexpected release identity.");
const nsh = process.env.NSH_BIN || "nsh";
const keyDir = path.resolve(process.env.NSH_KEY_DIR || ".longx/local/release-keys");
const releaseKey = path.join(keyDir, "release.secret");
const updateKey = path.join(keyDir, "update.secret");
const cert = process.env.NSH_RELEASE_CERT_FILE || "release/keys/release.cert";
for (const key of [releaseKey, updateKey]) {
  if (!existsSync(key))
    throw new Error(`Missing signing key: ${path.basename(key)}. See release/README.md.`);
  if (process.platform !== "win32" && statSync(key).mode & 0o077)
    throw new Error(`Signing key must only be readable by its owner: ${path.basename(key)}`);
}
const notes = `release/notes/v${config.version}.md`;
if (!existsSync(notes)) throw new Error(`Missing release notes: ${notes}`);
const out = path.resolve(`dist/v${config.version}`);
if (existsSync(out) && readdirSync(out).length)
  throw new Error(
    "Release output already exists; use a new version, or move the previous output aside for comparison.",
  );
mkdirSync(out, { recursive: true });
function run(args) {
  const result = spawnSync(nsh, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`nsh ${args[0]} failed.`);
}
const archives = [];
if (mode === "full") {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error(
      "Initial full release is macOS Apple Silicon only; use ota for platform-independent TSX.",
    );
  const native = path.join(out, "native");
  run(["package", "--target", "macos", "--out", native]);
  for (const name of readdirSync(native).filter((name) => name.endsWith(".tar.gz"))) {
    if (process.env.MACOS_NOTARIZE === "1")
      notarizeMacos(
        path.join(native, `${config.name}.app`),
        path.join(native, name),
        out,
        config.version,
      );
    copyFileSync(path.join(native, name), path.join(out, name));
    archives.push(path.join(out, name));
  }
  if (archives.length !== 1) throw new Error("Expected exactly one macOS archive.");
}
const pkg = path.join(out, `${config.id}-${config.build}.nshpkg`);
run(["publish", "--key", releaseKey, "--cert", cert, "--source-map", "file", "-o", pkg]);
run(["verify", pkg, "--root", "release/keys/root.pub"]);
run([
  "update-manifest",
  ...archives,
  "--package",
  pkg,
  "--notes",
  notes,
  "--key",
  updateKey,
  "-o",
  out,
]);
copyFileSync(notes, path.join(out, "RELEASE_NOTES.md"));
const assets = readdirSync(out)
  .filter(
    (name) =>
      name.endsWith(".tar.gz") ||
      name.endsWith(".nshpkg") ||
      ["latest.json", "latest.json.sig", "RELEASE_NOTES.md", "MACOS_DISTRIBUTION.json"].includes(
        name,
      ),
  )
  .sort();
writeFileSync(
  path.join(out, "SHA256SUMS"),
  `${assets
    .map(
      (name) =>
        `${createHash("sha256")
          .update(readFileSync(path.join(out, name)))
          .digest("hex")}  ${name}`,
    )
    .join("\n")}\n`,
);
console.log(
  `Prepared ${config.version} build ${config.build} (${mode}) in ${path.relative(root, out)}.`,
);
console.log("No tag, upload, public release, application install, or restart was performed.");
