import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { checkbox, dottedBlock, gap, Measure } from '../../shared/pdf/dotted-form';
import { PdfPeople, PdfPerson, PDF_LINE, signatureBlock } from '../../shared/pdf/pdf-blocks';
import { formatPdfAmount, formatPdfDate, TextMeasure } from '../../shared/pdf/pdf-generator';
import { PurchaseRequisition } from './purchase-requisition.service';

/*
 * 27 - MTPC-02 Purchase Requisition Form (REV A, effective 10 June 2026). Geometry follows the Word original (pt):
 * A4, margins 42.5 / 28.1, tab stops at 270 / 279 / 522, dotted fill-in lines, a ruled 5-column item table,
 * and the header (company, logo, form number, blue title) without the page frame the anti-corruption forms have.
 */
const FONT = 10;
const LEFT = 42.5;
const WIDTH = 524.7;
const FILL = 522;
const HALF = 270;
const GAP = 9;
const BLUE = '#023F88';
const ITEM_ROWS = 13;
/** Height (pt) of the item area, so the signature block ends near the foot of the page like the original. Each extra signature row takes 25pt of it. */
const ITEM_AREA = 196;
const FILE_NAME = '27 - MTPC-02-PURCHASE REQUISITION FORM (REV_A).DOCX';
const NOTE = 'In case of purchasing software and/or IT equipment, this request must be verified by IT department to confirm our existing hardware is adequate and doesn\'t need any further upgrading.';

const SIGN_ROW = 25;
const NO_BORDER: [boolean, boolean, boolean, boolean] = [false, false, false, false];
const LINE_BELOW: [boolean, boolean, boolean, boolean] = [false, false, false, true];
const dotted = {
  hLineWidth: (i: number) => (i === 0 ? 0 : PDF_LINE),
  vLineWidth: () => 0,
  hLineStyle: () => ({ dash: { length: 1, space: 2.2 } }),
  paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
};

export function buildPurchaseRequisitionPdf(record: PurchaseRequisition, people: PdfPeople, logo: string, textMeasure: TextMeasure): TDocumentDefinitions {
  const measure: Measure = (text) => textMeasure(text, FONT);
  const personOf = (username: string | null): PdfPerson | null => (username ? people.byUsername[username] ?? { name: username, code: null } : null);
  const requester: PdfPerson = { name: record.requestedBy, code: personOf(record.createBy)?.code ?? null };
  const submitted = !!record.prNo;
  const money = (value: string | number) => formatPdfAmount(value);

  /** A label with a dotted line, optionally followed by "(if any)", inside a column of the given width. */
  const half = (label: string, value: string | null, width: number, suffix = ''): Content => {
    const suffixWidth = suffix ? measure(suffix) + 4 : 0;
    return {
      columns: [
        { ...(dottedBlock(label, value, measure, { width: width - suffixWidth, after: 0 }) as object), width: width - suffixWidth },
        ...(suffix ? [{ text: suffix, width: suffixWidth, margin: [4, 6.5, 0, 0] }] : []),
      ],
      columnGap: 0,
    } as unknown as Content;
  };
  const pair = (left: Content, right: Content): Content => ({
    columns: [{ ...(left as object), width: HALF }, { text: '', width: GAP }, { ...(right as object), width: WIDTH - HALF - GAP }],
    columnGap: 0,
    margin: [0, 0, 0, 2],
  } as unknown as Content);

  // Item table: header row, 13 item rows (more if needed), then totals (the blank row above Sub Total carries the discount).
  const cell = (text: string, extra: object = {}): TableCell => ({ text, margin: [2, 0, 2, 0], lineHeight: 0.92, ...extra }) as TableCell;
  const head = (text: string): TableCell => cell(text, { alignment: 'center', bold: true, margin: [2, 3, 2, 3] });
  const unit = record.currency === 'THB' ? 'Baht' : record.currency;
  const filled: TableCell[][] = record.items.map((row) => [
    cell(row.item || ' ', { alignment: 'center' }),
    cell(row.description || ' '),
    cell(String(row.quantity), { alignment: 'center' }),
    cell(money(row.unitPrice), { alignment: 'right' }),
    cell(money(row.amount), { alignment: 'right' }),
  ]);
  const blanks: TableCell[][] = Array.from({ length: Math.max(0, ITEM_ROWS - filled.length) }, () => [cell(' '), cell(' '), cell(' '), cell(' '), cell(' ')]);
  const totalRow = (label: string, value: string, bold = false): TableCell[] => [
    cell(' '), cell(' '), cell(label, { bold }), cell(value, { alignment: 'right', bold, colSpan: 2 }), {} as TableCell,
  ];
  const hasDiscount = Number(record.discount) > 0;
  const itemCount = filled.length + blanks.length;
  const rowHeight = Math.max(12.2, (ITEM_AREA - (record.approver2By ? SIGN_ROW : 0)) / itemCount);
  const table: TableCell[][] = [
    [head('Item(s)'), head('Description'), head('Quantity'), head(`*Unit Price (${unit})`), head(`*Amount (${unit})`)],
    ...filled,
    ...blanks,
    totalRow(hasDiscount ? 'Discount' : ' ', hasDiscount ? money(record.discount) : ' '),
    totalRow('Sub Total', money(record.subTotal)),
    totalRow('VAT 7%', money(record.vatValue)),
    totalRow('Grand Total', money(record.grandTotal), true),
  ];

  const signCell = (person: PdfPerson | null, signedAt: string | null, role: string, width: number): TableCell => {
    const roleWidth = role ? measure(role) + 6 : 0;
    return {
      columns: [
        person ? { ...(signatureBlock(person, signedAt, width - roleWidth - 6, 15) as object), width: width - roleWidth } : { text: ' ', width: width - roleWidth },
        ...(role ? [{ text: role, width: roleWidth, alignment: 'right', margin: [0, 10, 0, 0] }] : []),
      ],
      border: LINE_BELOW,
      margin: [0, 0, 0, 1],
    } as TableCell;
  };
  /** "Label:  ........ (role)   Date: ........" on the original's tab stops (81 / 351 / 360 / 522 pt). */
  const signRow = (label: string, role: string, by: string | null, status: string | null, signedAt: string | null, own?: PdfPerson | null, from = 81): Content => {
    const person = own ?? (by && status === 'approved' ? personOf(by) : null);
    const stamp = person ? signedAt : null;
    const dateLabel = measure('Date:') + 6;
    return {
      table: {
        widths: [from, 351 - from - 0, 9, dateLabel, FILL - 360 - dateLabel],
        heights: () => SIGN_ROW,
        body: [[
          { text: label, margin: [0, 10, 0, 0], border: NO_BORDER },
          signCell(person, stamp, role, 351 - from),
          { text: '', border: NO_BORDER },
          { text: 'Date:', margin: [0, 10, 0, 0], border: NO_BORDER },
          { text: person ? formatPdfDate(signedAt, true) : ' ', border: LINE_BELOW, margin: [2, 9, 0, 0] },
        ]],
        dontBreakRows: true,
      },
      layout: dotted,
      unbreakable: true,
    } as unknown as Content;
  };

  const askAsset = record.needAssetCodeRegistration !== null;
  const content: Content[] = [
    pair(half('To:', record.toName, HALF), half('Date:', formatPdfDate(record.requestDate), WIDTH - HALF - GAP)),
    pair(half('Requested By', record.requestedBy, HALF), half('Recommended By:', record.recommendedBy, WIDTH - HALF - GAP, '(if any)')),
    pair(half('Deadline:', formatPdfDate(record.deadline), HALF, '(if any)'), half('Received From:', record.receivedFrom, WIDTH - HALF - GAP, '(if any)')),
    dottedBlock('Reasons for Purchase:', record.reasonsForPurchase, measure, { width: FILL, lines: 3, after: 0 }),
    gap(8),
    {
      table: { headerRows: 1, widths: [72, 208.15, 75.35, 84, 87], body: table, dontBreakRows: true, heights: (row: number) => (row >= 1 && row <= itemCount ? rowHeight : undefined) },
      layout: { hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i <= 1 || i === 1 + itemCount || i === node.table.body.length ? 0.5 : 0), vLineWidth: () => 0.5, paddingTop: () => 0, paddingBottom: () => 0, paddingLeft: () => 0, paddingRight: () => 0 },
    } as unknown as Content,
    gap(6),
    { columns: [{ text: [{ text: 'Note:', bold: true }], width: 36 }, { text: NOTE, width: '*' }], margin: [0, 0, 0, 6] } as unknown as Content,
    { columns: [{ text: 'Payment Term:', width: 72 }, { text: record.paymentTerm ?? '', width: '*' }], margin: [0, 0, 0, 6] } as unknown as Content,
    dottedBlock('Other conditions (if any):', record.otherConditions, measure, { width: FILL, labelWidth: 147.75, after: 4 }),
    { text: '*Please fill in the price and attach quotation (if any)', margin: [67.5, 0, 0, 0] },
    gap(2),
    signRow('Requested By:', '', record.requestedBy, 'approved', record.createdAt, submitted ? requester : null),
    ...(record.verifyIsBy ? [signRow('Verified By:', '(IS for all IT equipment only)', record.verifyIsBy, record.verifyIsByStatus, record.verifyIsByDate)] : []),
    signRow('Verified By:', '(MD/DI/AD/TL)', record.verifyBy, record.verifyByStatus, record.verifyByDate),
    signRow('Approved By:', '(MD/DI)', record.approverBy, record.approverByStatus, record.approverByDate),
    ...(record.approver2By ? [signRow('Approved By 2:', '(Grand total over 50,000)', record.approver2By, record.approver2ByStatus, record.approver2ByDate)] : []),
    signRow('Acknowledged:', '(CA)', record.ackBy, record.ackByStatus, record.ackByDate),
    {
      columns: [
        { text: 'Need asset code registration?', width: 180, margin: [0, 16, 0, 0] },
        { ...(askAsset ? (checkbox(record.needAssetCodeRegistration === true) as object) : (checkbox(false) as object)), width: 27, margin: [0, 14, 0, 0] },
        { text: 'Yes', width: 81, margin: [0, 16, 0, 0] },
        { ...(askAsset ? (checkbox(record.needAssetCodeRegistration === false) as object) : (checkbox(false) as object)), width: 27, margin: [0, 14, 0, 0] },
        { text: 'No', width: '*', margin: [0, 16, 0, 0] },
      ],
    } as unknown as Content,
    signRow('Action by:', '(ADM)', record.actionBy, record.actionByStatus, record.actionByDate, undefined, 61),
  ];

  return {
    info: { title: `Purchase Requisition ${record.prNo ?? ''}`.trim(), author: 'Meinhardt EDMS' },
    pageSize: 'A4',
    pageMargins: [LEFT, 86.75, 28.1, 34],
    defaultStyle: { font: 'Sarabun', fontSize: FONT },
    background: () => [
      { text: 'Meinhardt (Thailand) Ltd.', bold: true, fontSize: 12, absolutePosition: { x: LEFT, y: 36 } },
      { image: logo, width: 100.65, absolutePosition: { x: LEFT + 429.05, y: 30 } },
      { columns: [{ text: '27 - FORM MTPC-02', bold: true, fontSize: 7, alignment: 'right', width: WIDTH }], absolutePosition: { x: LEFT, y: 54 } },
      { columns: [{ text: 'PURCHASE REQUISITION FORM', bold: true, fontSize: 12, color: BLUE, alignment: 'center', width: WIDTH }], absolutePosition: { x: LEFT, y: 72 } },
    ] as unknown as Content,
    footer: (current: number, total: number) => ({
      margin: [LEFT, 4, 28.1, 0],
      color: '#003E7E',
      fontSize: 6,
      stack: [
        { columns: [{ text: `M:/MTL_INDEX/IMS DOCUMENTATION/5. FORMS/ ${FILE_NAME}/OKK/MJR/ANS`, width: '*' }, { text: `Page ${current} of ${total}`, width: 'auto' }] },
        { text: 'EFFECTIVE DATE: 10 JUNE 2026', margin: [0, 2, 0, 0] },
      ],
    }),
    content,
  };
}
