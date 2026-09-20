import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestArguments } from '../scripts/test-runner.js';

test('test runner rejects an empty default test set', () => {
  assert.throws(
    () => buildTestArguments([], () => []),
    /没有匹配到任何测试文件/,
  );
});

test('test runner expands patterns without relying on the shell', () => {
  const calls: string[] = [];
  const args = buildTestArguments(
    ['test/*.test.ts', '--test-timeout=120000'],
    (pattern) => {
      calls.push(pattern);
      return ['test/b.test.ts', 'test/a.test.ts'];
    },
  );

  assert.deepEqual(calls, ['test/*.test.ts']);
  assert.deepEqual(args, [
    '--test',
    'test/a.test.ts',
    'test/b.test.ts',
    '--test-timeout=120000',
  ]);
});

test('test runner uses the default pattern when only Node test options are passed', () => {
  const args = buildTestArguments(
    ['--test-timeout=120000'],
    (pattern) => pattern === 'test/*.test.ts' ? ['test/example.test.ts'] : [],
  );

  assert.deepEqual(args, ['--test', 'test/example.test.ts', '--test-timeout=120000']);
});
