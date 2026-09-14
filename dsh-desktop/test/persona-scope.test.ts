// TDD regression test: verify that a persona row mounted under an agent scope
// lands in the SCOPED layer (shadowing the global deployment:persona) rather
// than colliding with the global registration.
//
// This reproduces the bug where mounting the "standard" agent preset fails
// with `prompt section "deployment:persona" is already registered`.
//
// 内核 0.1.5-rc.2 适配：dsh-persona 的 config schema 由 { text } 改为
// { prefix, suffix, complete }，SystemPrompt 的 config 键也由 persona 改为
// personaPrefix/personaSuffix，section 名拆为 PERSONA_PREFIX/SUFFIX。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as persona from '@deepseek-ai/dsh-persona';
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope';

test('persona row mounted in a scope shadows the global deployment persona', async () => {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, personaPrefix: 'deployment persona', personaSuffix: '' });

  // Simulate what dsh-agent-presets does: mint a standing scope, then mount
  // the persona row (a plugin with inject: ["systemPrompt"]) inside it.
  const agentKey = { agent: 'standard' };
  const scope = createScope(ctx, agentKey);
  const { ctx: scoped } = scope;
  assert.notEqual(scopeOf(scoped), undefined, 'scoped ctx must carry a scope key');

  await scoped.plugin(persona, { prefix: 'per-agent persona', suffix: '' });

  // Assembling for that scope must see the per-agent persona shadowing the
  // global one（0.1.5-rc.2：prefix section 携带逐 agent 人设）.
  const assembly = await ctx.systemPrompt.assemble({ scope: scopeOf(scoped) });
  const personaPrefix = assembly.sections.find((s) => s.name === persona.PERSONA_PREFIX_SECTION);
  assert.ok(personaPrefix, 'scoped assembly must contain the persona prefix section');
  assert.equal(personaPrefix.text, 'per-agent persona', 'scoped persona must shadow the global deployment persona');

  await scope.dispose();
});

test('global assembly still sees the deployment persona', async () => {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, personaPrefix: 'deployment persona', personaSuffix: '' });

  const assembly = await ctx.systemPrompt.assemble({});
  const personaPrefix = assembly.sections.find((s) => s.name === persona.PERSONA_PREFIX_SECTION);
  assert.ok(personaPrefix, 'global assembly must contain the persona prefix section');
  assert.equal(personaPrefix.text, 'deployment persona');
});
