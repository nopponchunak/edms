export interface AttachmentFile {
  blob: Blob;
  mimeType: string;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28;

/**
 * Adds the attachments after the form's own pages: PDF pages are copied as they are, PNG / JPEG images get a page of
 * their own (scaled to fit A4). Other file types and unreadable files are skipped, so a bad attachment never blocks printing.
 * pdf-lib is loaded on demand.
 */
export async function appendAttachments(main: Blob, files: AttachmentFile[]): Promise<Blob> {
  if (!files.length) return main;
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.load(await main.arrayBuffer());

  for (const file of files) {
    try {
      const bytes = await file.blob.arrayBuffer();
      if (file.mimeType === 'application/pdf') {
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(source, source.getPageIndices());
        pages.forEach((page) => out.addPage(page));
      } else if (file.mimeType === 'image/png' || file.mimeType === 'image/jpeg') {
        const image = file.mimeType === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const scale = Math.min((A4.w - 2 * MARGIN) / image.width, (A4.h - 2 * MARGIN) / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        const page = out.addPage([A4.w, A4.h]);
        page.drawImage(image, { x: (A4.w - width) / 2, y: A4.h - MARGIN - height, width, height });
      }
    } catch {
      // skipped on purpose
    }
  }
  return new Blob([await out.save() as BlobPart], { type: 'application/pdf' });
}
