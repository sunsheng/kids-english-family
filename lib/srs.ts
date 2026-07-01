export type SrsState = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
};

export type SrsResult = SrsState & {
  status: "learning" | "reviewing" | "mastered";
  nextReviewInDays: number;
};

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function scheduleReview(state: SrsState, isCorrect: boolean): SrsResult {
  if (!isCorrect) {
    return {
      easeFactor: Math.max(1.3, roundOneDecimal(state.easeFactor - 0.2)),
      intervalDays: 1,
      repetitions: 0,
      status: "learning",
      nextReviewInDays: 1,
    };
  }

  const repetitions = state.repetitions + 1;
  const easeFactor = roundOneDecimal(state.easeFactor + 0.1);
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 3
        : Math.max(4, Math.round(state.intervalDays * easeFactor));

  return {
    easeFactor,
    intervalDays,
    repetitions,
    status: repetitions >= 3 ? "mastered" : "reviewing",
    nextReviewInDays: intervalDays,
  };
}
