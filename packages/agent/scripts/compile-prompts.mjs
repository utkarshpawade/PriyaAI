#!/usr/bin/env node
/**
 * Compiles `prompts/*.md` into `src/prompts/compiled.ts`.
 *
 * The markdown files are the versioned, reviewable source of the agent's
 * behaviour. Embedding them as string constants means the running server never
 * touches the filesystem for a prompt, which matters because the voice server
 * ships as a bundled Docker image and Next.js bundles the same package for its
 * server components.
 *
 * `pnpm --filter @rvagent/agent test` re-runs this in memory and fails if the
 * checked-in output has drifted from the markdown.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  { file: 'sales-agent.md', exportName: 'SALES_AGENT_PROMPT_TEMPLATE' },
  { file: 'summarizer.md', exportName: 'SUMMARIZER_PROMPT' },
];

/** Strips the HTML comment banner that documents the file for humans. */
function stripEditorNotes(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->\n?/g, '').replace(/\n{3,}/g, '\n\n');
}

function escapeTemplateLiteral(value) {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

export function renderCompiledPrompts() {
  const blocks = SOURCES.map(({ file, exportName }) => {
    const markdown = readFileSync(join(packageRoot, 'prompts', file), 'utf8');
    const body = escapeTemplateLiteral(stripEditorNotes(markdown).trim());
    return `/** Compiled from \`prompts/${file}\`. */\nexport const ${exportName} = \`${body}\`;\n`;
  });

  return [
    '// GENERATED FILE — do not edit.',
    '// Source: packages/agent/prompts/*.md',
    '// Regenerate with: pnpm --filter @rvagent/agent run compile-prompts',
    '',
    ...blocks,
  ].join('\n');
}

const outputPath = join(packageRoot, 'src', 'prompts', 'compiled.ts');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(outputPath, renderCompiledPrompts(), 'utf8');
  console.log(`compiled prompts -> ${outputPath}`);
}
