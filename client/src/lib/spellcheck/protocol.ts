/** Messages between the spell worker and `checker.ts`. */

export type SpellRequest =
  | { kind: 'check'; id: number; words: Array<string> }
  | { kind: 'suggest'; id: number; word: string }
  | { kind: 'add'; words: Array<string> }

export type SpellResponse =
  | { id: number; misspelled: Array<string> }
  | { id: number; suggestions: Array<string> }
