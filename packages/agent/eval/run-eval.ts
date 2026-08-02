#!/usr/bin/env tsx
/**
 * `pnpm eval` — runs every scripted conversation through the real orchestrator
 * with MockLLM and prints a pass/fail table.
 *
 * Exits non-zero on any failure so CI treats a conversation regression the same
 * way it treats a broken unit test.
 */
import { runScenario, type ScenarioResult } from './harness.js';
import { SCENARIOS } from './scenarios.js';

const GREEN = '[32m';
const RED = '[31m';
const DIM = '[2m';
const BOLD = '[1m';
const RESET = '[0m';

async function main(): Promise<void> {
  const filter = process.argv[2];
  const scenarios = filter
    ? SCENARIOS.filter((scenario) => scenario.id.includes(filter))
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`No scenario matches "${filter}".`);
    process.exit(1);
  }

  console.log(`\n${BOLD}Conversation eval${RESET} ${DIM}(MockLLM, no network, no keys)${RESET}\n`);

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  printTable(results);
  printFailures(results);

  const failed = results.filter((result) => !result.passed);
  const summary = `${results.length - failed.length}/${results.length} scenarios passed`;
  console.log(
    failed.length === 0
      ? `\n${GREEN}${BOLD}PASS${RESET}  ${summary}\n`
      : `\n${RED}${BOLD}FAIL${RESET}  ${summary}\n`,
  );

  process.exit(failed.length === 0 ? 0 : 1);
}

function printTable(results: readonly ScenarioResult[]): void {
  const columns = [
    { header: 'scenario', width: 30, value: (r: ScenarioResult) => r.scenario.id },
    { header: 'lang', width: 6, value: (r: ScenarioResult) => r.scenario.languageMode },
    { header: 'turns', width: 5, value: (r: ScenarioResult) => String(r.turnCount) },
    { header: 'outcome', width: 19, value: (r: ScenarioResult) => r.outcome },
    { header: 'score', width: 5, value: (r: ScenarioResult) => String(r.score) },
    { header: 'tools', width: 26, value: (r: ScenarioResult) => r.toolsCalled.join(',') },
    { header: 'ms', width: 5, value: (r: ScenarioResult) => String(Math.round(r.durationMs)) },
    {
      header: 'result',
      width: 6,
      value: (r: ScenarioResult) => (r.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`),
    },
  ];

  const header = columns.map((column) => pad(column.header, column.width)).join(' ');
  console.log(`${DIM}${header}${RESET}`);
  console.log(`${DIM}${'-'.repeat(header.length)}${RESET}`);

  for (const result of results) {
    console.log(
      columns
        .map((column) =>
          column.header === 'result'
            ? column.value(result)
            : pad(column.value(result), column.width),
        )
        .join(' '),
    );
  }
}

function printFailures(results: readonly ScenarioResult[]): void {
  const failed = results.filter((result) => !result.passed);
  if (failed.length === 0) return;

  console.log(`\n${BOLD}Failures${RESET}`);
  for (const result of failed) {
    console.log(`\n  ${RED}${result.scenario.id}${RESET} — ${result.scenario.title}`);
    for (const failure of result.failures) {
      console.log(`    ${failure.check}: expected ${failure.expected}, got ${failure.actual}`);
    }
    console.log(`    ${DIM}agent said: ${truncate(result.agentSpeech.replace(/\n/g, ' '), 300)}${RESET}`);
  }
}

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
