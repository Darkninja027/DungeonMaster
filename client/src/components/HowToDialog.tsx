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

export function HowToDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Formatting help">
          <CircleHelp />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Writing your lore</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">
          <Section title="Basics (markdown)">
            <Row
              code="# Chapter title"
              desc="Big red chapter heading. The paragraph right after it gets a drop cap."
            />
            <Row
              code="## Section"
              desc="Section heading with a gold underline."
            />
            <Row code="### Subsection" desc="Smaller red heading." />
            <Row
              code="**bold** / *italic*"
              desc="Bold renders in red, like PHB keywords."
            />
            <Row
              code="- item"
              desc="Bulleted list. Use 1. for numbered lists."
            />
            <Row code="[text](https://url)" desc="A link." />
          </Section>

          <Section title="D&D flavour">
            <Row
              code="> Read-aloud text"
              desc="Green boxed text — the stuff you read out to your players."
            />
            <Row code="---" desc="Tapered gold divider." />
            <Row
              code={'| Name | HP |\n| ---- | -- |\n| Goblin | 7 |'}
              desc="Tables render PHB-style with green striped rows. Use the Insert menu for a starter table or a full stat block."
            />
            <Row
              code="![alt](url)"
              desc="An image with a plate-style frame. Use the Images button to upload and insert."
            />
          </Section>

          <Section title="Image size & placement">
            <Row
              code="![alt](url#right&w=45%)"
              desc="Floats the image right at 45% width — text fills the space around it. Use #left to float left, #center to center."
            />
            <Row
              code="#w=300 / #h=200"
              desc="Set width or height in px or %. Bare numbers are px; combine options with &, e.g. #left&w=300&h=220."
            />
            <Row
              code="#right&nowrap"
              desc="No text wrap: the image sits on its own line (aligned left/right/center) with text above and below. #block works too."
            />
          </Section>

          <Section title="Linking articles">
            <Row
              code="[[Article Title]]"
              desc="Links to the article with that exact title (case doesn't matter). Typing [[ pops up title suggestions — Tab or Enter to complete."
            />
            <Row
              code="[[Article Title|shown text]]"
              desc="Same link, but displays different text."
            />
            <Row
              code="Broken links"
              desc="A dashed-underline link means no article has that title yet — click it in the preview to create the article from a template."
            />
            <Row
              code="Mentioned in"
              desc="The footer of an article lists every other article that wiki-links to it."
            />
          </Section>

          <Section title="Dice & rolling">
            <Row
              code="2d6+3, d20"
              desc="Dice notation renders as a clickable chip — click to roll it. Hover the result to see the individual dice."
            />
            <Row
              code="[Short Sword](1d20+5)"
              desc="Name a roll: the chip shows 'Short Sword | 1d20+5', and the roll history logs the name with the notation and dice breakdown."
            />
            <Row
              code="| d100 | Ore |"
              desc="A table whose first column header is dice notation gets a Roll button that highlights the winning row. Ranges like 01–20 work. The second header names the roll in the history."
            />
          </Section>

          <Section title="Pages & columns">
            <Row
              code="Auto page breaks"
              desc="Pages are US-Letter sized. When content outgrows a page it flows onto a new one automatically, in the preview and the PDF export alike."
            />
            <Row
              code="\page"
              desc="On its own line: force a new book page here."
            />
            <Row
              code="\columns 1"
              desc="At the top of a page: render that page as a single column."
            />
            <Row code="\columns 2" desc="Two columns (the default)." />
          </Section>

          <Section title="Tools">
            <Row
              code="Tidy"
              desc="Reformats your markdown: aligns table pipes, fixes list markers and spacing. Your \page and \columns markers are left alone."
            />
            <Row
              code="Insert"
              desc="Drops templates at your cursor: tables, read-aloud boxes, dividers, stat blocks, page breaks."
            />
          </Section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
