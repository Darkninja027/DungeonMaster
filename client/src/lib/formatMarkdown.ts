import { remark } from 'remark'
import remarkGfm from 'remark-gfm'

/**
 * Parse and re-serialize markdown to normalize formatting: aligns table
 * pipes, fixes heading/list spacing, and consistent emphasis markers.
 */
export async function formatMarkdown(text: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .data('settings', {
      bullet: '-',
      emphasis: '*',
      strong: '*',
      rule: '-',
      fences: true,
    })
    .process(text)
  return String(file)
}

export const snippets = {
  table: [
    '| Column | Column | Column |',
    '| ------ | ------ | ------ |',
    '| Cell   | Cell   | Cell   |',
    '| Cell   | Cell   | Cell   |',
  ].join('\n'),
  readAloud: '> Boxed read-aloud text: describe the scene to your players here.',
  divider: '---',
  statBlock: [
    '## Creature Name',
    '',
    '*Medium humanoid, neutral evil*',
    '',
    '| Stat | Value |',
    '| ---- | ----- |',
    '| Armor Class | 12 |',
    '| Hit Points | 22 (4d8 + 4) |',
    '| Speed | 30 ft. |',
    '',
    '| STR | DEX | CON | INT | WIS | CHA |',
    '| --- | --- | --- | --- | --- | --- |',
    '| 10 (+0) | 14 (+2) | 12 (+1) | 10 (+0) | 11 (+0) | 8 (-1) |',
  ].join('\n'),
}
