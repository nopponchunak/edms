export enum CarSeverity {
    MINOR = 'minor',
    MAJOR = 'major',
}

export enum CarSource {
    INTERNAL_IMS_AUDIT = 'internal_ims_audit',
    EXTERNAL_IMS_AUDIT = 'external_ims_audit',
    MANAGEMENT_REVIEW = 'management_review',
    NON_CONFORMITY = 'non_conformity',
    CLIENT_EXTERNAL_COMPLAINT = 'client_external_complaint',
    INCIDENT_REPORTING_INVESTIGATION = 'incident_reporting_investigation',
    OTHERS = 'others',
}

export enum NonConformityType {
    NOT_CONFORM_CLIENT_REQUIREMENTS = 'not_conform_client_requirements',
    VE_REQUESTED_MTL_DESIGN = 've_requested_mtl_design',
    ERROR_IN_DESIGN = 'error_in_design',
    NOT_COMPLY_LAW_REGULATIONS = 'not_comply_law_regulations',
    ENVIRONMENTAL_ISSUE = 'environmental_issue',
    HEALTH_SAFETY_ISSUE = 'health_safety_issue',
    NOT_FOLLOW_PROCEDURES = 'not_follow_procedures',
    OBJECTIVES_NOT_MET = 'objectives_not_met',
    OTHER_ISSUES = 'other_issues',
}

export enum CarStatus {
    DRAFT = 'draft',
    ISSUED = 'issued',
    DISPOSITION_COMPLETED = 'disposition_completed',
    FOLLOW_UP_COMPLETED = 'follow_up_completed',
    IMR_REVIEWED = 'imr_reviewed',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    FOLLOW_UP_CAR_ISSUED = 'follow_up_car_issued',
}

export enum FollowUpResult {
    SATISFACTORY = 'satisfactory',
    NOT_SATISFACTORY = 'not_satisfactory',
}

export interface Car {
    id: string;
    department: string;
    projectName: string;
    refNo: string;
    projectNo: string;
    to: string;
    date: string;
    carIssuedBy: string;
    sources: CarSource[];
    otherSourceDescription?: string;
    severity: CarSeverity;
    nonConformityTypes: NonConformityType[];
    nonConformityDescription: string;
    // Section 2: Disposition of Non-Conformity
    causeOfNonConformity?: string;
    remedialAction?: string;
    correctiveAction?: string;
    dueDate?: string;
    completedBy?: string;
    completedByDate?: string;
    completedByStatus?: string;
    acknowledgedBy?: string;
    acknowledgedByDate?: string;
    acknowledgedByStatus?: string;
    // Section 3: Follow Up Remedial and Corrective Results
    raCaSatisfactory?: boolean | number;
    raCaSatisfactoryDescription?: string;
    furtherActionRequired?: boolean | number;
    furtherActionDescription?: string;
    verifiedBy?: string;
    verifiedByDate?: string;
    verifiedByStatus?: string;
    verifiedByDate2?: string;
    verifiedByStatus2?: string;
    // Section 4: Review by IMR
    imrComments?: string;
    responseTimeCheck?: boolean | number;
    approvedBy?: string;
    approvedByDate?: string;
    approvedByStatus?: string;
    approvedByDate2?: string;
    approvedByStatus2?: string;
    // Legacy fields for backward compatibility
    followUpResult?: FollowUpResult;
    furtherAction?: string;
    isNewRisk?: boolean;
    respondedInTime?: boolean;
    completedDate?: string; // Legacy alias for completedByDate
    acknowledgedDate?: string; // Legacy alias for acknowledgedByDate
    verifiedDate?: string; // Legacy alias for verifiedByDate
    approvedDate?: string; // Legacy alias for approvedByDate
    status: CarStatus;
    issuerId: string;
    issuer: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    responsiblePersonId?: string;
    responsiblePerson?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    imrId?: string;
    imr?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    createdAt: string;
    updatedAt: string;
    isDeleted: boolean;
    deletedAt?: string;
}

export interface CreateCarRequest {
    department: string;
    projectName: string;
    refNo: string;
    projectNo: string;
    to: string;
    date: string;
    carIssuedBy: string;
    sources: CarSource[];
    otherSourceDescription?: string;
    severity: CarSeverity;
    nonConformityTypes: NonConformityType[];
    nonConformityDescription: string;
    responsiblePersonId?: string;
    imrId?: string;
    // Section 2: Disposition of Non-Conformity
    causeOfNonConformity?: string;
    remedialAction?: string;
    correctiveAction?: string;
    dueDate?: string;
    completedBy?: string;
    completedDate?: string;
    acknowledgedBy?: string;
    acknowledgedDate?: string;
    // Section 3: Follow Up Remedial and Corrective Results
    raCaSatisfactory?: boolean;
    raCaSatisfactoryDescription?: string;
    furtherActionRequired?: boolean;
    furtherActionDescription?: string;
    verifiedBy?: string;
    verifiedDate?: string;
    verifiedByDate2?: string;
    verifiedByStatus2?: string;
    // Section 4: Review by IMR
    imrComments?: string;
    responseTimeCheck?: string;
    approvedBy?: string;
    approvedDate?: string;
    approvedByDate2?: string;
    approvedByStatus2?: string;
}

export interface UpdateCarRequest extends Partial<CreateCarRequest> {}

export interface DispositionRequest {
    causeOfNonConformity: string;
    remedialAction: string;
    correctiveAction: string;
    dueDate: string;
    completedBy: string;
    completedByDate: string;
    acknowledgedBy: string;
    acknowledgedByDate: string;
}

export interface FollowUpRequest {
    followUpResult: FollowUpResult;
    furtherAction?: string;
    verifiedBy: string;
    verifiedByDate: string;
    verifiedByDate2?: string;
}

export interface ImrReviewRequest {
    imrComments: string;
    isNewRisk: boolean;
    respondedInTime: boolean;
    approvedBy: string;
    approvedByDate: string;
    approvedByDate2?: string;
}

export interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

// Helper interfaces for dropdowns
export interface CarSeverityOption {
    value: CarSeverity;
    label: string;
    description: string;
}

export interface CarSourceOption {
    value: CarSource;
    label: string;
}

export interface NonConformityTypeOption {
    value: NonConformityType;
    label: string;
}



