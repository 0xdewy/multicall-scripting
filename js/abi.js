import { readFileSync } from "fs";

export function loadABI(path) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    try {
      content = readFileSync(`./${path}`, "utf8");
    } catch {
      try {
        content = readFileSync(`../out/${path}`, "utf8");
      } catch {
        throw new Error(`Could not find ABI file at paths: ${path}, ./${path}, ../out/${path}`);
      }
    }
  }
  const artifact = JSON.parse(content);
  return Array.isArray(artifact) ? artifact : artifact.abi;
}
