export enum RequestType {
    CHARITABLE_CONTRIBUTION = 'charitable_contribution',
    SPONSORSHIP = 'sponsorship',
}

export enum FormStatus {
    DRAFT = 'draft',
    SUBMITTED = 'submitted',
    VERIFIED = 'verified',
    ACKNOWLEDGED = 'acknowledged',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    COMPLETED = 'completed',
}

export enum ApprovalDecision {
    APPROVED = 'approved',
    REJECTED = 'rejected',
}

export interface CharitableContribution {
    id: string;
    requestType: RequestType;
    eventDescription: string;
    eventPurpose: string;
    organizerName: string;
    contributionDescription: string;
    valueAmount: number;
    currencyCode: string;
    proposedDate: string;
    vatAmount: number;
    status: FormStatus | null;

    // ACSC By fields (using code)
    acscBy?: string | null;
    acscByDate?: string | null;
    acscByStatus?: 'pending' | 'reject' | 'approve' | null;

    // ACSL By fields (using code)
    acslBy?: string | null;
    acslByDate?: string | null;
    acslByStatus?: 'pending' | 'reject' | 'approve' | null;

    // Approver By fields (using code)
    approverBy?: string | null;
    approverByDate?: string | null;
    approverByStatus?: 'pending' | 'reject' | 'approve' | null;
    approverBy2?: string | null;
    approverBy2Date?: string | null;
    approverBy2Status?: 'pending' | 'reject' | 'approve' | null;
    imsAcknowledgedBy?: string | null;
    imsAcknowledgedByDate?: string | null;
    imsAcknowledgedByStatus?: 'pending' | 'reject' | 'approve' | 'approved' | 'rejected' | null;
    workflowEmployeeNames?: Record<string, { name: string; title: string }>;

    // Legacy fields for backward compatibility
    requestedBy?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    requestedById?: string;
    requestedDate?: string;
    verifiedBy?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    verifiedById?: string;
    verifiedDate?: string;
    verifiedComments?: string;
    acknowledgedBy?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    acknowledgedById?: string;
    acknowledgedDate?: string;
    acknowledgedComments?: string;
    approvedBy?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    approvedById?: string;
    approvedDate?: string;
    approvalDecision?: ApprovalDecision;
    approvedComments?: string;
    selectedAcscId?: string;
    selectedAcslId?: string;
    selectedApproverId?: string;
    selectedApprover2Id?: string;
    approvalHistory?: Array<{
        action: string;
        userId: string;
        userName: string;
        timestamp: string;
        comments?: string;
        status: FormStatus;
    }>;

    // Audit fields
    createBy?: string;
    updateBy?: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface CreateCharitableContributionRequest {
    requested_by?: string | null;
    request_type: RequestType;
    event_description: string;
    event_purpose: string;
    organizer_name: string;
    contribution_description: string;
    value_amount: number;
    currency_code?: string;
    proposed_date: string;
    vat_amount?: number;
    acsc_by?: string | null;
    acsc_by_date?: string | null;
    acsc_by_status?: 'pending' | 'reject' | 'approve' | null;
    acsl_by?: string | null;
    acsl_by_date?: string | null;
    acsl_by_status?: 'pending' | 'reject' | 'approve' | null;
    approver_by?: string | null;
    approver_by_date?: string | null;
    approver_by_status?: 'pending' | 'reject' | 'approve' | null;
    approver_by_2?: string | null;
    approver_by_2_date?: string | null;
    approver_by_2_status?: 'pending' | 'reject' | 'approve' | null;
    ims_acknowledged_by?: string | null;
    ims_acknowledged_by_date?: string | null;
    ims_acknowledged_by_status?: 'pending' | 'reject' | 'approve' | 'approved' | 'rejected' | null;
    attachments?: string[];
}

export interface UpdateCharitableContributionRequest extends Partial<CreateCharitableContributionRequest> {}

export interface ApproveRequest {
    decision: ApprovalDecision;
    comments?: string;
}

export interface UpdateStatusDto {
    table: string;
    field: string;
    status: 'PENDING' | 'REJECT' | 'APPROVED';
}

export interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}



