import { assertCanTransition, type CourseStatus } from '../../src/domain/state-machine';

const STATUSES: CourseStatus[] = ['draft', 'in_review', 'published', 'retired'];

const LEGAL: ReadonlyArray<[CourseStatus, CourseStatus]> = [
  ['draft', 'in_review'],
  ['in_review', 'published'],
  ['published', 'retired'],
];

function isLegal(from: CourseStatus, to: CourseStatus): boolean {
  return LEGAL.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);
}

const ILLEGAL_PAIRS: Array<[CourseStatus, CourseStatus]> = STATUSES.flatMap((from) =>
  STATUSES.filter((to) => !isLegal(from, to)).map((to) => [from, to] as [CourseStatus, CourseStatus]),
);

function thrownCode(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    return (err as { code: string }).code;
  }
  throw new Error('expected throw');
}

describe('CourseStateMachine', () => {
  it.each(ILLEGAL_PAIRS)('forbids %s → %s', (from, to) => {
    expect(thrownCode(() => assertCanTransition(from, to, 99))).toBe('STATE_TRANSITION_FORBIDDEN');
  });

  it('allows draft → in_review', () => {
    expect(() => assertCanTransition('draft', 'in_review')).not.toThrow();
  });

  it('allows in_review → published when chapterCount >= 1', () => {
    expect(() => assertCanTransition('in_review', 'published', 1)).not.toThrow();
  });

  it('allows published → retired', () => {
    expect(() => assertCanTransition('published', 'retired')).not.toThrow();
  });

  it('rejects empty publish with COURSE_EMPTY', () => {
    expect(thrownCode(() => assertCanTransition('in_review', 'published', 0))).toBe('COURSE_EMPTY');
  });
});
