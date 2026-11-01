export interface ApprovalWorkflowStep {
  title: string;
  actor: string | number | null | undefined;
  date: string | Date | null | undefined;
  status: string | null | undefined;
  statusLabel?: string;
}

export interface ApprovalWorkflowApproval {
  purchaseRequestBy?: string | number | null;
  purchaseRequestByDate?: string | Date | null;
  purchaseRequestByStatus?: string | null;
  verifiedBy?: string | number | null;
  verifiedByDate?: string | Date | null;
  verifiedByStatus?: string | null;
  approvedBy?: string | number | null;
  approvedByDate?: string | Date | null;
  approvedByStatus?: string | null;
  circ?: string | number | null;
  circDate?: string | Date | null;
  circStatus?: string | null;
  signedBy?: string | number | null;
  signedByDate?: string | Date | null;
  signedByStatus?: string | null;
  acknowledgedBy?: string | number | null;
  acknowledgedByDate?: string | Date | null;
  acknowledgedByStatus?: string | null;
}

export function hasWorkflowAssignee(value: string | number | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function buildApprovalWorkflowSteps(
  approval: ApprovalWorkflowApproval | null | undefined
): ApprovalWorkflowStep[] {
  if (!approval) {
    return [];
  }

  return [
    {
      title: 'Requested By',
      actor: approval.purchaseRequestBy,
      date: approval.purchaseRequestByDate,
      status: approval.purchaseRequestByDate ? 'approved' : approval.purchaseRequestByStatus,
    },
    {
      title: 'Verified By',
      actor: approval.verifiedBy,
      date: approval.verifiedByDate,
      status: approval.verifiedByStatus,
    },
    {
      title: 'Approved By',
      actor: approval.approvedBy,
      date: approval.approvedByDate,
      status: approval.approvedByStatus,
    },
    {
      title: 'Circ',
      actor: approval.circ,
      date: approval.circDate,
      status: approval.circStatus,
    },
    {
      title: 'Signed By',
      actor: approval.signedBy,
      date: approval.signedByDate,
      status: approval.signedByStatus,
    },
    {
      title: 'Acknowledged By',
      actor: approval.acknowledgedBy,
      date: approval.acknowledgedByDate,
      status: approval.acknowledgedByStatus,
    },
  ].filter((step) => hasWorkflowAssignee(step.actor));
}
