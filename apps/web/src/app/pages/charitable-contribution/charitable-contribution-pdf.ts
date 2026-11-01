import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { approveRow, checkbox, dottedBlock, FONT, formChrome, gap, Measure, Signer, signatureRow } from '../../shared/pdf/dotted-form';
import { formatPdfAmount, formatPdfDate, TextMeasure } from '../../shared/pdf/pdf-generator';
import { PdfPeople, PdfPerson } from '../../shared/pdf/pdf-blocks';
import { CharitableContribution } from './charitable-contribution.service';

/** 1-ACCC-01 (REV E): laid out like the paper form (see shared/pdf/dotted-form.ts for the building blocks). */
const APPROVED_GAP = 34;

function approverComments(record: CharitableContribution): string | null {
  const first = record.approverComment?.trim();
  const second = record.approver2Comment?.trim();
  if (first && second) return `${first}\n${second}`;
  return first || second || null;
}

export function buildCharitableContributionPdf(
  record: CharitableContribution,
  people: PdfPeople,
  logo: string,
  textMeasure: TextMeasure,
): TDocumentDefinitions {
  const measure: Measure = (text) => textMeasure(text, FONT);
  const personOf = (username: string | null): PdfPerson | null => (username ? people.byUsername[username] ?? { name: username, code: null } : null);
  const signer = (by: string | null, status: string | null, signedAt: string | null): Signer => ({ person: by && status === 'approved' ? personOf(by) : null, signedAt });
  const requester: PdfPerson = { name: record.requesterName, code: personOf(record.createBy)?.code ?? null };
  const submitted = !!record.voucherNo;

  const content: Content[] = [
    // Request type tick boxes: box @0 / label @36, box @180 / label @216.
    {
      columns: [
        { ...(checkbox(record.requestType === 'charitable_contribution') as object), width: 36 },
        { text: 'Charitable Contribution', width: 144, margin: [0, 2, 0, 0] },
        { ...(checkbox(record.requestType === 'sponsorship') as object), width: 36 },
        { text: 'Sponsorship', width: '*', margin: [0, 2, 0, 0] },
      ],
      margin: [0, 0, 0, 6],
    } as unknown as Content,
    dottedBlock('Description of Event:', record.eventDescription, measure, { lines: 4 }),
    dottedBlock('Purpose of Event:', record.eventPurpose, measure, { lines: 4 }),
    gap(6),
    dottedBlock('Name of Organizer of Event or Sponsorship Receiver:', record.organizerName, measure, { labelWidth: 252 }),
    dottedBlock('Description of Charitable Contribution or Sponsorship:', record.contributionDescription, measure, { lines: 2 }),
    dottedBlock(`Value of Charitable Contribution or Sponsorship (${record.currency}):`, formatPdfAmount(record.valueAmount), measure, { after: 9 }),
    dottedBlock('Proposed Date:', formatPdfDate(record.proposedDate), measure, { width: 252, after: 4 }),
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
    info: { title: `Charitable Contribution ${record.voucherNo ?? ''}`.trim(), author: 'Meinhardt EDMS' },
    pageSize: 'A4',
    ...formChrome({
      logo,
      formNo: '1 FORM ACCC-01',
      title: 'REQUEST FOR CHARITABLE CONTRIBUTION/ SPONSORSHIP',
      copies: '/ ACSL / MJR / File',
      effectiveDate: 'EFFECTIVE DATE: 05 MAY 2022',
      fileName: '1-ACCC-01_REQUEST FOR CHARITABLE CONTRIBUTION OR SPONSORSHIP (REV_E).DOCX',
    }),
    content,
  };
}
