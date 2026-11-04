import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { aptGet, ffmpeg } from "@trigger.dev/build/extensions/core";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { pythonExtension } from "@trigger.dev/python/extension";
import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4 — see ARCHITECTURE.md "Background jobs". The "modern" Prisma
// extension keeps @prisma/client external so the generated Prisma 7 client
// works in the worker (tasks import the services).
//
// Python runs markitdown for `convert-to-markdown` (python/markitdown_convert.py).
// Deployed, the extension installs python/requirements.txt into the image; in
// dev it runs the apps/api/.venv interpreter, which you install by hand
// (docs/features/external-api.md "Local setup"). ffmpeg decodes audio for
// markitdown's transcription and exiftool reads image and audio metadata.
const devPython = resolve(
  process.cwd(),
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);

// Passed as `requirements`, not `requirementsFile`: with a file in a
// subdirectory the extension (4.5.x) COPYs it to the image root but points pip
// at the original path, so the deploy build fails with "Could not open
// requirements file". The list form writes requirements.txt in place instead.
const pythonRequirements = readFileSync("./python/requirements.txt", "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

export default defineConfig({
  project: "proj_rjcebnrktkgcqviaukov",
  runtime: "bun",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  build: {
    extensions: [
      prismaExtension({ mode: "modern" }),
      pythonExtension({
        scripts: ["./python/**/*.py"],
        requirements: pythonRequirements,
        devPythonBinaryPath: devPython,
      }),
      ffmpeg(),
      aptGet({ packages: ["libimage-exiftool-perl"] }),
    ],
  },
});
