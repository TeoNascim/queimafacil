import { cpSync, existsSync, mkdirSync } from "node:fs";

if (!existsSync("dist/server/index.mjs")) {
  throw new Error("A saída do servidor não foi gerada.");
}

cpSync("dist/server/index.mjs", "dist/server/index.js");
mkdirSync("dist/.openai", { recursive: true });
cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
