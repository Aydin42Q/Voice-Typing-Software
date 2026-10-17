import { interpretDictation } from './dictationModes.js';

// Pure orchestration: no audio, keyboard events, or network access here.
// `classify` is an injected async function that returns [{ index, isCommand }].
export async function resolveContextualCommands(
  transcript,
  currentMode,
  configuration,
  classify,
  context = {}
) {
  const parsed = interpretDictation(transcript, currentMode, configuration);
  const candidates = parsed.directives
    .filter((directive) => directive.type === 'candidate')
    .map((directive, index) => ({
      index,
      phrase: transcript.slice(directive.start, directive.end),
      start: directive.start,
      end: directive.end,
      bindingId: directive.bindingId,
      action: directive.action,
    }));

  if (candidates.length === 0) {
    return { ...parsed, classification: 'not-needed' };
  }

  let decisions;
  let classification = 'model';
  let warning;
  try {
    const received = await classify({
      transcript,
      currentMode,
      candidates,
      context,
    });
    // Reject incomplete, duplicate, non-boolean, or invented decisions.
    if (!Array.isArray(received) || received.length !== candidates.length) {
      throw new Error('Unexpected number of model decisions');
    }
    decisions = new Map();
    for (const decision of received) {
      if (
        !Number.isInteger(decision?.index) ||
        decision.index < 0 ||
        decision.index >= candidates.length ||
        typeof decision.isCommand !== 'boolean' ||
        decisions.has(decision.index)
      ) {
        throw new Error('Invalid model decision');
      }
      decisions.set(decision.index, decision.isCommand);
    }
  } catch (error) {
    // An uncertain model never authorizes a contextual keypress.
    decisions = new Map(candidates.map(({ index }) => [index, false]));
    classification = 'fallback';
    warning = error instanceof Error ? error.message : String(error);
  }

  let candidateIndex = 0;
  const directives = parsed.directives.map((directive) => {
    if (directive.type !== 'candidate') return directive;
    const isCommand = decisions.get(candidateIndex++);
    if (isCommand) return { ...directive, type: 'action', interpretedBy: 'model' };
    return {
      type: 'literal',
      start: directive.start,
      end: directive.end,
      value: transcript.slice(directive.start, directive.end),
      interpretedBy: classification,
    };
  });
  return { mode: parsed.mode, directives, classification, ...(warning ? { warning } : {}) };
}
