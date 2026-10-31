import { cpSync, existsSync, mkdirSync } from "node:fs";

const source = "node_modules/@mediapipe/tasks-vision/wasm";
const target = "public/mediapipe";

if (!existsSync(source)) {
  console.error("MediaPipe wasm is missing. Run npm install first.");
  process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
