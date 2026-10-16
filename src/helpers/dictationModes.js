const WORD_RE = /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu;

function tokenize(text) {
  return [...text.matchAll(WORD_RE)].map((match) => ({
    value: match[0],
    normalized: match[0].toLocaleLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function findMatch(words, index, entries, getPhrase = (entry) => entry.phrase) {
  let best = null;
  for (const entry of entries) {
    const phrase = tokenize(getPhrase(entry)).map((word) => word.normalized);
    if (!phrase.length || index + phrase.length > words.length) continue;
    if (phrase.every((word, offset) => words[index + offset].normalized === word)) {
      if (!best || phrase.length > best.count) best = { entry, count: phrase.length };
    }
  }
  return best;
}

export function interpretDictation(transcript, currentMode, configuration) {
  if (!Object.hasOwn(configuration.modes, currentMode)) {
    throw new Error(`Unknown dictation mode: ${currentMode}`);
  }

  const words = tokenize(transcript);
  const directives = [];
  let mode = currentMode;
  let i = 0;

  while (i < words.length) {
    const escapes = (configuration.escapePhrases ?? []).map((phrase) => ({ phrase }));
    const escape = findMatch(words, i, escapes);
    if (escape && i + escape.count < words.length) {
      const next = i + escape.count;
      const possible = [
        ...(configuration.modeSwitches ?? []),
        ...(configuration.modes[mode].bindings ?? []),
      ];
      const target = findMatch(words, next, possible);
      const count = target?.count ?? 1;
      const last = next + count - 1;
      directives.push({
        type: 'literal',
        start: words[i].start,
        end: words[last].end,
        value: transcript.slice(words[next].start, words[last].end),
      });
      i = last + 1;
      continue;
    }

    const switchMatch = findMatch(words, i, configuration.modeSwitches ?? []);
    if (switchMatch) {
      const nextMode = switchMatch.entry.mode;
      if (!Object.hasOwn(configuration.modes, nextMode)) {
        throw new Error(`Unknown target mode: ${nextMode}`);
      }
      const last = i + switchMatch.count - 1;
      directives.push({
        type: 'mode_switch',
        start: words[i].start,
        end: words[last].end,
        from: mode,
        to: nextMode,
      });
      mode = nextMode;
      i = last + 1;
      continue;
    }

    const binding = findMatch(words, i, configuration.modes[mode].bindings ?? []);
    if (binding) {
      const last = i + binding.count - 1;
      directives.push({
        type: binding.entry.interpretation === 'always' ? 'action' : 'candidate',
        start: words[i].start,
        end: words[last].end,
        bindingId: binding.entry.id,
        action: binding.entry.action,
      });
      i = last + 1;
      continue;
    }

    i += 1;
  }

  return { mode, directives };
}
