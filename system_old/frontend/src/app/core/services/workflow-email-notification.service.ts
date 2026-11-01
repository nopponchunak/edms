import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ApiConfig } from '../config/api.config';
import { EmployeeOption, EmployeeService } from './employee.service';
import { isApproved, isPending, isRejected } from 'app/core/utils/action-request-filter.util';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';

export interface EmailNotificationPayload {
    template: 'action_request' | 'status_update';
    to: string;
    subject: string;
    data: Record<string, any>;
}

export interface WorkflowEmailStepConfig {
    actionType: string;
    byKeys: string[];
    statusKeys: string[];
    label: string;
}

export interface WorkflowEmailConfig {
    documentLabel: string;
    actionBasePath: string;
    viewPath: (id: string) => string;
    idKeys?: string[];
    documentNumberKeys?: string[];
    documentSubjectKeys?: string[];
    projectNumberKeys?: string[];
    prefixIdInDocumentName?: boolean;
    includeProjectNumberInDocumentName?: boolean;
    appendSubjectToDocumentName?: boolean;
    fallbackRequestDateToNow?: boolean;
    requesterKeys: string[];
    requestDateKeys: string[];
    steps: WorkflowEmailStepConfig[];
}

interface WorkflowEmailStep {
    actionType: string;
    code: string | null;
    status: string | null;
    label: string;
}

interface WorkflowEmailContext {
    id: string | null;
    documentNumber: string | null;
    documentSubject: string | null;
    projectNumber: string | null;
    requester: string | null;
    requesterName: string | null;
    requestDate: string | Date | null;
    steps: WorkflowEmailStep[];
}

interface NotificationRecipient {
    code: string;
    name: string;
    email: string;
}

export const PURCHASE_ORDER_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Purchase Order',
    actionBasePath: '/purchase-order/action',
    viewPath: (id: string) => `/purchase-order/${encodeURIComponent(id)}`,
    idKeys: ['id', 'purchase_order_id'],
    documentNumberKeys: ['poNo', 'po_no'],
    documentSubjectKeys: ['subject', 'documentSubject', 'document_subject'],
    requesterKeys: ['purchaseRequestBy', 'purchase_request_by', 'createdBy', 'create_by', 'created_by'],
    requestDateKeys: ['requisitionDate', 'requisition_date', 'purchaseRequestDate', 'purchase_request_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'verified_by_status',
            byKeys: ['verifiedBy', 'verified_by'],
            statusKeys: ['verifiedByStatus', 'verified_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'circ_status',
            byKeys: ['circ', 'circ_by'],
            statusKeys: ['circStatus', 'circ_status', 'circ_by_status'],
            label: 'Circ'
        },
        {
            actionType: 'signed_by_status',
            byKeys: ['signedBy', 'signed_by'],
            statusKeys: ['signedByStatus', 'signed_by_status'],
            label: 'Sign'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const SUPPLIER_ASSESSMENT_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Supplier Assessment',
    actionBasePath: '/supplier-assessment/action',
    viewPath: (id: string) => `/supplier-assessment/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'supplier_assessment_id'],
    requesterKeys: ['assessedBy', 'assessed_by', 'createdBy', 'create_by', 'created_by'],
    requestDateKeys: ['assessedDate', 'assessed_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const SUPPLIER_EVALUATION_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Supplier Evaluation',
    actionBasePath: '/supplier-evaluation/action',
    viewPath: (id: string) => `/supplier-evaluation/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'supplier_evaluation_id'],
    requesterKeys: ['evaluatedBy', 'evaluated_by', 'createdBy', 'create_by', 'created_by'],
    requestDateKeys: ['evaluatedDate', 'evaluated_date', 'evaluatedByDate', 'evaluated_by_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const SINGLE_SOURCE_JUSTIFICATION_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Single Source Justification',
    actionBasePath: '/single-source-justification/action',
    viewPath: (id: string) => `/single-source-justification/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'single_source_justification_id'],
    requesterKeys: ['assessedBy', 'assessed_by', 'requestBy', 'request_by', 'requestedBy', 'requested_by', 'createdBy', 'create_by', 'created_by'],
    requestDateKeys: ['createdAt', 'created_at', 'assessedByDate', 'assessed_by_date', 'updatedAt', 'updated_at'],
    steps: [
        {
            actionType: 'verify_by_status',
            byKeys: ['verifyBy', 'verify_by', 'verifiedBy', 'verified_by'],
            statusKeys: ['verifyByStatus', 'verify_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const CAR_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'CAR',
    actionBasePath: '/cars/action',
    viewPath: (id: string) => `/cars/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'car_id'],
    requesterKeys: ['carIssuedBy', 'car_issued_by', 'createdBy', 'create_by', 'created_by'],
    requestDateKeys: ['requestDate', 'request_date', 'createdAt', 'created_at', 'date'],
    steps: [
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Initial Approve'
        },
        {
            actionType: 'completed_by_status',
            byKeys: ['completedBy', 'completed_by'],
            statusKeys: ['completedByStatus', 'completed_by_status'],
            label: 'Complete'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        },
        {
            actionType: 'verified_by_status',
            byKeys: ['verifiedBy', 'verified_by'],
            statusKeys: ['verifiedByStatus', 'verified_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'approved_by_status_2',
            byKeys: ['approvedBy2', 'approved_by_2', 'approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus2', 'approved_by_status_2', 'approve_by_status_2'],
            label: 'Final Approve'
        }
    ]
};

export const CHARITABLE_CONTRIBUTION_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Charitable Contribution',
    actionBasePath: '/charitable-contributions/action',
    viewPath: (id: string) => `/charitable-contributions/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'charitable_contribution_id'],
    requesterKeys: ['createBy', 'create_by', 'createdBy', 'created_by', 'requestedBy', 'requested_by'],
    requestDateKeys: ['requestedDate', 'requested_date', 'proposedDate', 'proposed_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'acsc_by_status',
            byKeys: ['acscBy', 'acsc_by'],
            statusKeys: ['acscByStatus', 'acsc_by_status'],
            label: 'ACSC'
        },
        {
            actionType: 'ims_acknowledged_by_status',
            byKeys: ['imsAcknowledgedBy', 'ims_acknowledged_by'],
            statusKeys: ['imsAcknowledgedByStatus', 'ims_acknowledged_by_status'],
            label: 'ACSL Acknowledge'
        },
        {
            actionType: 'approver_by_status',
            byKeys: ['approverBy', 'approver_by'],
            statusKeys: ['approverByStatus', 'approver_by_status'],
            label: 'Approve (DI/MD)'
        },
        {
            actionType: 'approver_by_2_status',
            byKeys: ['approverBy2', 'approver_by_2'],
            statusKeys: ['approverBy2Status', 'approver_by_2_status'],
            label: 'Approve 2 (DI)'
        },
        {
            actionType: 'acsl_by_status',
            byKeys: ['acslBy', 'acsl_by'],
            statusKeys: ['acslByStatus', 'acsl_by_status'],
            label: 'Acknowledge 2 (CA - JN)'
        }
    ]
};

export const GIFT_HOSPITALITY_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Gift Hospitality',
    actionBasePath: '/gift-hospitality/action',
    viewPath: (id: string) => `/gift-hospitality/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'gift_hospitality_id'],
    requesterKeys: ['createBy', 'create_by', 'createdBy', 'created_by', 'requestedBy', 'requested_by'],
    requestDateKeys: ['requestedDate', 'requested_date', 'proposedDate', 'proposed_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'verified_by_status',
            byKeys: ['verifiedBy', 'verified_by'],
            statusKeys: ['verifiedByStatus', 'verified_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'ims_acknowledged_by_status',
            byKeys: ['imsAcknowledgedBy', 'ims_acknowledged_by'],
            statusKeys: ['imsAcknowledgedByStatus', 'ims_acknowledged_by_status'],
            label: 'ACSL Acknowledge'
        },
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Accounts (CA)'
        }
    ]
};

export const GIFT_HOSPITALITY_OFFERING_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Gift Hospitality Offering',
    actionBasePath: '/gift-hospitality-offering/action',
    viewPath: (id: string) => `/gift-hospitality-offering/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'gift_hospitality_offering_id'],
    requesterKeys: ['createBy', 'create_by', 'createdBy', 'created_by', 'requestedBy', 'requested_by'],
    requestDateKeys: ['requestedDate', 'requested_date', 'proposedDate', 'proposed_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'verified_by_status',
            byKeys: ['verifiedBy', 'verified_by'],
            statusKeys: ['verifiedByStatus', 'verified_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'ims_acknowledged_by_status',
            byKeys: ['imsAcknowledgedBy', 'ims_acknowledged_by'],
            statusKeys: ['imsAcknowledgedByStatus', 'ims_acknowledged_by_status'],
            label: 'ACSL Acknowledge'
        },
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'approved_by_2_status',
            byKeys: ['approvedBy2', 'approved_by_2'],
            statusKeys: ['approvedBy2Status', 'approved_by_2_status'],
            label: 'Approve 2'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Accounts (CA)'
        }
    ]
};

export const CONTROLLED_DOCUMENT_REQUEST_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Controlled Document Request',
    actionBasePath: '/controlled-document-request/action',
    viewPath: (id: string) => `/controlled-document-request/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'controlled_document_request_id'],
    documentNumberKeys: ['cdrNo', 'cdr_no'],
    documentSubjectKeys: ['documentName', 'document_name'],
    appendSubjectToDocumentName: true,
    requesterKeys: ['requestedBy', 'requested_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['requestedDate', 'requested_date', 'date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'reviewed_by_status',
            byKeys: ['reviewedBy', 'reviewed_by'],
            statusKeys: ['reviewedByStatus', 'reviewed_by_status'],
            label: 'Review'
        },
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status_2',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus2', 'acknowledged_by_status_2'],
            label: 'Final Action'
        }
    ]
};

export const SUB_CONSULTANT_ASSESSMENT_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Sub Consultant Assessment',
    actionBasePath: '/sub-consultant-assessment/action',
    viewPath: (id: string) => `/sub-consultant-assessment/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'sub_consultant_assessment_id'],
    requesterKeys: ['assessedBy', 'assessed_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['assessedDate', 'assessed_date', 'assessedByDate', 'assessed_by_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const SUB_CONSULTANT_EVALUATION_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Sub Consultant Evaluation',
    actionBasePath: '/sub-consultant-evaluation/action',
    viewPath: (id: string) => `/sub-consultant-evaluation/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'sub_consultant_evaluation_id'],
    requesterKeys: ['evaluatedBy', 'evaluated_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['evaluatedDate', 'evaluated_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const EXPENSES_CLAIM_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Expenses Claim',
    actionBasePath: '/expenses-claim/action',
    viewPath: (id: string) => `/expenses-claim/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'expenses_claim_id'],
    requesterKeys: ['reciveBy', 'recive_by', 'claimantName', 'claimant_name', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['claimDate', 'claim_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'verified_by_status',
            byKeys: ['verifiedBy', 'verified_by'],
            statusKeys: ['verifiedByStatus', 'verified_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'approved_by_status',
            byKeys: ['approvedBy', 'approved_by'],
            statusKeys: ['approvedByStatus', 'approved_by_status'],
            label: 'Approve'
        }
    ]
};

export const ALLOWANCE_AFTER_10PM_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Allowance After 10pm',
    actionBasePath: '/allowance-after-10pm/action',
    viewPath: (id: string) => `/allowance-after-10pm/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'allowance_after_10pm_id'],
    requesterKeys: ['claimantName', 'claimant_name', 'notifiedUser', 'notified_user', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['requestDate', 'request_date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'tl_by_status',
            byKeys: ['tlBy', 'tl_by'],
            statusKeys: ['tlByStatus', 'tl_by_status'],
            label: 'Verify'
        },
        {
            actionType: 'di_by_status',
            byKeys: ['diBy', 'di_by'],
            statusKeys: ['diByStatus', 'di_by_status'],
            label: 'Approve'
        }
    ]
};

export const ENGINEERING_AUDIT_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Engineering Audit Review',
    actionBasePath: '/engineering-audit-review/action',
    viewPath: (id: string) => `/engineering-audit-review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'engineering_audit_review_id'],
    requesterKeys: ['preparedBy', 'prepared_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'reviewed_by_status',
            byKeys: ['reviewedBy', 'reviewed_by'],
            statusKeys: ['reviewedByStatus', 'reviewed_by_status'],
            label: 'Review'
        },
        {
            actionType: 'responded_by_status',
            byKeys: ['respondedBy', 'responded_by'],
            statusKeys: ['respondedByStatus', 'responded_by_status'],
            label: 'Response'
        },
        {
            actionType: 'signed_by_status',
            byKeys: ['signedBy', 'signed_by'],
            statusKeys: ['signedByStatus', 'signed_by_status'],
            label: 'Verify Actions'
        },
        {
            actionType: 'client_project_manager_signed_by_status',
            byKeys: ['clientProjectManagerSignedBy', 'client_project_manager_signed_by'],
            statusKeys: ['clientProjectManagerSignedByStatus', 'client_project_manager_signed_by_status'],
            label: 'Verify Feedback'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const VALUE_ENGINEERING_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Value Engineering Review',
    actionBasePath: '/value-engineering/action',
    viewPath: (id: string) => `/value-engineering/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'value_engineering_review_id'],
    requesterKeys: ['preparedBy', 'prepared_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'reviewed_by_status',
            byKeys: ['reviewedBy', 'reviewed_by'],
            statusKeys: ['reviewedByStatus', 'reviewed_by_status'],
            label: 'Review'
        },
        {
            actionType: 'responded_by_status',
            byKeys: ['respondedBy', 'responded_by'],
            statusKeys: ['respondedByStatus', 'responded_by_status'],
            label: 'Response'
        },
        {
            actionType: 'signed_by_status',
            byKeys: ['signedBy', 'signed_by'],
            statusKeys: ['signedByStatus', 'signed_by_status'],
            label: 'Sign'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const LEED_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'LEED Review',
    actionBasePath: '/leed-review/action',
    viewPath: (id: string) => `/leed-review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'leed_review_id'],
    requesterKeys: ['preparedBy', 'prepared_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['date', 'createdAt', 'created_at'],
    steps: [
        {
            actionType: 'reviewed_by_status',
            byKeys: ['reviewedBy', 'reviewed_by'],
            statusKeys: ['reviewedByStatus', 'reviewed_by_status'],
            label: 'Review'
        },
        {
            actionType: 'responded_by_status',
            byKeys: ['respondedBy', 'responded_by'],
            statusKeys: ['respondedByStatus', 'responded_by_status'],
            label: 'Response'
        },
        {
            actionType: 'signed_by_status',
            byKeys: ['signedBy', 'signed_by'],
            statusKeys: ['signedByStatus', 'signed_by_status'],
            label: 'Sign'
        },
        {
            actionType: 'signed_by_tl_status',
            byKeys: ['signedByTL', 'signed_by_tl'],
            statusKeys: ['signedByTLStatus', 'signed_by_tl_status'],
            label: 'TL Sign'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Concept Design Review',
    actionBasePath: '/concept-design-review/action',
    viewPath: (id: string) => `/concept-design-review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'concept_design_review_id'],
    projectNumberKeys: ['projectNumber', 'project_number', 'project_no'],
    prefixIdInDocumentName: true,
    includeProjectNumberInDocumentName: true,
    fallbackRequestDateToNow: true,
    requesterKeys: ['preparedBy', 'prepared_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['createdAt', 'created_at', 'createdDate', 'created_date', 'date'],
    steps: [
        {
            actionType: 'reviewed_by_status',
            byKeys: ['reviewedBy', 'reviewed_by'],
            statusKeys: ['reviewedByStatus', 'reviewed_by_status'],
            label: 'Approved By Reviewer'
        },
        {
            actionType: 'responded_by_status',
            byKeys: ['respondedBy', 'responded_by'],
            statusKeys: ['respondedByStatus', 'responded_by_status'],
            label: 'Response'
        },
        {
            actionType: 'signed_by_tl_status',
            byKeys: ['signedByTL', 'signed_by_tl', 'signed_by_t_l'],
            statusKeys: ['signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'],
            label: 'Approved By Reviewer'
        },
        {
            actionType: 'signed_by_tl2_status',
            byKeys: ['signedByTL2', 'signed_by_tl2', 'signed_by_t_l2'],
            statusKeys: ['signedByTL2Status', 'signed_by_tl2_status', 'signed_by_t_l2_status'],
            label: 'Approved by TL'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status'],
            label: 'Acknowledge'
        }
    ]
};

export const SCHEMATIC_DESIGN_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    ...CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG,
    documentLabel: 'Schematic Design Review',
    actionBasePath: '/schematic-design-review/action',
    viewPath: (id: string) => `/schematic-design-review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'schematic_design_review_id'],
};

export const SUBMISSION_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    ...CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG,
    documentLabel: 'Submission Review',
    actionBasePath: '/submission-review/action',
    viewPath: (id: string) => `/submission-review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'submission_review_id'],
};


export const TENDER_CSA_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    ...CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG,
    documentLabel: 'Tender Review CSA',
    actionBasePath: '/tender/csa/review/action',
    viewPath: (id: string) => `/tender/csa/review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'tender_csa_review_id'],
};

export const TENDER_CSA_VERIFICATION_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Tender Verification CSA',
    actionBasePath: '/tender/csa/verification/action',
    viewPath: (id: string) => `/tender/csa/verification/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'tender_csa_verification_id'],
    projectNumberKeys: ['projectNumber', 'project_number', 'project_no'],
    prefixIdInDocumentName: true,
    includeProjectNumberInDocumentName: true,
    fallbackRequestDateToNow: true,
    requesterKeys: ['preparedBy', 'prepared_by', 'createBy', 'create_by', 'createdBy', 'created_by'],
    requestDateKeys: ['requestDate', 'request_date', 'createdAt', 'created_at', 'createdDate', 'created_date', 'date'],
    steps: [
        {
            actionType: 'assignment_step',
            byKeys: ['signedByVVE', 'signed_by_vve', 'signed_by_v_v_e'],
            statusKeys: ['reviewerForAction', 'reviewer_for_action'],
            label: 'VVE'
        },
        {
            actionType: 'reviewed_by_status',
            byKeys: ['reviewerForAction', 'reviewer_for_action', 'reviewedBy', 'reviewed_by'],
            statusKeys: ['reviewedByStatus', 'reviewed_by_status', 'reviewed_by_tl_status', 'reviewed_by_t_l_status'],
            label: 'Approved By Reviewer'
        },
        {
            actionType: 'responded_by_status',
            byKeys: ['preparedBy', 'prepared_by', 'respondedBy', 'responded_by'],
            statusKeys: ['respondedByStatus', 'responded_by_status'],
            label: 'Response'
        },
        {
            actionType: 'signed_by_vve_status',
            byKeys: ['reviewerForAction', 'reviewer_for_action', 'reviewedBy', 'reviewed_by', 'reviewed_by_tl', 'reviewed_by_t_l'],
            statusKeys: ['signedByVVEStatus', 'signed_by_vve_status', 'signed_by_v_v_e_status'],
            label: 'Approved By Reviewer'
        },
        {
            actionType: 'signed_by_tl_status',
            byKeys: ['teamLeadForAction', 'team_lead_for_action', 'signedByTL', 'signed_by_tl', 'signed_by_t_l'],
            statusKeys: ['signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'],
            label: 'Approved By TL'
        },
        {
            actionType: 'acknowledged_by_status',
            byKeys: ['directorForAction', 'director_for_action', 'acknowledgedBy', 'acknowledged_by'],
            statusKeys: ['acknowledgedByStatus', 'acknowledged_by_status', 'acknowledged_by_d_i_status'],
            label: 'Acknowledge'
        }
    ]
};

export const TENDER_MEP_REVIEW_EMAIL_CONFIG: WorkflowEmailConfig = {
    ...CONCEPT_DESIGN_REVIEW_EMAIL_CONFIG,
    documentLabel: 'Tender Review MEP',
    actionBasePath: '/tender/mep/review/action',
    viewPath: (id: string) => `/tender/mep/review/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'tender_mep_review_id'],
};

export const TENDER_MEP_VERIFICATION_EMAIL_CONFIG: WorkflowEmailConfig = {
    ...TENDER_CSA_VERIFICATION_EMAIL_CONFIG,
    documentLabel: 'Tender Verification MEP',
    actionBasePath: '/tender/mep/verification/action',
    viewPath: (id: string) => `/tender/mep/verification/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'tender_mep_verification_id'],
};

export const CONSTRUCTION_VALIDATION_EMAIL_CONFIG: WorkflowEmailConfig = {
    documentLabel: 'Construction Validation',
    requesterKeys: ['preparedBy', 'prepared_by'],
    requestDateKeys: ['createdAt', 'created_at'],
    actionBasePath: '/construction-validation/action',
    viewPath: (id: string) => `/construction-validation/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'construction_validation_id'],
    steps: [
        {
            actionType: 'completed_by_status',
            byKeys: ['completedBy', 'completed_by'],
            statusKeys: ['completedByStatus', 'completed_by_status'],
            label: 'Completed By'
        },
        {
            actionType: 'responded_by_status',
            byKeys: ['respondedBy', 'responded_by'],
            statusKeys: ['respondedByStatus', 'responded_by_status'],
            label: 'Responded By'
        },
        {
            actionType: 'signed_by_tl_status',
            byKeys: ['signedByTL', 'signed_by_tl', 'signed_by_t_l'],
            statusKeys: ['signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'],
            label: 'Approved By Reviewer'
        },
        {
            actionType: 'acknowledged_by_tl_status',
            byKeys: ['acknowledgedByTL', 'acknowledged_by_tl', 'acknowledged_by_t_l'],
            statusKeys: ['acknowledgedByTLStatus', 'acknowledged_by_tl_status', 'acknowledged_by_t_l_status'],
            label: 'Approved by TL'
        },
        {
            actionType: 'acknowledged_by_di_status',
            byKeys: ['acknowledgedByDI', 'acknowledged_by_di', 'acknowledged_by_d_i'],
            statusKeys: ['acknowledgedByDIStatus', 'acknowledged_by_di_status', 'acknowledged_by_d_i_status'],
            label: 'Acknowledged By'
        }
    ]
};

const createFeeSheetEmailConfig = (
    documentLabel: string,
    basePath: string
): WorkflowEmailConfig => ({
    documentLabel,
    actionBasePath: `${basePath}/action`,
    viewPath: (id: string) => `${basePath}/view/${encodeURIComponent(id)}`,
    idKeys: ['id', 'fee_sheet_id', 'feeSheetId'],
    projectNumberKeys: ['mt_project_no', 'mtProjectNo', 'project_no', 'projectNo'],
    includeProjectNumberInDocumentName: true,
    requesterKeys: ['form_filled_by_id', 'formFilledBy', 'filledInBy', 'created_by', 'create_by'],
    requestDateKeys: ['form_filled_by_date', 'formFilledByDate', 'filledInDate', 'created_at', 'createdAt'],
    steps: [
        {
            actionType: 'approved_by_ch_status',
            byKeys: ['approved_by_ch_id', 'approvedByCh', 'approvedBy', 'approved_by_ch'],
            statusKeys: ['approved_by_ch_status', 'approvedByChStatus'],
            label: 'Approved by CH'
        }
    ]
});

export const PROJECT_FEE_SHEET_EMAIL_CONFIG: WorkflowEmailConfig = createFeeSheetEmailConfig(
    'Project Fee Sheet',
    '/project-fee-sheet'
);

export const PROJECT_FACADE_FEE_SHEET_EMAIL_CONFIG: WorkflowEmailConfig = createFeeSheetEmailConfig(
    'Project Facade Fee Sheet',
    '/project-facade-fee-sheet'
);

export const PROJECT_TRANSPORTATION_FEE_SHEET_EMAIL_CONFIG: WorkflowEmailConfig = createFeeSheetEmailConfig(
    'Project Transportation Fee Sheet',
    '/project-transportation-fee-sheet'
);

@Injectable({
    providedIn: 'root'
})
export class WorkflowEmailNotificationService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig,
        private employeeService: EmployeeService
    ) {}

    notifyInitialAction(config: WorkflowEmailConfig, source: any, id?: string | number | null): Observable<any> {
        const context = this.normalizeContext(config, source, id);
        const nextStep = this.findNextPendingStep(context);

        if (!nextStep) {
            return of({ status: 'skipped', reason: 'no_pending_step' });
        }

        return this.sendActionRequest(config, context, nextStep);
    }

    resendCurrentPendingAction(config: WorkflowEmailConfig, source: any, id?: string | number | null): Observable<any> {
        const context = this.normalizeContext(config, source, id);
        const nextStep = this.findNextPendingStep(context);

        if (!nextStep) {
            return of({ status: 'skipped', reason: 'no_pending_step' });
        }

        return this.sendActionRequest(config, context, nextStep);
    }

    sendEditRequest(
        config: WorkflowEmailConfig,
        source: any,
        id: string | number | null | undefined,
        recipientRef: string | number | null | undefined,
        editPath: string,
        requestedByRef?: string | number | null
    ): Observable<any> {
        const context = this.normalizeContext(config, source, id);
        const recipientCode = this.toNullableString(recipientRef);

        if (!context.id || !recipientCode) {
            return of({ status: 'skipped', reason: 'missing_edit_recipient' });
        }

        return forkJoin({
            recipient: this.resolveRecipient(recipientCode),
            requestedBy: requestedByRef ? this.resolveRecipient(String(requestedByRef)) : of(null)
        }).pipe(
            switchMap(({ recipient, requestedBy }) => {
                if (!recipient.email) {
                    return of({ status: 'skipped', reason: 'missing_edit_recipient_email', recipient: recipientCode });
                }

                const payload: EmailNotificationPayload = {
                    template: 'action_request',
                    to: recipient.email,
                    subject: `[Edit Required] ${this.getDocumentName(config, context)}`,
                    data: {
                        approver_name: recipient.name,
                        document_name: this.getDocumentName(config, context),
                        document_subject: 'Edit required before initial approval',
                        status: 'Edit Required',
                        requested_by: requestedBy?.name || requestedByRef || '-',
                        request_date: formatDateDisplay(new Date()),
                        link: this.buildAppLink(editPath)
                    }
                };

                return this.sendEmailNotification(payload);
            })
        );
    }

    notifyAfterAction(
        config: WorkflowEmailConfig,
        source: any,
        actionType: string,
        status: string,
        id?: string | number | null
    ): Observable<any> {
        const context = this.normalizeContext(config, source, id);
        this.applyActionStatus(context, actionType, status);

        if (isRejected(status)) {
            return this.sendStatusUpdate(config, context, 'Rejected', `Rejected at ${this.getActionLabel(config, actionType)}`);
        }

        if (status === 'returned' || status === 'returned_for_correction') {
            const nextStep = this.findNextPendingStep(context);

            if (nextStep) {
                // Only send action request (loop back) to the person who needs to fix it
                return this.sendActionRequest(config, context, nextStep);
            }

            // Fallback to status update if no next step is found (should not happen in typical return flow)
            return this.sendStatusUpdate(config, context, 'Returned' as any, `Returned for correction at ${this.getActionLabel(config, actionType)}`);
        }

        if (!isApproved(status)) {
            return of({ status: 'skipped', reason: 'status_not_approved' });
        }

        const nextStep = this.findNextPendingStep(context);
        if (nextStep) {
            return this.sendActionRequest(config, context, nextStep);
        }

        return this.sendStatusUpdate(config, context, 'Completed', `${this.getActionLabel(config, actionType)} approved`);
    }

    createNotificationSource(payload: Record<string, any>, response: any): Record<string, any> {
        const data = this.unwrapResponseData(response);
        return {
            ...payload,
            ...(data && typeof data === 'object' ? data : {})
        };
    }

    readResponseId(response: any): string | null {
        return this.toNullableString(this.unwrapResponseData(response)?.id ?? response?.id ?? null);
    }

    private sendActionRequest(config: WorkflowEmailConfig, context: WorkflowEmailContext, step: WorkflowEmailStep): Observable<any> {
        if (!context.id || !step.code) {
            return of({ status: 'skipped', reason: 'missing_action_recipient' });
        }

        return forkJoin({
            recipient: this.resolveRecipient(step.code),
            requester: context.requester ? this.resolveRecipient(context.requester) : of(null)
        }).pipe(
            switchMap(({ recipient, requester }) => {
                if (!recipient.email) {
                    return of({ status: 'skipped', reason: 'missing_action_email', recipient: step.code });
                }

                const payload: EmailNotificationPayload = {
                    template: 'action_request',
                    to: recipient.email,
                    subject: `[Action Required] ${this.getDocumentName(config, context)}`,
                    data: {
                        approver_name: recipient.name,
                        document_name: this.getDocumentName(config, context),
                        ...(context.documentSubject && !config.appendSubjectToDocumentName ? { document_subject: context.documentSubject } : {}),
                        status: this.getActionRequestStatus(step),
                        requested_by: context.requesterName || requester?.name || context.requester || '-',
                        request_date: formatDateDisplay(context.requestDate),
                        link: this.getActionLink(config, context.id, step.actionType)
                    }
                };

                return this.sendEmailNotification(payload);
            })
        );
    }

    private sendStatusUpdate(
        config: WorkflowEmailConfig,
        context: WorkflowEmailContext,
        status: 'Completed' | 'Rejected' | 'Returned',
        remarks: string
    ): Observable<any> {
        if (!context.id || !context.requester) {
            return of({ status: 'skipped', reason: 'missing_requester' });
        }

        return this.resolveRecipient(context.requester).pipe(
            switchMap((recipient) => {
                if (!recipient.email) {
                    return of({ status: 'skipped', reason: 'missing_requester_email', recipient: context.requester });
                }

                const payload: EmailNotificationPayload = {
                    template: 'status_update',
                    to: recipient.email,
                    subject: `[Status Update] ${this.getDocumentName(config, context)} ${status}`,
                    data: {
                        requester_name: context.requesterName || recipient.name,
                        document_name: this.getDocumentName(config, context),
                        ...(context.documentSubject && !config.appendSubjectToDocumentName ? { document_subject: context.documentSubject } : {}),
                        status,
                        date: config.fallbackRequestDateToNow
                            ? formatDateDisplay(context.requestDate)
                            : formatDateTimeDisplay(new Date()),
                        remarks,
                        link: this.getViewLink(config, context.id)
                    }
                };

                return this.sendEmailNotification(payload);
            })
        );
    }

    private sendEmailNotification(payload: EmailNotificationPayload): Observable<any> {
        return this.http.post<any>(this.apiConfig.buildUrl('api/notifications/send-email'), payload);
    }

    private findNextPendingStep(context: WorkflowEmailContext): WorkflowEmailStep | null {
        for (const step of context.steps) {
            if (!this.hasStepAssignee(step.code)) {
                continue;
            }

            if (isRejected(step.status)) {
                return null;
            }

            if (isApproved(step.status)) {
                continue;
            }

            if (step.actionType === 'assignment_step' && step.status) {
                // If assignment_step has a status (which is the reviewer code in this case), it is considered done
                continue;
            }

            if (isPending(step.status)) {
                return step;
            }
        }

        return null;
    }

    private normalizeContext(config: WorkflowEmailConfig, source: any, id?: string | number | null): WorkflowEmailContext {
        const data = this.normalizeSource(config, source);
        const requestDate = this.readValue(data, config.requestDateKeys) as string | Date | null;

        return {
            id: this.readString(data, config.idKeys ?? ['id']) ?? this.toNullableString(id),
            documentNumber: this.readString(data, config.documentNumberKeys ?? []),
            documentSubject: this.readString(data, config.documentSubjectKeys ?? []),
            projectNumber: this.readString(data, config.projectNumberKeys ?? []),
            requester: this.readString(data, config.requesterKeys),
            requesterName: this.readString(data, ['requesterName', 'requester_name', 'requestedByName', 'requested_by_name', 'createByName', 'createdByName', 'created_by_name']),
            requestDate: requestDate ?? (config.fallbackRequestDateToNow ? new Date() : null),
            steps: config.steps.map((step) => ({
                actionType: step.actionType,
                code: this.readString(data, step.byKeys),
                status: this.readString(data, step.statusKeys),
                label: step.label
            }))
        };
    }

    private normalizeSource(config: WorkflowEmailConfig, source: any): any {
        if (!source || typeof source !== 'object') {
            return source;
        }

        const directKeys = [
            ...(config.idKeys ?? ['id']),
            ...(config.documentNumberKeys ?? []),
            ...(config.documentSubjectKeys ?? []),
            ...(config.projectNumberKeys ?? []),
            ...config.requesterKeys,
            ...config.requestDateKeys,
            ...config.steps.flatMap((step) => [...step.byKeys, ...step.statusKeys])
        ];

        const hasDirectWorkflowValue = directKeys.some((key) => this.hasNonEmptyValue(source[key]));
        if (!hasDirectWorkflowValue && source.data && typeof source.data === 'object' && !Array.isArray(source.data)) {
            return source.data;
        }

        return source;
    }

    private applyActionStatus(context: WorkflowEmailContext, actionType: string, status: string): void {
        const step = context.steps.find((item) => item.actionType === actionType);
        if (step) {
            step.status = status;
        }
    }

    private resolveRecipient(ref: string): Observable<NotificationRecipient> {
        return this.employeeService.getEmployeeOptionByReference(ref).pipe(
            map((option) => ({
                code: ref,
                name: this.getEmployeeName(option, ref),
                email: option?.email?.trim() || ''
            }))
        );
    }

    private getEmployeeName(option: EmployeeOption | null, fallback: string): string {
        return option?.displayLabel?.trim()
            || option?.name?.trim()
            || [option?.firstName, option?.lastName].filter(Boolean).join(' ').trim()
            || fallback;
    }

    private getDocumentName(config: WorkflowEmailConfig, context: WorkflowEmailContext): string {
        const parts: string[] = [];
        const displayId = context.documentNumber || context.id;

        if (displayId && config.prefixIdInDocumentName) {
            parts.push(`#${displayId}`);
        }

        parts.push(config.documentLabel);

        if (displayId && !config.prefixIdInDocumentName) {
            parts.push(`#${displayId}`);
        }

        if (context.projectNumber && config.includeProjectNumberInDocumentName) {
            parts.push(context.projectNumber);
        }

        const baseName = parts.join(' ');
        return config.appendSubjectToDocumentName && context.documentSubject
            ? `${baseName} : ${context.documentSubject}`
            : baseName;
    }

    private getActionLabel(config: WorkflowEmailConfig, actionType: string): string {
        return config.steps.find((step) => step.actionType === actionType)?.label || 'Action';
    }

    private getActionRequestStatus(step: WorkflowEmailStep): string {
        return step.label;
    }

    private getActionLink(config: WorkflowEmailConfig, id: string, actionType: string): string {
        return this.buildAppLink(`${config.actionBasePath}/${encodeURIComponent(id)}/${actionType}`);
    }

    private getViewLink(config: WorkflowEmailConfig, id: string): string {
        return this.buildAppLink(config.viewPath(id));
    }

    private buildAppLink(path: string): string {
        const origin = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://edms.meinhardt.net';

        return `${origin}${path}`;
    }

    private unwrapResponseData(response: any): any {
        return response?.data && typeof response.data === 'object' && !Array.isArray(response.data)
            ? response.data
            : response;
    }

    private hasStepAssignee(code: string | null | undefined): boolean {
        return code !== null && code !== undefined && String(code).trim() !== '';
    }

    private readString(source: any, keys: string[]): string | null {
        const value = this.readValue(source, keys);
        return this.toNullableString(value);
    }

    private readValue(source: any, keys: string[]): unknown {
        if (!source) {
            return null;
        }

        for (const key of keys) {
            const value = source[key];
            if (this.hasNonEmptyValue(value)) {
                return value;
            }
        }

        return null;
    }

    private hasNonEmptyValue(value: unknown): boolean {
        if (value === null || value === undefined) {
            return false;
        }

        if (typeof value === 'string') {
            return value.trim() !== '';
        }

        return true;
    }

    private toNullableString(value: unknown): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'object') {
            const obj = value as any;
            const objectValue = obj.code ?? obj.id ?? obj.employeeCode ?? obj.employee_code ?? obj.email ?? null;
            if (objectValue !== null && objectValue !== undefined) {
                return this.toNullableString(objectValue);
            }

            return null;
        }

        const stringValue = String(value).trim();
        return stringValue || null;
    }
}
