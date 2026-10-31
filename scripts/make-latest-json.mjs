// After `desktop:build`: write latest.json for the updater and gather release files in dist-win/.
// Upload the three files in dist-win/ to GitHub Release tag v<version>.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = conf.version;
const target = process.env.CARGO_TARGET_DIR || "src-tauri/target";
const nsisDir = join(target, "release", "bundle", "nsis");
const setup = `${conf.productName}_${version}_x64-setup.exe`;
const sigPath = join(nsisDir, `${setup}.sig`);

if (!existsSync(sigPath)) {
  console.error(`Missing ${sigPath}. Is TAURI_SIGNING_PRIVATE_KEY set?`);
  process.exit(1);
}

// GitHub turns spaces in uploaded asset names into dots.
const assetName = setup.replaceAll(" ", ".");
const latest = {
  version,
  notes: process.env.RELEASE_NOTES || "",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `https://github.com/jagwey/web-shooter/releases/download/v${version}/${assetName}`,
    },
  },
};

mkdirSync("dist-win", { recursive: true });
copyFileSync(join(nsisDir, setup), join("dist-win", assetName));
copyFileSync(sigPath, join("dist-win", `${assetName}.sig`));
writeFileSync(join("dist-win", "latest.json"), JSON.stringify(latest, null, 2));
console.log(`dist-win/ ready for v${version}: ${assetName}, .sig, latest.json`);
