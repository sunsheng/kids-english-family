export type DrillRound = {
  round: 1 | 2 | 3;
  start: number;
  length: number;
  prompt: string[];
};

const alphabet = "abcdefghijklmnopqrstuvwxyz";

// 挖空与作答只针对字母;空格、连字符、撇号等分隔符始终显示,不需要输入。
function lettersOnly(word: string) {
  return word.replace(/[^a-z]/g, "");
}
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

// round.start / round.length 均按"字母位"计(跳过分隔符),与 maskedWord、drillAnswer 保持一致。
export function createDrillRounds(rawWord: string): DrillRound[] {
  const letters = lettersOnly(rawWord.toLowerCase());
  const firstLength = chunkLength(letters);
  const firstStarts = candidateStarts(letters, firstLength);
  const firstStart = firstStarts[Math.floor(firstStarts.length / 2)] ?? 0;

  let secondLength = firstLength;
  let secondStarts = candidateStarts(letters, secondLength).filter((start) => start !== firstStart);

  if (secondStarts.length === 0 && secondLength > 1) {
    secondLength -= 1;
    secondStarts = candidateStarts(letters, secondLength).filter((start) => start !== firstStart);
  }

  const secondStart = secondStarts[0] ?? firstStart;
  const firstCorrect = letters.slice(firstStart, firstStart + firstLength);

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
      length: letters.length,
      prompt: [],
    },
  ];
}

export function maskedWord(word: string, round: DrillRound) {
  let letterIndex = 0;

  return word.split("").map((letter) => {
    if (!/[a-z]/i.test(letter)) {
      return letter;
    }

    const current = letterIndex;
    letterIndex += 1;

    return current >= round.start && current < round.start + round.length ? "" : letter;
  });
}

export function drillAnswer(word: string, round: DrillRound) {
  return lettersOnly(word.toLowerCase()).slice(round.start, round.start + round.length);
}
