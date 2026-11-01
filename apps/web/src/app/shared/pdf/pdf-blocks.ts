import type { Content } from 'pdfmake/interfaces';

export const PDF_LINE = 0.8;
export const SIGN_COLOR = '#0b3d91';
export const SIGN_LINE_HEIGHT = 0.85;
export const SIGN_FONT_FACTOR = 1.25;
export const SIGN_ID_SIZE = 5.4;
export const SIGN_ID_HEIGHT = 7.6;

const THAI = /[฀-๿]/;

export interface PdfPerson {
  name: string;
  code: string | null;
}

export interface PdfPeople {
  byUsername: Record<string, PdfPerson>;
}

// The signature face has no Thai glyphs, so Thai names fall back to the body font.
export function signatureFont(text: string): string {
  return THAI.test(text) ? 'Sarabun' : 'Signature';
}

// MTL1016 signed on 2026-11-01 -> MTL-1016-011126
export function signId(code: string | null | undefined, signedAt: string | null | undefined): string {
  if (!code || !signedAt) return '';
  const date = new Date(signedAt);
  if (Number.isNaN(date.getTime())) return '';
  const two = (value: number) => String(value).padStart(2, '0');
  return `MTL-${code.replace(/^MTL/i, '')}-${two(date.getDate())}${two(date.getMonth() + 1)}${two(date.getFullYear() % 100)}`;
}

interface SignatureFit {
  lines: string[];
  size: number;
}

function fitSignature(name: string, width: number, maxSize: number): SignatureFit {
  const em = THAI.test(name) ? 0.55 : 0.4;
  const oneLine = Math.min(maxSize, width / (name.length * em));
  if (oneLine >= 8.5) return { lines: [name], size: oneLine };

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { lines: [name], size: Math.max(6.5, oneLine) };
  let best: string[] = [name];
  let bestLongest = Infinity;
  for (let cut = 1; cut < words.length; cut += 1) {
    const candidate = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    const longest = Math.max(candidate[0].length, candidate[1].length);
    if (longest < bestLongest) { best = candidate; bestLongest = longest; }
  }
  return { lines: best, size: Math.max(6.5, Math.min(maxSize, width / (bestLongest * em))) };
}

export function signatureHeight(name: string, width: number, maxSize = 12): number {
  const fit = fitSignature(name, width, maxSize);
  return fit.lines.length * fit.size * SIGN_FONT_FACTOR * SIGN_LINE_HEIGHT + SIGN_ID_HEIGHT;
}

// Blue script name with the SIGN_ID stamp underneath, like the legacy printed forms.
export function signatureBlock(person: PdfPerson, signedAt: string | null, width: number, maxSize = 12): Content {
  const fit = fitSignature(person.name, width, maxSize);
  const id = signId(person.code, signedAt);
  return {
    stack: [
      ...fit.lines.map((line) => ({
        text: line,
        font: signatureFont(line),
        fontSize: fit.size,
        color: SIGN_COLOR,
        alignment: 'center',
        lineHeight: SIGN_LINE_HEIGHT,
      })),
      ...(id ? [{ text: `SIGN_ID:${id}`, font: 'Sarabun', bold: true, fontSize: SIGN_ID_SIZE, color: SIGN_COLOR, alignment: 'center', margin: [0, 1, 0, 0] }] : []),
    ],
  } as Content;
}

// A signature that sits on a ruled line (the bottom border of a one-cell table).
export function signedLine(person: PdfPerson | null, signedAt: string | null, width: number | '*' | 'auto' = '*', blockWidth = 140): Content {
  return {
    width,
    table: { widths: ['*'], body: [[{ ...(person ? (signatureBlock(person, signedAt, blockWidth, 15) as object) : { text: ' ' }), border: [false, false, false, true] }]] },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? PDF_LINE : 0),
      vLineWidth: () => 0,
      paddingLeft: () => 2,
      paddingRight: () => 2,
      paddingTop: () => 0,
      paddingBottom: () => 1,
    },
  } as unknown as Content;
}

export function underlined(value: string, width: number | '*' | 'auto' = '*', style: 'solid' | 'dotted' = 'solid'): Content {
  return {
    width,
    table: { widths: ['*'], body: [[{ text: value || ' ', border: [false, false, false, true], fontSize: 10 }]] },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? PDF_LINE : 0),
      vLineWidth: () => 0,
      hLineStyle: () => (style === 'dotted' ? { dash: { length: 1.2, space: 1.6 } } : null),
      paddingLeft: () => 2,
      paddingRight: () => 2,
      paddingTop: () => 0,
      paddingBottom: () => 1,
    },
  } as Content;
}

export function brandHeader(logo: string, title: string, formNo: string): Content {
  return {
    columns: [
      { text: title, fontSize: 18, bold: true, width: '*', margin: [0, 2, 0, 0] },
      {
        width: 112,
        stack: [
          { image: logo, width: 100, alignment: 'right' },
          { text: formNo, bold: true, fontSize: 7, alignment: 'right', margin: [0, 3, 0, 0] },
        ],
      },
    ],
  } as Content;
}
