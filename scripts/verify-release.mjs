import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function verifyManifestSignature(bytes, signature, publicKey) {
  const raw = Buffer.from(publicKey.trim(), "base64");
  if (raw.length !== 32) throw new Error("Invalid manifest public key.");
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
    format: "der",
    type: "spki",
  });
  // NSH 0.5.0's domain-separated message. Verify the exact bytes, not reserialized JSON.
  const message = Buffer.concat([Buffer.from("nsh-updater-manifest\0"), bytes]);
  if (!verify(null, message, key, Buffer.from(signature.trim(), "base64")))
    throw new Error("Manifest signature does not match the pinned public key.");
}
export function verifyAsset(asset, bytes) {
  if (
    bytes.length !== asset.size ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new Error("Release asset hash or size mismatch.");
}
export function releaseFilename(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== path.basename(value) ||
    value.includes("\\") ||
    value === "." ||
    value === ".." ||
    /[?#%]/.test(value)
  )
    throw new Error("Release assets must be local basenames beside the manifest.");
  return value;
}
export function verifyRelease(directory, requireNotarized = false) {
  const config = JSON.parse(readFileSync(path.join(root, "nsh.json"), "utf8"));
  const bytes = readFileSync(path.join(directory, "latest.json"));
  verifyManifestSignature(
    bytes,
    readFileSync(path.join(directory, "latest.json.sig"), "utf8"),
    config.updater.publicKey,
  );
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (
    manifest.id !== config.id ||
    manifest.version !== config.version ||
    manifest.package?.version !== config.version ||
    manifest.package.build !== config.build ||
    manifest.package.minRuntime !== config.minRuntime
  )
    throw new Error("Manifest identity/version/build/runtime mismatch.");
  for (const asset of [...Object.values(manifest.platforms), manifest.package]) {
    verifyAsset(asset, readFileSync(path.join(directory, releaseFilename(asset.url))));
  }
  const certificate = JSON.parse(
    readFileSync(path.join(root, "release/keys/release.cert"), "utf8"),
  );
  const certBody = JSON.parse(Buffer.from(certificate.body, "base64").toString("utf8"));
  if (certBody.notAfter * 1000 <= Date.now()) throw new Error("Release certificate has expired.");
  const result = spawnSync(
    process.env.NSH_BIN || "nsh",
    [
      "verify",
      path.join(directory, releaseFilename(manifest.package.url)),
      "--root",
      path.join(root, "release/keys/root.pub"),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("OTA certificate/package verification failed.");
  if (requireNotarized) {
    const distribution = JSON.parse(
      readFileSync(path.join(directory, "MACOS_DISTRIBUTION.json"), "utf8"),
    );
    if (
      distribution.notarized !== true ||
      distribution.version !== config.version ||
      distribution.archiveSha256 !== Object.values(manifest.platforms)[0]?.sha256
    )
      throw new Error("Missing notarization evidence for this exact archive.");
  }
  console.log(
    "Verified manifest signature, identity, package trust, and all referenced hashes/sizes.",
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(path.join(root, "nsh.json"), "utf8"));
  verifyRelease(
    path.join(root, `dist/v${config.version}`),
    process.argv.includes("--require-notarized"),
  );
}
