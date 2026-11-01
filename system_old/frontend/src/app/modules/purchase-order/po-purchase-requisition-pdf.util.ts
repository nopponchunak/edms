import {
  AttachmentDisplayItem,
  getAttachmentDisplayItems,
  getAttachmentHref,
  getAttachmentPreviewType,
} from 'app/core/utils/attachment-url.util';

const PR_PDF_KEYS = [
  'purchaseRequisitionPdf',
  'purchaseRequisitionPdfUrl',
  'purchaseRequisitionPdfPath',
  'purchase_requisition_pdf',
  'purchase_requisition_pdf_url',
  'purchase_requisition_pdf_path',
  'requisitionPdf',
  'requisitionPdfUrl',
  'requisitionPdfPath',
  'requisition_pdf',
  'requisition_pdf_url',
  'requisition_pdf_path',
  'prPdf',
  'prPdfUrl',
  'prPdfPath',
  'pr_pdf',
  'pr_pdf_url',
  'pr_pdf_path',
  'pdfPr',
  'pdfPrUrl',
  'pdfPrPath',
  'pdf_pr',
  'pdf_pr_url',
  'pdf_pr_path',
  'prFile',
  'prFileUrl',
  'prFilePath',
  'pr_file',
  'pr_file_url',
  'pr_file_path',
  'purchaseRequisitionFile',
  'purchaseRequisitionFileUrl',
  'purchaseRequisitionFilePath',
  'purchase_requisition_file',
  'purchase_requisition_file_url',
  'purchase_requisition_file_path',
  'pdf',
  'pdfUrl',
  'pdf_url',
  'pdfPath',
  'pdf_path',
];

const NESTED_PR_KEYS = [
  'purchaseRequisition',
  'purchase_requisition',
  'requisition',
  'purchaseRequest',
  'purchase_request',
  'pr',
];

const PR_ATTACHMENT_KEYS = [
  'purchaseRequisitionAttachments',
  'purchase_requisition_attachments',
  'requisitionAttachments',
  'requisition_attachments',
  'prAttachments',
  'pr_attachments',
];

const NESTED_PR_ATTACHMENT_KEYS = [
  ...PR_ATTACHMENT_KEYS,
  'attachments',
  'files',
  'documents',
];

export function getPurchaseRequisitionPdfDisplayItems(
  purchaseOrder: any,
  attachmentLinks: AttachmentDisplayItem[] = []
): AttachmentDisplayItem[] {
  if (!purchaseOrder) {
    return [];
  }

  const purchaseRequisitionAttachmentItems = getPurchaseRequisitionAttachmentItems(purchaseOrder);
  const generatedPurchaseRequisitionPdf = buildPurchaseRequisitionBackendCombinedPdfItem(purchaseOrder);

  if (generatedPurchaseRequisitionPdf) {
    return [generatedPurchaseRequisitionPdf];
  }

  const nestedRequisition = readFirstValue(purchaseOrder, NESTED_PR_KEYS);
  const dedicatedSources = [
    ...readValues(purchaseOrder, PR_PDF_KEYS),
    ...readValues(nestedRequisition, PR_PDF_KEYS),
  ];

  const dedicatedPdfItems = uniqueAttachmentItems(
    dedicatedSources.flatMap((source) => toPdfDisplayItems(source))
  );

  if (dedicatedPdfItems.length > 0) {
    return uniqueAttachmentItems([...dedicatedPdfItems, ...purchaseRequisitionAttachmentItems]);
  }

  if (purchaseRequisitionAttachmentItems.length > 0) {
    return purchaseRequisitionAttachmentItems;
  }

  const attachmentPdfItems = uniqueAttachmentItems(
    attachmentLinks.filter((item) => getAttachmentPreviewType(item) === 'pdf')
  );
  const markedPrItems = attachmentPdfItems.filter((item) => looksLikePurchaseRequisitionPdf(item, purchaseOrder));

  if (markedPrItems.length > 0) {
    return markedPrItems;
  }

  return [];
}

export function mergePurchaseRequisitionPdfIntoAttachments(
  purchaseOrder: any,
  attachmentLinks: AttachmentDisplayItem[] = []
): AttachmentDisplayItem[] {
  const purchaseRequisitionPdfItems = getPurchaseRequisitionPdfDisplayItems(purchaseOrder, attachmentLinks);

  if (purchaseRequisitionPdfItems.length === 0) {
    return attachmentLinks;
  }

  const primaryPurchaseRequisitionPdfItems = purchaseRequisitionPdfItems.filter((item) => item.type !== 'purchase-requisition-attachment');
  let primaryPurchaseRequisitionPdfIndex = 0;
  const renamedPurchaseRequisitionPdfItems = purchaseRequisitionPdfItems.map((item) => {
    if (item.type === 'purchase-requisition-attachment') {
      return item;
    }

    const renamedItem = {
      ...item,
      fileName: getPurchaseRequisitionPdfFileName(
        purchaseOrder,
        primaryPurchaseRequisitionPdfIndex,
        primaryPurchaseRequisitionPdfItems.length
      ),
      mimeType: item.mimeType || 'application/pdf',
    };
    primaryPurchaseRequisitionPdfIndex += 1;
    return renamedItem;
  });
  const purchaseRequisitionPdfKeys = new Set(
    renamedPurchaseRequisitionPdfItems.map((item) => getAttachmentIdentity(item))
  );
  const remainingAttachments = attachmentLinks.filter((item) => !purchaseRequisitionPdfKeys.has(getAttachmentIdentity(item)));

  return [...renamedPurchaseRequisitionPdfItems, ...remainingAttachments];
}

export function excludePurchaseRequisitionPdfFromAttachments(
  purchaseOrder: any,
  attachmentLinks: AttachmentDisplayItem[] = []
): AttachmentDisplayItem[] {
  const purchaseRequisitionPdfItems = getPurchaseRequisitionPdfDisplayItems(purchaseOrder, attachmentLinks);

  if (purchaseRequisitionPdfItems.length === 0) {
    return attachmentLinks;
  }

  const purchaseRequisitionPdfKeys = new Set(
    purchaseRequisitionPdfItems.map((item) => getAttachmentIdentity(item))
  );

  return attachmentLinks.filter((item) => !purchaseRequisitionPdfKeys.has(getAttachmentIdentity(item)));
}

function toPdfDisplayItems(value: unknown): AttachmentDisplayItem[] {
  return toDisplayItems(value).filter((item) => getAttachmentPreviewType(item) === 'pdf');
}

function toDisplayItems(value: unknown): AttachmentDisplayItem[] {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (Array.isArray(value) || typeof value === 'string') {
    return getAttachmentDisplayItems(value);
  }

  if (typeof value === 'object') {
    return getAttachmentDisplayItems([value]);
  }

  return [];
}

function getPurchaseRequisitionAttachmentItems(purchaseOrder: any): AttachmentDisplayItem[] {
  const nestedRequisition = readFirstValue(purchaseOrder, NESTED_PR_KEYS);
  const attachmentSources = [
    ...readValues(purchaseOrder, PR_ATTACHMENT_KEYS),
    ...readValues(nestedRequisition, NESTED_PR_ATTACHMENT_KEYS),
  ];

  return uniqueAttachmentItems(
    attachmentSources
      .flatMap((source) => toDisplayItems(source))
      .map((item) => ({
        ...item,
        type: 'purchase-requisition-attachment',
      }))
  );
}

function readValues(source: any, keys: string[]): unknown[] {
  if (!source || typeof source !== 'object') {
    return [];
  }

  return keys
    .map((key) => source[key])
    .filter((value) => value !== null && value !== undefined && value !== '');
}

function readFirstValue(source: any, keys: string[]): unknown {
  return readValues(source, keys)[0] ?? null;
}

function uniqueAttachmentItems(items: AttachmentDisplayItem[]): AttachmentDisplayItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getAttachmentIdentity(item);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getAttachmentIdentity(item: AttachmentDisplayItem): string {
  return normalizeAttachmentIdentity(item.filePath || item.href || item.fileName);
}

function normalizeAttachmentIdentity(value: unknown): string {
  const source = String(value || '').trim().toLowerCase();
  if (!source) {
    return '';
  }

  const withoutQuery = source.split(/[?#]/)[0].replace(/\\/g, '/');
  const withoutOrigin = withoutQuery.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
  const normalizedSlashes = withoutOrigin.replace(/\/+/g, '/');

  return normalizedSlashes.startsWith('/') ? normalizedSlashes : `/${normalizedSlashes}`;
}

function getPurchaseRequisitionPdfFileName(purchaseOrder: any, index: number, total: number): string {
  const baseName = getPurchaseRequisitionBaseName(purchaseOrder);
  const suffix = total > 1 ? `-${index + 1}` : '';

  return `${baseName}${suffix}.pdf`;
}

function getPurchaseRequisitionBaseName(purchaseOrder: any): string {
  const nestedRequisition = readFirstValue(purchaseOrder, NESTED_PR_KEYS);
  const prNo = String(
    readFirstValue(purchaseOrder, ['purchaseRequisitionNo', 'purchase_requisition_no', 'requisitionNo', 'requisition_no', 'prNo', 'pr_no'])
      ?? readFirstValue(nestedRequisition, ['prNo', 'pr_no', 'purchaseRequisitionNo', 'purchase_requisition_no'])
      ?? ''
  ).trim();

  if (prNo) {
    return normalizePurchaseRequisitionLabel(prNo);
  }

  const prId = String(
    readFirstValue(purchaseOrder, ['purchaseRequisitionId', 'purchase_requisition_id', 'requisitionId', 'requisition_id', 'prId', 'pr_id'])
      ?? readFirstValue(nestedRequisition, ['id', 'purchaseRequisitionId', 'purchase_requisition_id'])
      ?? ''
  ).trim();

  return prId ? `PR-${prId}` : 'PR';
}

function buildPurchaseRequisitionBackendCombinedPdfItem(purchaseOrder: any): AttachmentDisplayItem | null {
  const nestedRequisition = readFirstValue(purchaseOrder, NESTED_PR_KEYS);
  const prId = String(
    readFirstValue(purchaseOrder, ['purchaseRequisitionId', 'purchase_requisition_id', 'requisitionId', 'requisition_id', 'prId', 'pr_id'])
      ?? readFirstValue(nestedRequisition, ['id', 'purchaseRequisitionId', 'purchase_requisition_id'])
      ?? ''
  ).trim();

  if (!prId) {
    return null;
  }

  const filePath = `/api/purchase_requisitions/${encodeURIComponent(prId)}/combined-pdf`;

  return {
    fileName: `${getPurchaseRequisitionBaseName(purchaseOrder)}.pdf`,
    filePath,
    fileSize: '',
    href: getAttachmentHref(filePath),
    type: 'backend-combined-pdf',
    mimeType: 'application/pdf',
  };
}

function normalizePurchaseRequisitionLabel(value: string): string {
  const withoutExtension = value.replace(/\.pdf$/i, '').trim();
  return /^pr[-_\s]?/i.test(withoutExtension) ? withoutExtension : `PR-${withoutExtension}`;
}

function looksLikePurchaseRequisitionPdf(item: AttachmentDisplayItem, purchaseOrder: any): boolean {
  const source = `${item.fileName || ''} ${item.filePath || ''} ${item.href || ''}`.toLowerCase();
  const sourceCompact = compactText(source);
  const prNumber = compactText(
    purchaseOrder?.purchaseRequisitionNo
      ?? purchaseOrder?.purchase_requisition_no
      ?? purchaseOrder?.prNo
      ?? purchaseOrder?.pr_no
      ?? ''
  );

  if (prNumber && sourceCompact.includes(prNumber)) {
    return true;
  }

  return source.includes('purchase-requisition')
    || source.includes('purchase_requisition')
    || source.includes('purchase requisition')
    || source.includes('requisition')
    || /(^|[\/_\-\s])pr([\/_\-\s]|\d|$)/.test(source);
}

function compactText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
