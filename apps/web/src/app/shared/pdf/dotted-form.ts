import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatPdfDate, wrapLines } from './pdf-generator';
import { PDF_LINE, PdfPerson, signatureBlock } from './pdf-blocks';

/*
 * 1-ACCC-01 (REV E). Geometry follows the Word original (pt): text column 57.6 → 544.9, a 1pt frame around the page,
 * the logo / form number top right, and dotted fill-in lines drawn where the form uses underlined tab stops.
 */
export const FONT = 10;
export const TEXT_WIDTH = 487.3;
const ROW = 20;
const TEXT_TOP = 6.5;
const DOTS = { length: 1, space: 2.2 };
export const FRAME = { x: 38.7, y: 117, w: 526.2, h: 675 };

export type Measure = (text: string) => number;

const dottedLayout = {
  hLineWidth: (i: number) => (i === 0 ? 0 : PDF_LINE),
  vLineWidth: () => 0,
  hLineStyle: () => ({ dash: DOTS }),
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

const NO_LINE: [boolean, boolean, boolean, boolean] = [false, false, false, false];
const LINE_BELOW: [boolean, boolean, boolean, boolean] = [false, false, false, true];

/** A label followed by dotted line(s) that carry the value; long values wrap onto further full-width dotted lines. */
export function dottedBlock(label: string, value: string | null, measure: Measure, opts: { lines?: number; labelWidth?: number; width?: number; after?: number } = {}): Content {
  const width = opts.width ?? TEXT_WIDTH;
  const labelWidth = Math.max(opts.labelWidth ?? 0, measure(label) + 4);
  const lines = wrapLines(value, (index) => (index === 0 ? width - labelWidth : width) - 4, measure);
  const count = Math.max(opts.lines ?? 1, lines.length);
  const text = (content: string) => ({ text: content, margin: [2, TEXT_TOP, 0, 0] as [number, number, number, number] });

  const body: TableCell[][] = [];
  for (let i = 0; i < count; i += 1) {
    body.push(i === 0
      ? [{ text: label, margin: [0, TEXT_TOP, 0, 0], border: NO_LINE }, { ...text(lines[0] ?? ''), border: LINE_BELOW }]
      : [{ ...text(lines[i] ?? ''), colSpan: 2, border: LINE_BELOW }, {}]);
  }
  return {
    table: { widths: [labelWidth, width - labelWidth], heights: () => ROW, body },
    layout: dottedLayout,
    margin: [0, 0, 0, opts.after ?? 3],
  } as unknown as Content;
}

// An empty text node still takes a full line, so the spacer uses a 1pt font.
export const gap = (height: number): Content => ({ text: ' ', fontSize: 1, margin: [0, 0, 0, height] } as Content);

export function checkbox(checked: boolean): Content {
  return {
    canvas: [
      { type: 'rect', x: 0, y: 3, w: 9, h: 9, lineWidth: 0.9 },
      ...(checked ? [{ type: 'line', x1: 1.8, y1: 7.8, x2: 4, y2: 10.2, lineWidth: 1.5 }, { type: 'line', x1: 4, y1: 10.2, x2: 8.2, y2: 4, lineWidth: 1.5 }] : []),
    ],
  } as unknown as Content;
}

/** Signature that sits on a dotted line. */
function dottedSignature(person: PdfPerson | null, signedAt: string | null, blockWidth: number): TableCell {
  return { ...(person ? (signatureBlock(person, signedAt, blockWidth, 15) as object) : { text: ' ' }), border: LINE_BELOW, margin: [0, 0, 0, 1] } as TableCell;
}

function dottedText(value: string): TableCell {
  return { text: value || ' ', border: LINE_BELOW, margin: [2, TEXT_TOP - 1, 0, 0] };
}

export interface Signer { person: PdfPerson | null; signedAt: string | null }

/** "Requested By :  ........  (ROLE)  Date: ........"; two signers share the row, separated by "/". */
export function signatureRow(label: string, stop: number, role: string, signers: Signer[], measure: Measure): Content {
  const two = signers.length > 1;
  const signArea = 288 - stop;
  const dateStart = 360 + measure('Date:') + 6;
  const dateArea = TEXT_WIDTH - dateStart;
  const slash = two ? 12 : 0;

  const widths: number[] = [stop];
  const cells: TableCell[] = [{ text: label, margin: [0, 13, 0, 0], border: NO_LINE }];
  signers.forEach((signer, index) => {
    if (index > 0) { widths.push(slash); cells.push({ text: '/', alignment: 'center', fontSize: 14, margin: [0, 7, 0, 0], border: NO_LINE }); }
    const each = (signArea - slash) / signers.length;
    widths.push(each);
    cells.push(dottedSignature(signer.person, signer.signedAt, each - 6));
  });
  widths.push(72, dateStart - 360);
  cells.push({ text: role, margin: [4, 13, 0, 0], border: NO_LINE }, { text: 'Date:', margin: [0, 13, 0, 0], border: NO_LINE });
  signers.forEach((signer, index) => {
    if (index > 0) { widths.push(10); cells.push({ text: '/', alignment: 'center', margin: [0, 13, 0, 0], border: NO_LINE }); }
    widths.push((dateArea - (two ? 10 : 0)) / signers.length);
    cells.push(dottedText(signer.person ? formatPdfDate(signer.signedAt, two) : ''));
  });

  return {
    table: { widths, heights: () => 28, body: [cells], dontBreakRows: true },
    layout: dottedLayout,
    unbreakable: true,
  } as unknown as Content;
}

/** "Approve?   [ ] Yes   [ ] No" on the original's tab stops (108 / 144 / 252 / 288 pt). */
export function approveRow(approved: boolean, rejected: boolean): Content {
  return {
    columns: [
      { text: 'Approve? ', width: 108, margin: [0, 2, 0, 0] },
      { ...(checkbox(approved) as object), width: 36 },
      { text: 'Yes', width: 108, margin: [0, 2, 0, 0] },
      { ...(checkbox(rejected) as object), width: 36 },
      { text: 'No', width: '*', margin: [0, 2, 0, 0] },
    ],
    margin: [0, 2, 0, 4],
  } as unknown as Content;
}


export interface FormChrome {
  logo: string;
  /** e.g. "1 FORM ACCC-01" */
  formNo: string;
  title: string;
  /** Text after "Circ:" in the "Copies to" line. */
  copies: string;
  effectiveDate: string;
  fileName: string;
}

/** Page frame, logo, form number, title and footer shared by the anti-corruption forms (positions follow the Word originals). */
export function formChrome(c: FormChrome): Pick<TDocumentDefinitions, 'background' | 'footer' | 'pageMargins' | 'defaultStyle'> {
  return {
    pageMargins: [57.6, 128, 50.4, 60],
    defaultStyle: { font: 'Sarabun', fontSize: FONT },
    background: () => [
      { canvas: [{ type: 'rect', x: FRAME.x, y: FRAME.y, w: FRAME.w, h: FRAME.h, lineWidth: 1 }], absolutePosition: { x: 0, y: 0 } },
      { text: 'Meinhardt (Thailand) Ltd.', bold: true, fontSize: 12, absolutePosition: { x: 57.6, y: 43.2 } },
      { image: c.logo, width: 100.65, absolutePosition: { x: 473.4, y: 37.5 } },
      { columns: [{ text: c.formNo, bold: true, fontSize: 7, alignment: 'center', width: 91.8 }], absolutePosition: { x: 479.8, y: 59 } },
      { columns: [{ text: 'Copies to :', width: 288 }, { text: 'Circ:', width: 60 }], absolutePosition: { x: 41.6, y: 80 } },
      { text: c.copies, absolutePosition: { x: 455, y: 80 } },
      { columns: [{ text: c.title, alignment: 'center', fontSize: 12, width: '*' }], absolutePosition: { x: 57.6, y: 95 } },
    ] as unknown as Content,
    footer: (current: number, total: number) => ({
      margin: [38.7, 14, 30, 0],
      stack: [
        {
          columns: [
            { text: c.fileName, fontSize: 6.5, width: '*' },
            { text: `Page ${current} of ${total}`, fontSize: 7, width: 'auto' },
          ],
        },
        { text: c.effectiveDate, fontSize: 7, margin: [0, 2, 0, 0] },
      ],
    }),
  };
}
