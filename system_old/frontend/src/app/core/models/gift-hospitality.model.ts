export interface GiftHospitality {
  id: string;
  requestType: 'gift' | 'hospitality';
  description: string;
  purpose: string;
  value: number;
  companyOfGiver: string;
  proposedDate: string;
  mtlReceivingStaff: string;
  status: 'pending' | 'verified' | 'acknowledged' | 'approved' | 'rejected' | 'cancelled';

  // MTL Receiving Staff fields
  mtlReceivingStaffBy?: string | null;
  mtlReceivingStaffByDate?: string | null;
  mtlReceivingStaffByStatus?: 'pending' | 'reject' | 'approve' | null;

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
  imsAcknowledgedBy?: string | null;
  imsAcknowledgedByDate?: string | null;
  imsAcknowledgedByStatus?: 'pending' | 'reject' | 'approve' | 'approved' | 'rejected' | null;
  attachments?: string[];

  // Legacy workflow fields (for backward compatibility)
  requestedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  requestedDate?: string;

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
  createBy?: string;
  updateBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version?: number;
  versionHistory?: any[];
}

export interface CreateGiftHospitalityDto {
  requested_by?: string | null;
  request_type: 'gift' | 'hospitality';
  description: string;
  purpose: string;
  value: number;
  company_of_giver: string;
  proposed_date: string;
  create_by?: string | null;
  mtl_receiving_staff_by?: string | null;
  mtl_receiving_staff_by_date?: string | null;
  mtl_receiving_staff_by_status?: 'pending' | 'reject' | 'approve' | null;
  verified_by?: string | null;
  verified_by_date?: string | null;
  verified_by_status?: 'pending' | 'reject' | 'approve' | null;
  acknowledged_by?: string | null;
  acknowledged_by_date?: string | null;
  acknowledged_by_status?: 'pending' | 'reject' | 'approve' | null;
  approved_by?: string | null;
  approved_by_date?: string | null;
  approved_by_status?: 'pending' | 'reject' | 'approve' | null;
  ims_acknowledged_by?: string | null;
  ims_acknowledged_by_date?: string | null;
  ims_acknowledged_by_status?: 'pending' | 'reject' | 'approve' | 'approved' | 'rejected' | null;
  attachments?: string[];
}

export interface UpdateGiftHospitalityDto {
  requestType?: 'gift' | 'hospitality';
  description?: string;
  purpose?: string;
  value?: number;
  companyOfGiver?: string;
  proposedDate?: string;
  mtlReceivingStaff?: string;
  verifiedById?: string;
  acknowledgedById?: string;
  approvedById?: string;
}

export interface VerifyRequestDto {
  comments?: string;
}

export interface AcknowledgeRequestDto {
  comments?: string;
}

export interface ApproveRequestDto {
  approvedDecision: boolean;
  comments?: string;
}

export interface UpdateStatusDto {
  table: string;
  field: string;
  status: 'PENDING' | 'REJECT' | 'APPROVED';
}
