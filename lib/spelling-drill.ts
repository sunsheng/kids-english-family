export type DrillRound = {
  round: 1 | 2 | 3;
  start: number;
  length: number;
  prompt: string[];
};

const alphabet = "abcdefghijklmnopqrstuvwxyz";
const confusingPairs = [
  ["a", "e"],
  ["e", "i"],
  ["i", "y"],
  ["o", "u"],
  ["c", "k"],
  ["s", "z"],
  ["f", "v"],
  ["m", "n"],
  ["b", "d"],
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function chunkLength(word: string) {
  return clamp(Math.round(word.length / 3), 1, 3);
}

function candidateStarts(word: string, length: number) {
  const starts: number[] = [];

  for (let index = 1; index <= word.length - length; index += 1) {
    starts.push(index);
  }

  return starts.length > 0 ? starts : [0];
}

function swapAdjacent(value: string) {
  if (value.length < 2) {
    return null;
  }

  return `${value[1]}${value[0]}${value.slice(2)}`;
}

function replaceConfusingLetter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const letter = value[index].toLowerCase();
    const pair = confusingPairs.find(([left, right]) => left === letter || right === letter);

    if (pair) {
      const replacement = pair[0] === letter ? pair[1] : pair[0];
      return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
    }
  }

  return null;
}

function fallbackDistractor(value: string, offset: number) {
  const index = offset % Math.max(value.length, 1);
  const current = value[index]?.toLowerCase() ?? "a";
  const replacement = alphabet[(alphabet.indexOf(current) + offset + 1) % alphabet.length] ?? "x";

  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

function createPrompt(correct: string) {
  const options = new Set([correct]);
  const swapped = swapAdjacent(correct);
  const confused = replaceConfusingLetter(correct);

  if (swapped && swapped !== correct) {
    options.add(swapped);
  }

  if (confused && confused !== correct) {
    options.add(confused);
  }

  let offset = 1;
  while (options.size < 4) {
    const next = fallbackDistractor(correct, offset);
    if (next !== correct) {
      options.add(next);
    }
    offset += 1;
  }

  return Array.from(options).sort((left, right) => left.localeCompare(right));
}

export function createDrillRounds(rawWord: string): DrillRound[] {
  const word = rawWord.toLowerCase();
  const firstLength = chunkLength(word);
  const firstStarts = candidateStarts(word, firstLength);
  const firstStart = firstStarts[Math.floor(firstStarts.length / 2)] ?? 0;

  let secondLength = firstLength;
  let secondStarts = candidateStarts(word, secondLength).filter((start) => start !== firstStart);

  if (secondStarts.length === 0 && secondLength > 1) {
    secondLength -= 1;
    secondStarts = candidateStarts(word, secondLength).filter((start) => start !== firstStart);
  }

  const secondStart = secondStarts[0] ?? firstStart;
  const firstCorrect = word.slice(firstStart, firstStart + firstLength);

  return [
    {
      round: 1,
      start: firstStart,
      length: firstLength,
      prompt: createPrompt(firstCorrect),
    },
    {
      round: 2,
      start: secondStart,
      length: secondLength,
      prompt: [],
    },
    {
      round: 3,
      start: 0,
      length: word.length,
      prompt: [],
    },
  ];
}

export function maskedWord(word: string, round: DrillRound) {
  return word
    .split("")
    .map((letter, index) =>
      index >= round.start && index < round.start + round.length ? "" : letter,
    );
}
