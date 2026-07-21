import { jsPDF } from 'jspdf'
import { domToPng } from 'modern-screenshot'

/**
 * Snapshot every rendered .dnd-page inside `root` and stitch them into a PDF,
 * one PDF page per book page. Captures the live preview DOM, so the output
 * matches the preview exactly (parchment, columns, drop caps, images).
 */
export async function exportPdf(root: HTMLElement, filename: string) {
  const pages = Array.from(
    root.querySelectorAll<HTMLElement>('.dnd-page:not(.dnd-measure)'),
  )
  if (pages.length === 0) return

  await document.fonts.ready

  let pdf: jsPDF | null = null
  for (const page of pages) {
    const w = page.offsetWidth
    const h = page.offsetHeight
    const png = await domToPng(page, {
      scale: 2,
      // roll buttons are dead weight on paper
      filter: (node) =>
        !(
          node instanceof HTMLElement && node.classList.contains('dnd-roll-bar')
        ),
    })
    const orientation = w > h ? 'landscape' : 'portrait'
    if (!pdf) {
      pdf = new jsPDF({
        unit: 'px',
        format: [w, h],
        orientation,
        hotfixes: ['px_scaling'],
      })
    } else {
      pdf.addPage([w, h], orientation)
    }
    pdf.addImage(png, 'PNG', 0, 0, w, h)
  }
  pdf!.save(filename)
}
