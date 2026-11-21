# Read broken CSV files faster

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/adhiejoey/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/adhiejoey/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0 — [make.fun bounty: Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121). Entered with referral [https://make.fun/r/mcpf7r82](https://make.fun/r/mcpf7r82).

## What it is

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly
what csv-reader 1.0.0 returns for every input: `{columns, rows, errors}` for
`{text, header}` — including csv-reader's full broken-row policy (BOM drop,
stray CRs, unterminated quotes, quote junk, short/long rows, empty lines).
`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each one alone with `run`, and writes
`/output/answers.json`.

## How it is faster

One left-to-right pass, but instead of building each field one character at a
time, fields are sliced out of the input whole. A quoted field takes a
shortcut when its content holds no doubled quotes and no line breaks; only
the rare quoted field with escapes or embedded line breaks is built up. Lone
CRs outside quotes are dropped with a `stray_cr` error exactly as csv-reader
does, and the value is rebuilt from slices only when a CR was actually
dropped. Nothing is cached from one case to the next.

## Measured on the practice set

The kit's practice set (6 cases, 10.2 MB of CSV), Node 24, this machine:

| | parse only (median of 7) | full driver incl. I/O (median of 7) |
| --- | --- | --- |
| this entry | 271 ms | 1,705 ms |
| csv-reader 1.0.0 (house baseline) | 901 ms | 3,185 ms |
| speedup | **3.33x** | **1.87x** |

Correctness: all 6 practice cases match the kit's `expected.json` exactly,
plus 58 hand-picked edge cases and 8,000 differential-fuzz cases against
csv-reader 1.0.0 with zero mismatches.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

Node 22+, no dependencies, no install step.
