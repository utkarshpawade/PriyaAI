/**
 * Types for the prompt compiler, which is plain ESM JavaScript because it runs
 * as a build step before TypeScript has emitted anything.
 *
 * The drift test in `test/conversation.test.ts` imports `renderCompiledPrompts`
 * to regenerate the output in memory and compare it against the checked-in file.
 */
export declare function renderCompiledPrompts(): string;
