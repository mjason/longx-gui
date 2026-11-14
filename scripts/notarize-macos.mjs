import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import path from "node:path";

export function validateNotarizationEnvironment(env) {
  const required = [
    "APPLE_SIGN_IDENTITY",
    "APPLE_KEYCHAIN_PATH",
    "APPLE_API_KEY_PATH",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ];
  for (const name of required)
    if (!env[name])
      throw new Error(`Notarization requires ${name}; refusing an unsigned full release.`);
  if (!env.APPLE_SIGN_IDENTITY.startsWith("Developer ID Application:"))
    throw new Error(
      "Use a Developer ID Application identity, not Apple Development/Distribution/Installer.",
    );
}
export function notarizeMacos(app, archive, output, version) {
  validateNotarizationEnvironment(process.env);
  function run(command, args) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`${command} failed; no release manifest will be generated.`);
  }
  const signArgs = [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    process.env.APPLE_SIGN_IDENTITY,
    "--keychain",
    process.env.APPLE_KEYCHAIN_PATH,
  ];
  function signMachO(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) signMachO(file);
      else if (entry.isFile()) {
        const fd = openSync(file, "r");
        const header = Buffer.alloc(4);
        try {
          readSync(fd, header, 0, 4, 0);
        } finally {
          closeSync(fd);
        }
        if (
          [
            "feedface",
            "feedfacf",
            "cefaedfe",
            "cffaedfe",
            "cafebabe",
            "bebafeca",
            "cafebabf",
            "bfbafeca",
          ].includes(header.toString("hex"))
        )
          run("/usr/bin/codesign", [...signArgs, file]);
      }
    }
  }
  // NSH's app is a flat launcher plus resources; sign nested Mach-O files before the bundle.
  signMachO(path.join(app, "Contents"));
  run("/usr/bin/codesign", [...signArgs, app]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  const zip = path.join(output, "native", "notarization.zip");
  run("/usr/bin/ditto", ["-c", "-k", "--keepParent", app, zip]);
  run("/usr/bin/xcrun", [
    "notarytool",
    "submit",
    zip,
    "--key",
    process.env.APPLE_API_KEY_PATH,
    "--key-id",
    process.env.APPLE_API_KEY_ID,
    "--issuer",
    process.env.APPLE_API_ISSUER,
    "--wait",
    "--timeout",
    "30m",
  ]);
  run("/usr/bin/xcrun", ["stapler", "staple", app]);
  run("/usr/bin/xcrun", ["stapler", "validate", app]);
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
  run("/usr/bin/tar", ["-czf", archive, "-C", path.dirname(app), path.basename(app)]);
  writeFileSync(
    path.join(output, "MACOS_DISTRIBUTION.json"),
    `${JSON.stringify(
      {
        version,
        notarized: true,
        identity: process.env.APPLE_SIGN_IDENTITY,
        archiveSha256: createHash("sha256").update(readFileSync(archive)).digest("hex"),
      },
      null,
      2,
    )}\n`,
  );
}
