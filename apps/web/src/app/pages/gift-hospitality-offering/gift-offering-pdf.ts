import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { approveRow, checkbox, dottedBlock, formChrome, gap, Measure, Signer, signatureRow } from '../../shared/pdf/dotted-form';
import { PdfPeople, PdfPerson } from '../../shared/pdf/pdf-blocks';
import { formatPdfAmount, formatPdfDate, TextMeasure } from '../../shared/pdf/pdf-generator';
import { GiftOffering } from './gift-offering.service';

const FONT = 10;
/** Space before the Approved By row (the original leaves a gap above it). */
const APPROVED_GAP = 34;

/** Comments of the approver(s), one per line. */
function approverComments(record: GiftOffering): string | null {
  const first = record.approverComment?.trim();
  const second = record.approver2Comment?.trim();
  if (first && second) return `${first}\n${second}`;
  return first || second || null;
}

/** 4-ACGH-02: laid out like the paper form (see shared/pdf/dotted-form.ts for the building blocks). */
export function buildGiftOfferingPdf(record: GiftOffering, people: PdfPeople, logo: string, textMeasure: TextMeasure): TDocumentDefinitions {
  const measure: Measure = (text) => textMeasure(text, FONT);
  const personOf = (username: string | null): PdfPerson | null => (username ? people.byUsername[username] ?? { name: username, code: null } : null);
  const signer = (by: string | null, status: string | null, signedAt: string | null): Signer => ({ person: by && status === 'approved' ? personOf(by) : null, signedAt });
  const requester: PdfPerson = { name: record.requesterName, code: personOf(record.createBy)?.code ?? null };
  const submitted = !!record.voucherNo;

  const content: Content[] = [
    // Type tick boxes: box @0 / label @36, box @180 / label @216.
    {
      columns: [
        { ...(checkbox(record.requestType === 'gift') as object), width: 36 },
        { text: 'Gift', width: 144, margin: [0, 2, 0, 0] },
        { ...(checkbox(record.requestType === 'hospitality') as object), width: 36 },
        { text: 'Hospitality', width: '*', margin: [0, 2, 0, 0] },
      ],
      margin: [0, 0, 0, 6],
    } as unknown as Content,
    dottedBlock('Description of Gift/ Hospitality:', record.description, measure, { lines: 4 }),
    dottedBlock('Purpose of the Gift/ Hospitality offering:', record.purpose, measure, { lines: 4 }),
    gap(6),
    dottedBlock(`Value of Gift/ Hospitality (${record.currency}):`, formatPdfAmount(record.valueAmount), measure, { after: 5 }),
    dottedBlock('Name and Company of Receiver(s):', record.receiverNameCompany, measure, { lines: 3, after: 5 }),
    dottedBlock('Proposed Date:', formatPdfDate(record.proposedDate), measure, { width: 252, after: 8 }),
    signatureRow('Requested By :', 72, '', [{ person: submitted ? requester : null, signedAt: submitted ? record.createdAt : null }], measure),
    signatureRow('Verified By :', 72, '(ACSC)', [signer(record.verifyBy, record.verifyByStatus, record.verifyByDate)], measure),
    signatureRow('Acknowledged By :', 90, '(ACSL)', [signer(record.ack1By, record.ack1ByStatus, record.ack1ByDate)], measure),
    gap(8),
    // First Comments block: the ACSL's comment. Second block (after Approve?): the approver's comment(s).
    dottedBlock('Comments:', record.ack1Comment, measure, { lines: 3, labelWidth: 58.5 }),
    gap(4),
    approveRow(record.approverByStatus === 'approved', record.approverByStatus === 'rejected'),
    gap(4),
    dottedBlock('Comments:', approverComments(record), measure, { lines: 3, labelWidth: 58.5 }),
    gap(APPROVED_GAP),
    // Above 30,000 THB the MD and the DI sign together on the same line, separated by "/".
    signatureRow(
      'Approved By :', 72, '(MD/ DI)',
      [
        signer(record.approverBy, record.approverByStatus, record.approverByDate),
        ...(record.approver2By ? [signer(record.approver2By, record.approver2ByStatus, record.approver2ByDate)] : []),
      ],
      measure,
    ),
  ];

  return {
    info: { title: `Gift/Hospitality Offering ${record.voucherNo ?? ''}`.trim(), author: 'Meinhardt EDMS' },
    pageSize: 'A4',
    ...formChrome({
      logo,
      formNo: '4 FORM ACGH - 02',
      title: 'REQUEST FOR OFFERING OF GIFT/ HOSPITALITY',
      copies: '/ ACSL / MJR / File',
      effectiveDate: 'EFFECTIVE DATE: 01 NOVEMBER 2017',
      fileName: '4-ACGH-02_REQUEST FOR OFFERING OF GIFT HOSPITALITY.DOCX',
    }),
    content,
  };
}
