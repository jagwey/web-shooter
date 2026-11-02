// Verify public release artifacts with the updater public key. Never reads private keys.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const manifest = JSON.parse(readFileSync("dist-win/latest.json", "utf8"));
const name = `${config.productName}_${config.version}_x64-setup.exe`.replaceAll(" ", ".");
const binary = readFileSync(`dist-win/${name}`);
const signatureFile = readFileSync(`dist-win/${name}.sig`, "utf8").trim();
const platform = manifest.platforms["windows-x86_64"];
assert.equal(manifest.version, config.version);
assert.equal(platform.signature, signatureFile);
assert.equal(platform.url, `https://github.com/jagwey/web-shooter/releases/download/v${config.version}/${name}`);

const publicText = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8").trim().split(/\r?\n/);
const publicPacket = Buffer.from(publicText[1], "base64");
const signatureText = Buffer.from(signatureFile, "base64").toString("utf8").trim().split(/\r?\n/);
const packet = Buffer.from(signatureText[1], "base64");
assert.equal(publicPacket.length, 42);
assert.equal(packet.length, 74);
assert.deepEqual(packet.subarray(2, 10), publicPacket.subarray(2, 10), "updater key ID matches");
const publicKey = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicPacket.subarray(10)]),
  format: "der", type: "spki",
});
const algorithm = packet.subarray(0, 2).toString("ascii");
assert.ok(algorithm === "ED" || algorithm === "Ed");
const message = algorithm === "ED" ? createHash("blake2b512").update(binary).digest() : binary;
assert.equal(verify(null, message, publicKey, packet.subarray(10)), true, "installer signature is valid");
assert.ok(signatureText[2].startsWith("trusted comment: "));
const globalMessage = Buffer.concat([packet.subarray(10), Buffer.from(signatureText[2].slice(17))]);
assert.equal(verify(null, globalMessage, publicKey, Buffer.from(signatureText[3], "base64")), true, "trusted comment signature is valid");
const tampered = Buffer.from(message);
tampered[0] ^= 1;
assert.equal(verify(null, tampered, publicKey, packet.subarray(10)), false, "tampered data is rejected");
const sha256 = createHash("sha256").update(binary).digest("hex");
assert.equal(readFileSync("dist-win/SHA256SUMS.txt", "utf8").trim(), `${sha256}  ${name}`);
console.log(JSON.stringify({ version: config.version, bytes: binary.length, sha256, updaterSignature: "verified", tamperCheck: "rejected" }));
