export interface GiftHospitalityOffering {
  id: string;
  type: 'Gift' | 'Hospitality';
  description: string;
  purpose: string;
  value: number;
  currencyCode: string;
  receiverNameAndCompany: string;
  proposedDate: string;
  status: 'Pending' | 'Verified' | 'Acknowledged' | 'Approved' | 'Rejected';
  
  requestedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  requestedDate: string;
  
  // Verified By fields (using code)
  verifiedBy?: string | null;
  verifiedByDate?: string | null;
  verifiedByStatus?: 'pending' | 'reject' | 'approve' | null;
  
  // Acknowledged By fields (using code)
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
  
  // Approved By fields (using code)
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedBy2?: string | null;
  approvedBy2Date?: string | null;
  approvedBy2Status?: 'pending' | 'reject' | 'approve' | null;
  imsAcknowledgedBy?: string | null;
  imsAcknowledgedByDate?: string | null;
  imsAcknowledgedByStatus?: 'pending' | 'reject' | 'approve' | 'approved' | 'rejected' | null;
  workflowEmployeeNames?: Record<string, { name: string; title: string }>;
  attachments?: string[];
  
  // Legacy workflow fields (for backward compatibility)
  verifiedById?: string;
  verifiedDate?: string;
  verifiedComments?: string;
  
  acknowledgedById?: string;
  acknowledgedDate?: string;
  acknowledgedComments?: string;
  
  approvedById?: string;
  approvedDecision?: boolean;
  approvedDate?: string;
  approvedComments?: string;
  
  // Audit fields
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createBy?: string;
  updateBy?: string | null;
}

export interface CreateGiftHospitalityOfferingDto {
  type: 'Gift' | 'Hospitality';
  description: string;
  purpose: string;
  value: number;
  currency_code?: string;
  receiverNameAndCompany: string;
  proposedDate: string;
  requestedById: string;
  requestedByFirstName: string;
  requestedByLastName: string;
  requestedByEmail: string;
  verified_by?: string | null;
  verified_by_date?: string | null;
  verified_by_status?: 'pending' | 'reject' | 'approve' | null;
  acknowledged_by?: string | null;
  acknowledged_by_date?: string | null;
  acknowledged_by_status?: 'pending' | 'reject' | 'approve' | null;
  approved_by?: string | null;
  approved_by_date?: string | null;
  approved_by_status?: 'pending' | 'reject' | 'approve' | null;
  approved_by_2?: string | null;
  approved_by_2_date?: string | null;
  approved_by_2_status?: 'pending' | 'reject' | 'approve' | null;
  ims_acknowledged_by?: string | null;
  ims_acknowledged_by_date?: string | null;
  ims_acknowledged_by_status?: 'pending' | 'reject' | 'approve' | 'approved' | 'rejected' | null;
  attachments?: string[];
  // Legacy fields
  verifiedById?: string;
  acknowledgedById?: string;
  approvedById?: string;
}

export interface UpdateGiftHospitalityOfferingDto {
  type?: 'Gift' | 'Hospitality';
  description?: string;
  purpose?: string;
  value?: number;
  currency_code?: string;
  receiverNameAndCompany?: string;
  proposedDate?: string;
  verifiedById?: string;
  acknowledgedById?: string;
  approvedById?: string;
}

export interface VerifyRequestDto {
  comments: string;
  verifiedByFirstName?: string;
  verifiedByLastName?: string;
  verifiedByEmail?: string;
}

export interface AcknowledgeRequestDto {
  comments: string;
  acknowledgedByFirstName?: string;
  acknowledgedByLastName?: string;
  acknowledgedByEmail?: string;
}

export interface ApproveRequestDto {
  approvedDecision: boolean;
  comments: string;
  approvedByFirstName?: string;
  approvedByLastName?: string;
  approvedByEmail?: string;
}

export interface UpdateStatusDto {
  table: string;
  field: 'verified_by_status' | 'acknowledged_by_status' | 'approved_by_status';
  status: 'PENDING' | 'REJECT' | 'APPROVED';
}


