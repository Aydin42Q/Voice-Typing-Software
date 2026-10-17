import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContextualCommands } from '../src/helpers/contextualCommands.js';
import { classifyWithLocalModel } from '../src/helpers/localCommandClassifier.js';

const config = {
  escapePhrases: ['escape'],
  modeSwitches: [
    { phrase: 'navigate mode', mode: 'navigation' },
    { phrase: 'writing mode', mode: 'writing' },
  ],
  modes: {
    writing: { bindings: [
      { id: 'enter', phrase: 'enter', action: 'insert_newline', interpretation: 'contextual' },
      { id: 'zorp', phrase: 'zorp', action: 'insert_newline', interpretation: 'always' },
    ] },
    navigation: { bindings: [
      { id: 'up2', phrase: 'up two paragraphs', action: 'move_up_two_paragraphs', interpretation: 'always' },
    ] },
  },
};

test('classifies an ambiguous phrase as literal', async () => {
  const output = await resolveContextualCommands('I will enter the car', 'writing', config, async () => [{ index: 0, isCommand: false }]);
  assert.equal(output.directives[0].type, 'literal');
  assert.equal(output.directives[0].value, 'enter');
});

test('classifies a command as an action', async () => {
  const output = await resolveContextualCommands('Hello enter world', 'writing', config, async () => [{ index: 0, isCommand: true }]);
  assert.equal(output.directives[0].type, 'action');
  assert.equal(output.directives[0].action, 'insert_newline');
});

test('always bindings do not involve AI', async () => {
  const output = await resolveContextualCommands('zorp', 'writing', config, () => { throw new Error('Should not be called'); });
  assert.equal(output.classification, 'not-needed');
  assert.equal(output.directives[0].type, 'action');
});

test('escape prevents command execution and AI', async () => {
  const output = await resolveContextualCommands('escape enter', 'writing', config, () => { throw new Error('Should not be called'); });
  assert.equal(output.directives[0].type, 'literal');
  assert.equal(output.directives[0].value, 'enter');
});

test('mode switches remain deterministic', async () => {
  const output = await resolveContextualCommands('navigate mode up two paragraphs writing mode', 'writing', config, () => { throw new Error('Should not be called'); });
  assert.equal(output.mode, 'writing');
  assert.deepEqual(output.directives.map(d => d.type), ['mode_switch', 'action', 'mode_switch']);
});

test('model failure preserves ambiguous phrases as words', async () => {
  const output = await resolveContextualCommands('I will enter the car', 'writing', config, async () => { throw new Error('offline'); });
  assert.equal(output.classification, 'fallback');
  assert.equal(output.directives[0].type, 'literal');
});

test('rejects invented or duplicate decisions', async () => {
  const output = await resolveContextualCommands('enter enter', 'writing', config, async () => [{ index: 0, isCommand: true }, { index: 0, isCommand: true }]);
  assert.equal(output.classification, 'fallback');
  assert.deepEqual(output.directives.map(d => d.type), ['literal', 'literal']);
});

test('local client calls only the loopback model API', async () => {
  let called = false;
  const decisions = await classifyWithLocalModel(
    { transcript: 'enter', currentMode: 'writing', candidates: [{ index: 0, phrase: 'enter' }] },
    { fetchImpl: async (url, options) => {
      called = true;
      assert.equal(url.href, 'http://127.0.0.1:8080/v1/chat/completions');
      assert.equal(JSON.parse(options.body).messages[1].role, 'user');
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"decisions":[{"index":0,"isCommand":true}]}' } }] }) };
    } }
  );
  assert.equal(called, true);
  assert.deepEqual(decisions, [{ index: 0, isCommand: true }]);
});

test('refuses nonlocal URLs', async () => {
  await assert.rejects(
    classifyWithLocalModel({ transcript: 'enter', candidates: [] }, { baseUrl: 'https://example.com' }),
    /loopback/
  );
});
