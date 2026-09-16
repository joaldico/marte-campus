export type CourseStatus = 'draft' | 'in_review' | 'published' | 'retired';

export type StateMachineErrorCode = 'STATE_TRANSITION_FORBIDDEN' | 'COURSE_EMPTY';

export class StateMachineError extends Error {
  constructor(public readonly code: StateMachineErrorCode) {
    super(code);
    this.name = 'StateMachineError';
  }
}

const LEGAL = new Set<string>(['draft->in_review', 'in_review->published', 'published->retired']);

export function assertCanTransition(
  from: CourseStatus,
  to: CourseStatus,
  chapterCount = 0,
): void {
  if (!LEGAL.has(`${from}->${to}`)) {
    throw new StateMachineError('STATE_TRANSITION_FORBIDDEN');
  }
  if (from === 'in_review' && to === 'published' && chapterCount < 1) {
    throw new StateMachineError('COURSE_EMPTY');
  }
}
