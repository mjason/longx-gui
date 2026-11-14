import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { validateNotarizationEnvironment } from "./notarize-macos.mjs";
import { releaseFilename, verifyAsset, verifyManifestSignature } from "./verify-release.mjs";

test("NSH domain-separated manifest signatures reject tampering and unframed signatures", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicBytes = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
  const bytes = Buffer.from('{"version":"0.1.0"}');
  const sig = sign(
    null,
    Buffer.concat([Buffer.from("nsh-updater-manifest\0"), bytes]),
    privateKey,
  ).toString("base64");
  verifyManifestSignature(bytes, sig, publicBytes);
  assert.throws(() =>
    verifyManifestSignature(Buffer.from('{"version":"0.2.0"}'), sig, publicBytes),
  );
  assert.throws(() =>
    verifyManifestSignature(bytes, sign(null, bytes, privateKey).toString("base64"), publicBytes),
  );
});
test("release artifacts must match both size and SHA256", () => {
  const bytes = Buffer.from("signed release content");
  const asset = { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  verifyAsset(asset, bytes);
  assert.throws(() => verifyAsset(asset, Buffer.from("changed")));
  assert.throws(() => verifyAsset({ ...asset, size: 0 }, bytes));
});
test("manifest filenames cannot escape the release directory", () => {
  assert.equal(
    releaseFilename("Longx-GUI-0.1.0-macos-aarch64.tar.gz"),
    "Longx-GUI-0.1.0-macos-aarch64.tar.gz",
  );
  for (const value of [
    "../key.secret",
    "/tmp/key",
    "a\\b",
    "https://other/app",
    "a?url=b",
    "%2e%2e",
    ".",
    "..",
  ])
    assert.throws(() => releaseFilename(value));
});
test("full release refuses missing Apple credentials or the wrong certificate class", () => {
  assert.throws(() => validateNotarizationEnvironment({}));
  const env = {
    APPLE_SIGN_IDENTITY: "Apple Development: example",
    APPLE_KEYCHAIN_PATH: "/fixture/keychain",
    APPLE_API_KEY_PATH: "/fixture/key.p8",
    APPLE_API_KEY_ID: "fixture",
    APPLE_API_ISSUER: "fixture",
  };
  assert.throws(() => validateNotarizationEnvironment(env), /Developer ID Application/);
  validateNotarizationEnvironment({
    ...env,
    APPLE_SIGN_IDENTITY: "Developer ID Application: example (TEAM)",
  });
});
