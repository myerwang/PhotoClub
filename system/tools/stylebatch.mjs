#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  applyResult,
  auditBatch,
  batchStatus,
  completePage,
  enqueueResults,
  initializeBatch,
  nextResult,
} from '../lib/stylebatch.mjs';

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function jsonFile(filePath) {
  if (!filePath) throw new Error('JSON input file is required');
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rootDir = path.resolve(option(args, '--root', process.cwd()));
  switch (command) {
    case 'init':
      await initializeBatch(rootDir);
      print(await batchStatus(rootDir));
      break;
    case 'enqueue': {
      const input = await jsonFile(args[1]);
      print(await enqueueResults(rootDir, Array.isArray(input) ? input : input.results));
      break;
    }
    case 'next':
      print(await nextResult(rootDir));
      break;
    case 'apply':
      print(await applyResult(rootDir, await jsonFile(args[1])));
      break;
    case 'page':
      print(await completePage(rootDir, Number(args[1])));
      break;
    case 'audit':
      print(await auditBatch(rootDir));
      break;
    case 'status':
      print(await batchStatus(rootDir));
      break;
    default:
      throw new Error('usage: stylebatch <init|enqueue FILE|next|apply FILE|page NUMBER|audit|status> [--root PATH]');
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
