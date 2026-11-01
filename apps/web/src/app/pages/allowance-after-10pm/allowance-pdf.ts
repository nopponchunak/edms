import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatPdfAmount, formatPdfDate, LineCounter, paginate, SARABUN_LINE_HEIGHT, wrapThai } from '../../shared/pdf/pdf-generator';
import { brandHeader, PDF_LINE, PdfPeople, PdfPerson, signatureBlock, signatureHeight, underlined } from '../../shared/pdf/pdf-blocks';
import { Allowance, AllowanceItem } from './allowance.service';

const MIN_ROWS = 15;
const ROW_MIN = 26;
const FONT = 8.5;
const SMALL = 7.5;
const DESCRIPTION_WIDTH = 80;
const PROJECT_WIDTH = 38;
const SIGN_WIDTH = 96;
const PACK_CAPACITY = MIN_ROWS * ROW_MIN;
const BLUE = '#1e3a8a';
const DISCIPLINES = ['C&S', 'M&E', 'Admin', 'Other'];
const NOTES = [
  'Team Leader’s or Division Head’s approval is enough, no need for DI approval.',
  'Each person must fill his or her own form and one form is for only one person.',
  'The form with the approved signature must be submitted to the Accounts department every 15 days. (i.e. 1st – 15th and 16th – 31st)',
  'A meal allowance of Baht 100 per night plus taxi fare of Baht 100 per night.',
];

const WIDTHS: (number | '*')[] = [44, 40, '*', 26, 26, 44, SIGN_WIDTH, SIGN_WIDTH];
const SPACER = 6;
const GRID = WIDTHS.length;
const COLS = GRID + 2;
const NO_BORDER: [boolean, boolean, boolean, boolean] = [false, false, false, false];

export function buildAllowancePdf(record: Allowance, people: PdfPeople, logo: string, lines: LineCounter): TDocumentDefinitions {
  const personOf = (username: string | null): PdfPerson => people.byUsername[username ?? ''] ?? { name: username ?? '', code: null };
  const verifier = record.tlBy && record.tlByStatus === 'approved' ? personOf(record.tlBy) : null;
  const approver = record.diBy && record.diByStatus === 'approved' ? personOf(record.diBy) : null;
  const signHeight = Math.max(
    verifier ? signatureHeight(verifier.name, SIGN_WIDTH) : 0,
    approver ? signatureHeight(approver.name, SIGN_WIDTH) : 0,
  );
  const selected = (record.discipline ?? '').toLowerCase();

  const head = (text: string, extra: object = {}): TableCell => ({ text, bold: true, fontSize: SMALL, alignment: 'center', ...extra });
  const spanHead = (text: string): TableCell => head(text, { rowSpan: 2, margin: [0, 6, 0, 0] });
  const spacer = (extra: Partial<Record<'left' | 'right' | 'top', boolean>> = {}): TableCell => ({
    text: '',
    border: [!!extra.left, !!extra.top, !!extra.right, false],
  });
  const fullRow = (content: Content, last = false): TableCell[] => [
    { ...(content as object), colSpan: COLS, border: [true, false, true, last] } as TableCell,
    ...Array.from({ length: COLS - 1 }, () => ({}) as TableCell),
  ];

  const projectOf = (item: AllowanceItem) => [item.projectCode, item.projectName].filter(Boolean).join(' ');
  const rowHeight = (item: AllowanceItem) => {
    const count = Math.max(
      lines(item.description ?? '', DESCRIPTION_WIDTH, FONT),
      lines(projectOf(item), PROJECT_WIDTH, FONT),
    );
    return Math.max(ROW_MIN, 7 + count * FONT * SARABUN_LINE_HEIGHT + 3, 3 + signHeight + 3);
  };
  const pages = paginate(record.items, rowHeight, PACK_CAPACITY);

  const checkbox = (name: string): Content => ({
    width: '*',
    columns: [
      {
        width: 16,
        canvas: [
          { type: 'rect', x: 0, y: 2, w: 10, h: 10, lineWidth: PDF_LINE, lineColor: '#000' },
          ...(selected.includes(name.toLowerCase())
            ? [{ type: 'polyline', points: [{ x: 1.8, y: 7 }, { x: 4.2, y: 10 }, { x: 9, y: 2.5 }], lineWidth: 1.6, lineColor: '#000' }]
            : []),
        ],
      },
      { text: name, bold: true, width: 'auto' },
    ],
  } as Content);

  const divider = {
    table: { widths: ['*'], heights: 1, body: [[{ text: '', fontSize: 1, border: [false, true, false, false] }]] },
    layout: { hLineWidth: (i: number) => (i === 0 ? PDF_LINE : 0), vLineWidth: () => 0, hLineColor: () => BLUE, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
  } as unknown as Content;

  const page = (chunk: AllowanceItem[], index: number): Content[] => {
    const used = chunk.reduce((sum, item) => sum + rowHeight(item), 0);
    const blankCount = Math.max(0, Math.floor((MIN_ROWS * ROW_MIN - used) / ROW_MIN));
    const pageTotal = chunk.reduce((sum, item) => sum + Number(item.baht || 0), 0);
    const oversize = used > PACK_CAPACITY;

    const rows: TableCell[][] = chunk.map((item) => [
      { text: formatPdfDate(item.workDate, true), alignment: 'center', fontSize: FONT, margin: [0, 7, 0, 0] },
      { text: wrapThai(projectOf(item)), fontSize: FONT, margin: [0, 7, 0, 0] },
      { text: wrapThai(item.description), fontSize: FONT, margin: [0, 7, 0, 0] },
      { text: item.timeFrom ?? '', alignment: 'center', fontSize: FONT, margin: [0, 7, 0, 0] },
      { text: item.timeTo ?? '', alignment: 'center', fontSize: FONT, margin: [0, 7, 0, 0] },
      { text: formatPdfAmount(item.baht), alignment: 'right', fontSize: FONT, margin: [0, 7, 0, 0] },
      verifier ? ({ ...(signatureBlock(verifier, record.tlByDate, SIGN_WIDTH) as object), margin: [0, 3, 0, 0] } as TableCell) : { text: '' },
      approver ? ({ ...(signatureBlock(approver, record.diByDate, SIGN_WIDTH) as object), margin: [0, 3, 0, 0] } as TableCell) : { text: '' },
    ]);
    for (let i = 0; i < blankCount; i += 1) rows.push(WIDTHS.map(() => ({ text: '' })));

    const body: TableCell[][] = [
      [spacer({ left: true, top: true }), spanHead('Date'), spanHead('Project No. / Name'), spanHead('Description of Work'), head('Time', { colSpan: 2 }), {}, spanHead('Baht'), spanHead('Requested By (EE/TL)'), spanHead('Approved by (TL/Div. Head/DI)'), spacer({ right: true, top: true })],
      [spacer({ left: true }), {}, {}, {}, head('From'), head('To'), {}, {}, {}, spacer({ right: true })],
      ...rows.map((row) => [spacer({ left: true }), ...row, spacer({ right: true })]),
      [
        spacer({ left: true }),
        { text: 'TOTAL', bold: true, alignment: 'right', colSpan: 5, border: NO_BORDER, margin: [0, 6, 10, 0] }, {}, {}, {}, {},
        { text: formatPdfAmount(pageTotal), bold: true, alignment: 'right', fontSize: FONT, margin: [0, 7, 0, 0] },
        { text: '', colSpan: 2, border: NO_BORDER }, {},
        spacer({ right: true }),
      ],
      fullRow({
        columns: [
          { text: 'Received by :', bold: true, width: 'auto', margin: [0, 3, 4, 0] },
          underlined(''),
          { text: 'Date :', bold: true, width: 'auto', margin: [22, 3, 4, 0] },
          underlined('', 150),
        ],
        margin: [10, 24, 10, 0],
      } as Content),
      fullRow({
        columns: [
          { text: 'Note:', decoration: 'underline', fontSize: FONT, width: 36 },
          {
            width: '*',
            stack: NOTES.map((note) => ({ columns: [{ text: '-', width: 10 }, { text: note }], fontSize: FONT, margin: [0, 0, 0, 1] })),
          },
        ],
        margin: [10, 14, 10, 12],
      } as Content, true),
    ];

    const lastItemRow = 2 + rows.length;
    const itemsTable = {
      table: {
        widths: [SPACER, ...WIDTHS, SPACER],
        heights: (row: number) => (row < 2 ? 15 : row < lastItemRow ? ROW_MIN : row === lastItemRow ? 24 : 0),
        dontBreakRows: !oversize,
        body,
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length ? 1.8 : PDF_LINE),
        vLineWidth: (i: number) => (i === 0 || i === COLS ? 1.8 : PDF_LINE),
        hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? BLUE : '#000'),
        vLineColor: (i: number) => (i === 0 || i === COLS ? BLUE : '#000'),
        paddingLeft: (i: number) => (i === 0 || i === COLS - 1 ? 0 : 3),
        paddingRight: (i: number) => (i === 0 || i === COLS - 1 ? 0 : 3),
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
            { text: 'ALLOWANCE FOR WORKING AFTER 10.00 PM FORM', bold: true, fontSize: 13, alignment: 'center', margin: [0, 8, 0, 12] },
            {
              columns: [
                { text: 'Name:', width: 36, margin: [0, 3, 0, 0] },
                underlined(record.claimantName, '*', 'dotted'),
                { text: `Voucher #: ${record.voucherNo ?? ''}`, fontSize: 9, width: 'auto', margin: [14, 4, 0, 0] },
              ],
              margin: [10, 0, 10, 10],
            },
            divider,
            { columns: [{ text: 'Discipline', bold: true, width: 80, margin: [0, 1, 0, 0] }, ...DISCIPLINES.map(checkbox)], margin: [10, 8, 40, 8] },
            divider,
            { text: 'I would like to ask for your approval and sign for your request for me to work after 10.00 PM on:', fontSize: FONT, margin: [10, 9, 10, 7] },
          ],
        }]],
      },
      layout: { hLineWidth: (i: number) => (i === 0 ? 1.8 : 0), vLineWidth: () => 1.8, hLineColor: () => BLUE, vLineColor: () => BLUE, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    } as unknown as Content;

    const header = {
      stack: [
        brandHeader(logo, 'Meinhardt (Thailand) Ltd.', 'GENERAL FORM 302'),
        {
          columns: [
            { text: 'To:', width: 'auto', margin: [0, 3, 4, 0] },
            underlined('', 150, 'dotted'),
            { text: '/Accounts/File', width: 'auto', margin: [4, 3, 0, 0] },
            { text: pages.length > 1 ? `Page ${index + 1} / ${pages.length}` : '', fontSize: 9, width: '*', alignment: 'right', margin: [0, 3, 0, 0] },
          ],
          margin: [0, 6, 0, 8],
        },
      ],
      ...(index > 0 ? { pageBreak: 'before' } : {}),
    } as unknown as Content;

    return [header, topFrame, itemsTable];
  };

  return {
    info: { title: `Allowance ${record.voucherNo ?? ''}`.trim(), author: 'Meinhardt EDMS' },
    pageSize: 'A4',
    pageMargins: [34, 28, 34, 28],
    defaultStyle: { font: 'Sarabun', fontSize: 10 },
    content: pages.flatMap((chunk, index) => page(chunk, index)),
  };
}
