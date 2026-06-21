#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncStylePreview } from '../../web/lib/stylepreview.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function usage() {
  throw new Error('usage: stylepreview --style STYLE --job JOB --output FILE [--output FILE] [--root PATH]');
}

function readValue(args, index) {
  if (index >= args.length) usage();
  const value = args[index];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    usage();
  }
  return value;
}

function parseArgs(args) {
  const result = {
    rootDir: repoRoot,
    styleId: null,
    jobId: null,
    outputPaths: [],
  };
  const rawOutputPaths = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--root':
        index += 1;
        result.rootDir = path.resolve(readValue(args, index));
        break;
      case '--style':
        index += 1;
        result.styleId = readValue(args, index);
        break;
      case '--job':
        index += 1;
        result.jobId = readValue(args, index);
        break;
      case '--output':
        index += 1;
        rawOutputPaths.push(readValue(args, index));
        break;
      default:
        usage();
    }
  }

  if (!result.styleId || !result.jobId || rawOutputPaths.length === 0) {
    usage();
  }

  result.outputPaths = rawOutputPaths.map((outputPath) => (
    path.isAbsolute(outputPath) ? outputPath : path.resolve(result.rootDir, outputPath)
  ));

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const record = await syncStylePreview(options);
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error && error.message ? error.message : 'stylepreview failed'}\n`);
  process.exitCode = 1;
});
