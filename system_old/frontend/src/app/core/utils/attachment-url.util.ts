import { environment } from '../../../environments/environment';

/**
 * Build full URL for an attachment path returned from API/upload.
 * Use for displaying attachment links on GET/view pages.
 */
export function getAttachmentUrl(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') return '';
  const base = (environment as { apiUrl?: string }).apiUrl?.replace?.(/\/$/, '') ?? '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base + normalizedPath;
}

/**
 * Normalize path for API body (ensure leading slash if backend expects it).
 */
export function normalizeAttachmentPath(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') return '';
  return path.startsWith('/') ? path : `/${path}`;
}

export interface AttachmentDisplayItem {
  fileName: string;
  filePath: string;
  fileSize: string;
  href: string;
  type: string;
  mimeType?: string;
}

export type AttachmentPreviewType = 'pdf' | 'image' | 'file';

export function normalizeAttachments(value: unknown): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const decoded = JSON.parse(trimmed);
      if (Array.isArray(decoded)) {
        return decoded;
      }
    } catch {
      return [trimmed];
    }

    return [trimmed];
  }

  return [];
}

export function formatAttachmentSize(value: unknown): string {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return '';
  }

  return `${(size / 1024).toFixed(2)} KB`;
}

export function getAttachmentHref(path: string | null | undefined): string {
  const value = String(path || '').trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('http') || value.startsWith('\\\\')) {
    return value;
  }

  return getAttachmentUrl(value);
}

export function getAttachmentPreviewType(value: Pick<AttachmentDisplayItem, 'fileName' | 'filePath' | 'href' | 'mimeType'> | string | null | undefined): AttachmentPreviewType {
  const source = typeof value === 'string'
    ? value
    : `${value?.mimeType || ''} ${value?.fileName || ''} ${value?.filePath || ''} ${value?.href || ''}`;
  const normalizedSource = source.split(/[?#]/)[0].toLowerCase();

  if (normalizedSource.includes('application/pdf') || /\.pdf$/.test(normalizedSource)) {
    return 'pdf';
  }

  if (normalizedSource.includes('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(normalizedSource)) {
    return 'image';
  }

  return 'file';
}

export function getAttachmentTypeLabel(value: Pick<AttachmentDisplayItem, 'fileName' | 'filePath' | 'href' | 'mimeType'> | string | null | undefined): string {
  const source = typeof value === 'string'
    ? value
    : `${value?.mimeType || ''} ${value?.fileName || ''} ${value?.filePath || ''} ${value?.href || ''}`;
  const normalizedSource = source.split(/[?#]/)[0].toLowerCase();

  if (normalizedSource.includes('application/pdf') || /\.pdf$/.test(normalizedSource)) {
    return 'PDF';
  }

  if (normalizedSource.includes('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(normalizedSource)) {
    return 'Image';
  }

  if (normalizedSource.includes('wordprocessingml') || normalizedSource.includes('msword') || /\.docx?$/.test(normalizedSource)) {
    return 'Word';
  }

  if (normalizedSource.includes('spreadsheetml') || normalizedSource.includes('ms-excel') || /\.xlsx?$/.test(normalizedSource)) {
    return 'Excel';
  }

  if (normalizedSource.includes('presentationml') || normalizedSource.includes('ms-powerpoint') || /\.pptx?$/.test(normalizedSource)) {
    return 'PowerPoint';
  }

  return 'File';
}

export function getAttachmentIcon(value: Pick<AttachmentDisplayItem, 'fileName' | 'filePath' | 'href' | 'mimeType'> | string | null | undefined): string {
  const type = getAttachmentTypeLabel(value);

  switch (type) {
    case 'PDF':
      return 'heroicons_outline:document-text';
    case 'Image':
      return 'heroicons_outline:photo';
    default:
      return 'heroicons_outline:document';
  }
}

export function getAttachmentDisplayItems(value: unknown): AttachmentDisplayItem[] {
  return normalizeAttachments(value)
    .map((item): AttachmentDisplayItem | null => {
      const isStringItem = typeof item === 'string';
      const filePath = String(
        isStringItem ? item : item?.file_path ?? item?.path ?? item?.file_url ?? item?.url ?? ''
      ).trim();

      if (!filePath) {
        return null;
      }

      const type = isStringItem ? 'file' : item?.type ?? 'file';
      const fileName = type === 'link'
        ? filePath
        : String(
            isStringItem
              ? filePath.split(/[\\/]/).pop() || filePath
              : item?.file_name ?? item?.fileName ?? item?.name ?? (filePath.split(/[\\/]/).pop() || filePath)
          ).trim();

      return {
        fileName,
        filePath,
        fileSize: isStringItem ? '' : formatAttachmentSize(item?.file_size ?? item?.fileSize),
        href: getAttachmentHref(filePath),
        type,
        mimeType: isStringItem ? '' : String(item?.mime_type ?? item?.mimeType ?? '').trim(),
      };
    })
    .filter((item): item is AttachmentDisplayItem => !!item);
}
