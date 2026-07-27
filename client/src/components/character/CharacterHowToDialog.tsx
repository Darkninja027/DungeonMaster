import { CircleHelp } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

function Row({ code, desc }: { code: string; desc: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,14rem)_1fr] items-start gap-3 py-1.5">
      <code className="bg-muted rounded px-1.5 py-0.5 text-xs whitespace-pre-wrap">
        {code}
      </code>
      <span className="text-sm">{desc}</span>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <div className="divide-y">{children}</div>
    </div>
  )
}

export function CharacterHowToDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="How to build a character">
          <CircleHelp />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Building a character</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">
          <Section title="The basics">
            <Row
              code="Header bar"
              desc="Name, race, class, level, background, alignment, and XP live in the bar at the top — edit them inline any time."
            />
            <Row
              code="Tabs"
              desc="Sheet is the stat block; Inventory and Notes each track their own list; Backstory is free markdown prose."
            />
            <Row
              code="Autosave"
              desc="Changes save on their own a couple of seconds after you stop typing. Ctrl/Cmd+S saves right away."
            />
            <Row
              code="Raw article"
              desc="Every character is just a markdown file. 'Raw article' opens the underlying YAML frontmatter — handy for bulk edits or hand-tuning, and it opens fine in Obsidian too."
            />
          </Section>

          <Section title="Abilities & saves">
            <Row
              code="Ability scores"
              desc="Type the raw score (1–30); the modifier and every derived roll update automatically."
            />
            <Row
              code="Save proficiency"
              desc="Tick a saving throw to add your proficiency bonus to it."
            />
            <Row
              code="Roll chips"
              desc="Every chip on the sheet is clickable — it rolls the die and logs the result to the roll history."
            />
          </Section>

          <Section title="Skills">
            <Row
              code="Proficiency dot"
              desc="Click a skill's dot to cycle none → proficient → expertise. Proficient adds your bonus once; expertise doubles it."
            />
            <Row
              code="Ability tag"
              desc="The small tag after each skill name shows which ability it keys off (e.g. STEALTH · DEX)."
            />
          </Section>

          <Section title="Customising skills (frontmatter)">
            <Row
              code="Where"
              desc="Skill customisation is edited in the raw article's YAML frontmatter (top-right 'Raw article'). The sheet then reflects it."
            />
            <Row
              code={'skillOverrides:\n  religion: wis'}
              desc="Change which ability a built-in skill keys off — here Religion rolls off Wisdom instead of Intelligence. One line per skill you want to change."
            />
            <Row
              code={
                'extraSkills:\n  - { id: forgery,\n      name: Forgery,\n      ability: dex }'
              }
              desc="Add a homebrew skill. id is a lowercase-with-dashes key, name is what shows on the sheet, ability is one of str/dex/con/int/wis/cha. It appears in the Skills list and its dot works like any other."
            />
            <Row
              code={'skills:\n  - forgery'}
              desc="To start proficient in a custom skill, add its id to the skills (or expertise) list — the same lists the proficiency dots drive."
            />
          </Section>

          <Section title="Combat & HP">
            <Row
              code="AC / Speed / Init"
              desc="Set AC and speed directly. Initiative is your DEX modifier plus the small misc box next to it."
            />
            <Row
              code="HP / Temp"
              desc="Current / max HP and temporary HP. Passive Perception and proficiency bonus are shown for reference."
            />
            <Row
              code="Hit dice"
              desc="Track hit dice remaining; the chip rolls one hit die plus your CON modifier."
            />
            <Row
              code="Death saves"
              desc="Click the pips to record successes (green) and failures (red)."
            />
          </Section>

          <Section title="Attacks">
            <Row
              code="Add attack"
              desc="Give it a name, a to-hit bonus, and damage notation like 1d8+3. Two chips appear: one rolls to hit, one rolls damage."
            />
          </Section>

          <Section title="Spellcasting">
            <Row
              code="Ability"
              desc="Pick your spellcasting ability to unlock Save DC, spell attack, and slot tracking."
            />
            <Row
              code="Add spell"
              desc="Type a name and pick a level. A known name links to its article; an unknown one gets a stub created in the Spells/ folder so the library always knows it."
            />
            <Row
              code="Damage & mod"
              desc="Set damage like 2d8+mod — 'mod' resolves to your spellcasting modifier when rolled."
            />
            <Row
              code="Cast / upcast"
              desc="Cast expends a slot and rolls damage. Use the ▾ next to Cast to spend a higher-level slot; damage scales if the spell has a per-level increment."
            />
          </Section>

          <Section title="Inventory, notes & backstory">
            <Row
              code="[[Wiki links]]"
              desc="Use [[Article Title]] in inventory rows, notes, and backstory to link to other articles. A dashed link means no such article yet — click to create it."
            />
            <Row
              code="Promote to attack"
              desc="An inventory weapon can be sent to the Attacks list; the item name is cleaned up (drops (attuned), x3, etc.)."
            />
            <Row
              code="Notes"
              desc="Timestamped session notes. Backstory is a plain markdown page — same formatting as any article."
            />
          </Section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
