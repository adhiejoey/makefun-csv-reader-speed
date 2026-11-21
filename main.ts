// The program the harness runs: node /bot/main.ts (node 22). It reads every case
// from /input/cases.json, answers each one alone with run() from solve.js, and
// writes /output/answers.json: one answer per case, in the cases' order.
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for
// /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported, so all of its
// work runs under it (the house baseline runs with it, and an entry may tune
// V8's flags the same way).
setFlagsFromString('--no-incremental-marking');

const solved = await import(new URL('./solve.js', import.meta.url).href);
const run = solved.run;

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = [];
for (const c of cases) answers.push(run(c.input));
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
