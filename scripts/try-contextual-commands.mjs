import { resolveContextualCommands } from '../src/helpers/contextualCommands.js';
import { classifyWithLocalModel } from '../src/helpers/localCommandClassifier.js';

const configuration = {
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

const baseUrl = process.env.LOCAL_LLM_URL || 'http://127.0.0.1:8080';
const classify = (input) => classifyWithLocalModel(input, { baseUrl });

for (const transcript of [
  'I will enter the car',
  'Hello enter world',
  'escape enter',
  'zorp',
  'navigate mode up two paragraphs writing mode',
]) {
  const outcome = await resolveContextualCommands(transcript, 'writing', configuration, classify);
  console.log(`\nInput: ${transcript}\n${JSON.stringify(outcome, null, 2)}`);
}
