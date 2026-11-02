import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatPdfAmount, formatPdfDate, LineCounter, paginate, SARABUN_LINE_HEIGHT, wrapThai } from '../../shared/pdf/pdf-generator';
import { brandHeader, PDF_LINE, PdfPeople, PdfPerson, signedLine, underlined } from '../../shared/pdf/pdf-blocks';
import { ExpensesClaim, ExpensesClaimItem } from './expenses-claim.service';

const MIN_ROWS = 20;
const ROW_MIN = 20;
const AMOUNT_WIDTH = 84;
const COLS = 4;
const FONT = 10;
const DETAILS_WIDTH = 278;
const PROJECT_WIDTH = 60;
const PACK_CAPACITY = MIN_ROWS * ROW_MIN + 18;

export function buildExpensesClaimPdf(claim: ExpensesClaim, people: PdfPeople, logo: string, lines: LineCounter): TDocumentDefinitions {
  const signer = (by: string | null, status: string | null): PdfPerson | null =>
    by && status === 'approved' ? (people.byUsername[by] ?? { name: by, code: null }) : null;
  const currencyLabel = claim.currency === 'THB' ? 'BAHT' : claim.currency;
  const head = (text: string): TableCell => ({ text, bold: true, alignment: 'center', margin: [0, 2, 0, 0] });

  const rowHeight = (item: ExpensesClaimItem) => {
    const count = Math.max(lines(item.details, DETAILS_WIDTH, FONT), lines(item.projectCode ?? '', PROJECT_WIDTH, FONT));
    return Math.max(ROW_MIN, 4 + count * FONT * SARABUN_LINE_HEIGHT + 3);
  };
  const pages = paginate(claim.items, rowHeight, PACK_CAPACITY);

  const signature = (label: string, person: PdfPerson | null, signedAt: string | null, role: string, roleAlign: 'center' | 'right'): Content => ({
    stack: [
      { columns: [{ text: label, bold: true, width: 68, margin: [0, 12, 0, 0] }, signedLine(person, signedAt)] },
      { text: role, bold: true, alignment: roleAlign, margin: [68, 4, 0, 0] },
    ],
  });

  const fullRow = (content: Content, last = false): TableCell[] => [
    { ...(content as object), colSpan: COLS, border: [true, false, true, last] } as TableCell,
    {}, {}, {},
  ];

  const page = (chunk: ExpensesClaimItem[], index: number): Content[] => {
    const used = chunk.reduce((sum, item) => sum + rowHeight(item), 0);
    const blankCount = Math.max(0, Math.floor((MIN_ROWS * ROW_MIN - used) / ROW_MIN));
    const pageTotal = chunk.reduce((sum, item) => sum + Number(item.baht || 0), 0);
    const oversize = used > PACK_CAPACITY;

    const rows: TableCell[][] = chunk.map((item) => [
      { text: formatPdfDate(item.itemDate), alignment: 'center', margin: [0, 4, 0, 0] },
      { text: wrapThai(item.projectCode), margin: [0, 4, 0, 0] },
      { text: wrapThai(item.details), margin: [0, 4, 0, 0] },
      { text: formatPdfAmount(item.baht), alignment: 'right', margin: [0, 4, 0, 0] },
    ]);
    for (let i = 0; i < blankCount; i += 1) rows.push([{ text: '' }, { text: '' }, { text: '' }, { text: '' }]);

    const body: TableCell[][] = [
      [head('DATE'), head('PROJECT'), head('DETAILS'), head(currencyLabel)],
      ...rows,
      [
        { text: 'TOTAL', bold: true, alignment: 'right', colSpan: 3, border: [true, false, false, false], margin: [0, 5, 20, 0] }, {}, {},
        { text: formatPdfAmount(pageTotal), bold: true, alignment: 'right', border: [true, false, true, true], margin: [0, 5, 0, 0] },
      ],
      fullRow({
        columns: [
          signature('Verified by:', signer(claim.verifiedBy, claim.verifiedByStatus), claim.verifiedByDate, '(TL/ AD/ DI/ MD)', 'center'),
          signature('Approved by:', signer(claim.approvedBy, claim.approvedByStatus), claim.approvedByDate, '(DI/ MD)', 'right'),
        ],
        columnGap: 28,
        margin: [10, 18, 10, 0],
      } as Content),
      fullRow({
        columns: [
          { text: '', width: '*' },
          { text: 'Received by:', bold: true, width: 'auto', margin: [0, 3, 4, 0] },
          underlined('', 130),
          { text: 'Date:', bold: true, width: 'auto', margin: [14, 3, 4, 0] },
          underlined('', 110),
        ],
        margin: [10, 22, 10, 14],
      } as Content, true),
    ];

    const lastItemRow = rows.length;
    const itemsTable = {
      table: {
        widths: [62, 62, '*', AMOUNT_WIDTH],
        heights: (row: number) => (row === 0 ? 18 : row <= lastItemRow ? ROW_MIN : row === lastItemRow + 1 ? 22 : 0),
        dontBreakRows: !oversize,
        body,
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 1 : PDF_LINE),
        vLineWidth: (i: number) => (i === 0 || i === COLS ? 1 : PDF_LINE),
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    } as unknown as Content;

    const topFrame = {
      table: {
        widths: ['*'],
        body: [[{
          border: [true, true, true, false],
          stack: [
            { ...(brandHeader(logo, 'Meinhardt (Thailand) Ltd.', 'GENERAL FORM 105') as object), margin: [10, 0, 10, 0] },
            { text: 'EXPENSES CLAIM', bold: true, fontSize: 13, margin: [10, 16, 10, 12] },
            {
              columns: [{ text: '', width: '*' }, { text: 'VOUCHER #', bold: true, width: 'auto', margin: [0, 3, 6, 0] }, underlined(claim.voucherNo ?? '', 110)],
              margin: [10, 0, 10, 10],
            },
            {
              columns: [
                { text: 'NAME:', bold: true, width: 40, margin: [0, 3, 0, 0] },
                underlined(claim.claimantName),
                { text: 'DATE:', bold: true, width: 'auto', margin: [18, 3, 6, 0] },
                underlined(formatPdfDate(claim.claimDate), 100),
              ],
              margin: [10, 0, 10, 12],
            },
          ],
        }]],
      },
      layout: { hLineWidth: (i: number) => (i === 0 ? 1 : 0), vLineWidth: () => 1, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 10, paddingBottom: () => 0 },
    } as unknown as Content;

    const circ = {
      columns: [
        { text: 'Circ: Accts /', fontSize: 9, width: 'auto', margin: [0, 3, 3, 0] },
        { width: 110, stack: [underlined('', '*', 'dotted'), { text: '(TL)', fontSize: 9, alignment: 'center' }] },
        { text: '/', fontSize: 9, width: 'auto', margin: [3, 3, 3, 0] },
        { width: 44, stack: [underlined('', '*', 'dotted'), { text: '(DI)', fontSize: 9, alignment: 'center' }] },
        { text: '/Accts', fontSize: 9, width: 'auto', margin: [3, 3, 0, 0] },
        { text: pages.length > 1 ? `Page ${index + 1} / ${pages.length}` : '', fontSize: 9, width: '*', alignment: 'right', margin: [0, 3, 0, 0] },
      ],
      margin: [0, 0, 0, 4],
      ...(index > 0 ? { pageBreak: 'before' } : {}),
    } as unknown as Content;

    return [circ, topFrame, itemsTable];
  };

  return {
    info: { title: `Expenses Claim ${claim.voucherNo ?? ''}`.trim(), author: 'Meinhardt EDMS' },
    pageSize: 'A4',
    pageMargins: [34, 28, 34, 28],
    defaultStyle: { font: 'Sarabun', fontSize: FONT },
    content: pages.flatMap((chunk, index) => page(chunk, index)),
  };
}
