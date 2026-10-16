import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretDictation } from '../src/helpers/dictationModes.js';

const config = {
  escapePhrases: ['escape'],
  modeSwitches: [
    { phrase: 'navigate mode', mode: 'navigation' },
    { phrase: 'writing mode', mode: 'writing' },
  ],
  modes: {
    writing: { bindings: [
      { id: 'newline', phrase: 'enter', action: 'insert_newline', interpretation: 'contextual' },
      { id: 'custom-newline', phrase: 'zorp', action: 'insert_newline', interpretation: 'always' },
    ] },
    navigation: { bindings: [
      { id: 'up-2', phrase: 'up two paragraphs', action: 'move_up_two_paragraphs', interpretation: 'always' },
    ] },
  },
};

test('arbitrary user word is an action in writing mode', () => {
  const result = interpretDictation('zorp', 'writing', config);
  assert.equal(result.directives[0].type, 'action');
  assert.equal(result.directives[0].bindingId, 'custom-newline');
});

test('escape makes even an always-action literal', () => {
  const result = interpretDictation('escape zorp', 'writing', config);
  assert.deepEqual(result.directives.map(({ type, value }) => [type, value]), [['literal', 'zorp']]);
});

test('escape also protects a mode-switch phrase', () => {
  const result = interpretDictation('Escape navigate mode', 'writing', config);
  assert.equal(result.mode, 'writing');
  assert.equal(result.directives[0].value, 'navigate mode');
});

test('multiple mode switches apply sequentially within one recording', () => {
  const result = interpretDictation('Navigate mode, up two paragraphs, writing mode.', 'writing', config);
  assert.equal(result.mode, 'writing');
  assert.deepEqual(result.directives.map((d) => d.type), ['mode_switch', 'action', 'mode_switch']);
  assert.equal(result.directives[1].bindingId, 'up-2');
});

test('contextual bindings are candidates, not automatically executed', () => {
  const result = interpretDictation('I will enter this car', 'writing', config);
  assert.equal(result.directives[0].type, 'candidate');
  assert.equal(result.directives[0].bindingId, 'newline');
});

test('unconfigured speech is untouched and has no directives', () => {
  assert.deepEqual(interpretDictation('Hello world', 'writing', config), { mode: 'writing', directives: [] });
});
