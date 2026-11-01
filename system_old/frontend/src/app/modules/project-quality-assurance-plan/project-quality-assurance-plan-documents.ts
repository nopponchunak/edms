export interface ProjectQualityAssurancePlanDocumentItem {
  document: string;
  detail: string;
  completionStage: string;
  required: boolean;
  responsiblePersonnel: string;
}

export const PROJECT_QUALITY_ASSURANCE_PLAN_DOCUMENTS: ProjectQualityAssurancePlanDocumentItem[] = [
  {
    document: '39 - FORM MTMT-01',
    detail: 'Task Information Delivery Plan',
    completionStage: 'Concept Stage',
    required: true,
    responsiblePersonnel: 'BM',
  },
  {
    document: '40 - FORM MTBM-01',
    detail: 'BIM Execution Plan (BEP)',
    completionStage: 'Concept Stage',
    required: false,
    responsiblePersonnel: 'BM',
  },
  {
    document: '40 - FORM MTBM-02',
    detail: 'Model Responsibility Matrix',
    completionStage: 'Concept Stage',
    required: false,
    responsiblePersonnel: 'BM',
  },
  {
    document: '40 - FORM MTBM-03',
    detail: 'Information Risks Register',
    completionStage: 'Each Stage',
    required: true,
    responsiblePersonnel: 'TL',
  },
  {
    document: '40 - FORM MTBM-04',
    detail: 'Check Data & Shared Resources',
    completionStage: 'Concept Stage',
    required: false,
    responsiblePersonnel: 'BM',
  },
  {
    document: '40 - FORM MTBM-05',
    detail: 'Lessons Learned',
    completionStage: 'Construction Stage',
    required: true,
    responsiblePersonnel: 'TL',
  },
  {
    document: '40 - FORM MTBM-06',
    detail: 'Capability and Capacity',
    completionStage: 'Concept Stage',
    required: true,
    responsiblePersonnel: 'TL',
  },
  {
    document: '40 - FORM MTBM-07',
    detail: 'Model Checklist Requirements',
    completionStage: 'Each Stage',
    required: false,
    responsiblePersonnel: 'BM',
  },
];
