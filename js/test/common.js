import fs from "fs";

export function loadABI(path) {
  let content;
  // Try to read from the provided path directly
  try {
    content = fs.readFileSync(path, "utf8");
  } catch {
    // If that fails, try to prepend 'out/'
    try {
      content = fs.readFileSync(`out/${path}`, "utf8");
    } catch {
      // If that also fails, try to prepend '../out/'
      try {
        content = fs.readFileSync(`../out/${path}`, "utf8");
      } catch {
        throw new Error(`Could not find ABI file at paths: ${path}, out/${path}, ../out/${path}`);
      }
    }
  }
  const artifact = JSON.parse(content);
  return Array.isArray(artifact) ? artifact : artifact.abi;
}


