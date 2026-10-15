import { cp, mkdir } from "node:fs/promises";

// Serve workers and language assets from our own origin, including offline use.
const target = new URL("../public/monaco/vs/", import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  new URL("../node_modules/monaco-editor/min/vs/", import.meta.url),
  target,
  { recursive: true },
);
