/**
 * The review forms that share the Design Review engine. A new MTDD form is a new entry here (title, checklist, document
 * types, sign-off labels) plus a menu item; the table, flow and screens are shared.
 */
export interface DesignReviewFormConfig {
  code: string;
  title: string;
  voucherPrefix: string;
  documentTypes: string[];
  checklist: { id: string; question: string }[];
}

export const DESIGN_REVIEW_FORMS: Record<string, DesignReviewFormConfig> = {
  mtdd01: {
    code: 'MTDD-01',
    title: 'Concept Design Review',
    voucherPrefix: 'MTDD-01',
    documentTypes: ['Design Criteria Report', 'Design Brief Report', 'Sketches', 'Other'],
    checklist: [
      { id: '1', question: 'Has the TIDP / BEP been issued, and has the PEP / CDE been agreed?' },
      { id: '2', question: 'Are the proposed design assumptions and parameters valid?' },
      { id: '3', question: 'Has spatial coordination been completed between CSA and MEP?' },
      { id: '4', question: 'Are utility supplies available?' },
      { id: '5', question: 'Is a Topographic Survey and Soils Investigation available for the site?' },
    ],
  },
};

export const DESIGN_REVIEW_DISCIPLINES = [
  'Foundation/Substructure', 'Superstructure', 'Lighting', 'MVAC', 'Geotechnical/Site Formation', 'Façade', 'Sanitary',
  'Electrical', 'Lifts', 'Fire Protection', 'Transportation', 'Other',
];

export const DESIGN_REVIEW_FORM_TYPES = Object.keys(DESIGN_REVIEW_FORMS);
