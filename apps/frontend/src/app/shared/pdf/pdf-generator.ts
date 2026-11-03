import type { TDocumentDefinitions } from 'pdfmake/interfaces';

interface PdfMakeStatic {
  addFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(definition: TDocumentDefinitions): { getBlob(): Promise<Blob> };
}

let pdfMake: Promise<PdfMakeStatic> | null = null;

function loadPdfMake(): Promise<PdfMakeStatic> {
  pdfMake ??= import('pdfmake/build/pdfmake').then(async (module) => {
    const lib = ((module as { default?: unknown }).default ?? module) as PdfMakeStatic;
    const font = (file: string) => new URL(`fonts/${file}`, document.baseURI).href;
    // Vladimir Script is a Microsoft font and is not kept in git (see .gitignore): use it when the file has been placed
    // in public/fonts, otherwise fall back to the bundled Allura. (A missing file can come back as the SPA's HTML page.)
    const vladimir = await fetch(font('VladimirScript.ttf'), { method: 'HEAD' })
      .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
      .catch(() => false);
    const signature = font(vladimir ? 'VladimirScript.ttf' : 'Allura-Regular.ttf');
    lib.addFonts({
      Signature: {
        normal: signature,
        bold: signature,
        italics: signature,
        bolditalics: signature,
      },
      Sarabun: {
        normal: font('Sarabun-Regular.ttf'),
        bold: font('Sarabun-Bold.ttf'),
        italics: font('Sarabun-Regular.ttf'),
        bolditalics: font('Sarabun-Bold.ttf'),
      },
    });
    return lib;
  });
  return pdfMake;
}

export async function createPdfBlob(definition: TDocumentDefinitions): Promise<Blob> {
  const lib = await loadPdfMake();
  return lib.createPdf(definition).getBlob();
}

export async function loadLogoPng(): Promise<string> {
  const response = await fetch(new URL('images/meinhardt-group-logo.webp', document.baseURI).href);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  return canvas.toDataURL('image/png');
}

const thaiSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

export type ThaiText = string | { text: string; fontSize?: number }[];

// Sarabun has no zero-width break characters, so word boundaries get a near-invisible real space.
export function wrapThai(text: string | null | undefined): ThaiText {
  if (!text) return '';
  if (!thaiSegmenter || !/[฀-๿]/.test(text)) return text;
  const pieces: { text: string; fontSize?: number }[] = [];
  for (const part of thaiSegmenter.segment(text)) {
    if (pieces.length) pieces.push({ text: ' ', fontSize: 0.5 });
    pieces.push({ text: part.segment });
  }
  return pieces;
}

export type LineCounter = (text: string, width: number, fontSize: number) => number;

export const SARABUN_LINE_HEIGHT = 1.3;

export function countLines(text: string | null | undefined, width: number, measure: (token: string) => number): number {
  if (!text) return 1;
  let total = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    const tokens = thaiSegmenter
      ? [...thaiSegmenter.segment(paragraph)].map((part) => part.segment)
      : (paragraph.match(/\S+\s*|\s+/g) ?? ['']);
    let lines = 1;
    let current = 0;
    for (const token of tokens) {
      const size = measure(token);
      if (current + size > width && current > 0) {
        lines += 1;
        current = measure(token.trimStart());
      } else {
        current += size;
      }
    }
    total += lines;
  }
  return total;
}

let measureContext: Promise<CanvasRenderingContext2D> | null = null;

function loadMeasureContext(): Promise<CanvasRenderingContext2D> {
  measureContext ??= (async () => {
    const face = new FontFace('SarabunMeasure', `url(${new URL('fonts/Sarabun-Regular.ttf', document.baseURI).href})`);
    document.fonts.add(await face.load());
    return document.createElement('canvas').getContext('2d')!;
  })();
  return measureContext;
}

export async function createLineCounter(): Promise<LineCounter> {
  const context = await loadMeasureContext();
  return (text, width, fontSize) => {
    context.font = `${fontSize}px SarabunMeasure`;
    return countLines(text, width, (token) => context.measureText(token).width);
  };
}

export type TextMeasure = (text: string, fontSize: number) => number;

export async function createTextMeasure(): Promise<TextMeasure> {
  const context = await loadMeasureContext();
  return (text, fontSize) => {
    context.font = `${fontSize}px SarabunMeasure`;
    return context.measureText(text).width;
  };
}

/** Breaks text into lines; line `index` may be at most `widthFor(index)` wide (explicit newlines start a new line). */
export function wrapLines(text: string | null | undefined, widthFor: (index: number) => number, measure: (token: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of (text ?? '').split(/\r?\n/)) {
    const tokens = thaiSegmenter
      ? [...thaiSegmenter.segment(paragraph)].map((part) => part.segment)
      : (paragraph.match(/\S+\s*|\s+/g) ?? ['']);
    let current = '';
    for (const token of tokens) {
      if (current && measure(current + token) > widthFor(lines.length)) {
        lines.push(current.trimEnd());
        current = token.trimStart();
      } else {
        current += token;
      }
    }
    lines.push(current.trimEnd());
  }
  return lines;
}

export function paginate<T>(items: T[], heightOf: (item: T) => number, capacity: number): T[][] {
  const pages: T[][] = [[]];
  let used = 0;
  for (const item of items) {
    const height = heightOf(item);
    if (used + height > capacity && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(item);
    used += height;
  }
  return pages;
}

export function formatPdfDate(value: string | null | undefined, short = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return value ?? '';
  return `${match[3]}/${match[2]}/${short ? match[1].slice(2) : match[1]}`;
}

export function formatPdfAmount(value: string | number): string {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
