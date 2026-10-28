// nspell ships no types. Only the four calls the spell worker makes.
declare module 'nspell' {
  interface NSpell {
    correct: (word: string) => boolean
    suggest: (word: string) => Array<string>
    add: (word: string, model?: string) => NSpell
    personal: (dic: string) => NSpell
  }
  export default function nspell(aff: string, dic: string): NSpell
}
