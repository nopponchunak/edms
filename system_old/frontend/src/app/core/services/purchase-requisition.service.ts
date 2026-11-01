import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface RequisitionItem {
    item: string;
    description: string;
    needAssetCodeRegistration?: boolean;
    quantity: number;
    unitPrice: number;
    amount: number;
}

/** Raw item from GET /api/get_purchase_requisitions response (items[].*) */
export interface PrForSelectionRowItem {
    id?: number;
    purchase_requisition_id?: number;
    item: string;
    description: string;
    need_asset_code_registration?: boolean | number | string | null;
    quantity: string;
    unit_price: string;
    amount: string;
}

/** Single PR from GET /api/get_purchase_requisitions response */
export interface PrForSelectionItem {
    id: number;
    pr_no?: string;
    prNo?: string;
    to?: string;
    subject?: string;
    date?: string;
    attachments?: unknown;
    currency_code?: string;
    payment_term?: string;
    paymentTerm?: string;
    vat?: boolean | number | string;
    discount?: number | string | null;
    sub_total?: number | string | null;
    vat_value?: number | string | null;
    grand_total?: number | string | null;
    items: PrForSelectionRowItem[];
    No?: number;
    status?: string;
    requested_by?: string;
    requested_by_status?: string;
    verified_by_is?: string;
    verified_by_is_status?: string;
    verified_by?: string;
    verified_by_status?: string;
    approved_by?: string;
    approved_by_status?: string;
    approved_by_2?: string;
    approved_by_2_status?: string;
    acknowledged_by?: string;
    acknowledged_by_status?: string;
}

export interface PurchaseRequisition {
    id: string;
    prNo?: string;
    to: string;
    subject?: string | null;
    date: Date;
    requestedById: string;
    requestedBy?: User;
    recommendedById?: string;
    recommendedBy?: User;
    deadline?: Date;
    receivedFrom?: string;
    reasonsForPurchase: string;
    items: RequisitionItem[];
    discount?: number;
    subTotal: number;
    vatValue: number;
    grandTotal: number;
    otherConditions?: string;
    paymentTerm?: string;
    quotationAttached: boolean;
    needAssetCodeRegistration: boolean;
    comments?: string;
    status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'ACKNOWLEDGED' | 'COMPLETED';
    requestedDate: Date;
    verifiedById?: string;
    verifiedBy?: User;
    verifiedDate?: Date;
    verifiedByIS: boolean;
    approvedById?: string;
    approvedBy?: User;
    approvedDate?: Date;
    approvedBy2Id?: string;
    approvedBy2?: User;
    approvedBy2Date?: Date;
    acknowledgedById?: string;
    acknowledgedBy?: User;
    acknowledgedDate?: Date;
    actionByAdminId?: string;
    actionByAdmin?: User;
    actionByAdminDate?: Date;
    approvalHistory: any[];
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

export interface CreatePurchaseRequisitionDto {
    to: string;
    subject?: string | null;
    date: string;
    recommendedById?: string;
    deadline?: string;
    receivedFrom?: string;
    reasonsForPurchase: string;
    items: RequisitionItem[];
    discount?: number;
    otherConditions?: string;
    paymentTerm?: string;
    quotationAttached?: boolean;
    needAssetCodeRegistration?: boolean;
    comments?: string;
}

export interface UpdatePurchaseRequisitionDto {
    to?: string;
    subject?: string | null;
    date?: string;
    recommendedById?: string;
    deadline?: string;
    receivedFrom?: string;
    reasonsForPurchase?: string;
    items?: RequisitionItem[];
    discount?: number;
    otherConditions?: string;
    paymentTerm?: string;
    quotationAttached?: boolean;
    needAssetCodeRegistration?: boolean;
    comments?: string;
}

export interface VerifyRequisitionDto {
    isITEquipment?: boolean;
    comments?: string;
}

export interface ApproveRequisitionDto {
    decision: 'approved' | 'rejected';
    comments?: string;
    rejectionReason?: string;
}

export interface AcknowledgeRequisitionDto {
    needAssetCodeRegistration?: boolean;
    comments?: string;
}

export interface PurchaseRequisitionActionDto {
    decision: 'approved' | 'rejected' | 'approve' | 'reject';
    comments?: string;
    need_asset_code_registration?: 1 | 0 | boolean | null;
    item_asset_flags?: boolean[];
}

export interface EmailNotificationPayload {
    template: 'action_request' | 'status_update';
    to: string;
    subject: string;
    data: Record<string, any>;
}

export interface PurchaseRequisitionsPageRequest {
    draw: number;
    type?: string;
    columns: Array<{ data: string }>;
    order: Array<{ column: number; dir: 'asc' | 'desc' }>;
    start: number;
    length: number;
    search: {
        value: string;
        regex: boolean;
    };
    filters?: Record<string, string | boolean | null | undefined>;
}

export interface PurchaseRequisitionRow {
    id: string;
    prNo?: string;
    date: string;
    createdAt?: string;
    updatedAt?: string;
    to: string;
    subject?: string;
    requestedBy: string;
    requestedByLabel?: string | null;
    createdBy?: string | null;
    createdByLabel?: string | null;
    reasons: string;
    totalAmount: number;
    currency?: string;
    status: 'draft' | 'submitted' | 'approved' | 'rejected';
    projectType?: string;
    // Workflow "by" fields (user code for each step)
    verifiedByIs?: string | null;
    verifiedByIsLabel?: string | null;
    verifiedBy?: string | null;
    verifiedByLabel?: string | null;
    approvedBy?: string | null;
    approvedByLabel?: string | null;
    approvedBy2?: string | null;
    approvedBy2Label?: string | null;
    acknowledgedBy?: string | null;
    acknowledgedByLabel?: string | null;
    actionByAdmin?: string | null;
    actionByAdminLabel?: string | null;
    actionByAdminDate?: string | null;
    // Workflow status fields
    requestedByStatus?: 'pending' | 'reject' | 'approved' | null;
    verifiedByIsStatus?: 'pending' | 'reject' | 'approved' | null;
    verifiedByStatus?: 'pending' | 'reject' | 'approved' | null;
    approvedByStatus?: 'pending' | 'reject' | 'approved' | null;
    approvedBy2Status?: 'pending' | 'reject' | 'approved' | null;
    acknowledgedByStatus?: 'pending' | 'reject' | 'approved' | null;
    actionByAdminStatus?: 'pending' | 'reject' | 'approved' | null;
}

export interface PurchaseRequisitionsPageResponse {
    currentPage: number;
    data: PurchaseRequisitionRow[];
    firstPageUrl: string;
    from: number;
    lastPage: number;
    lastPageUrl: string;
    links: Array<{ url: string | null; label: string; active: boolean }>;
    nextPageUrl: string | null;
    path: string;
    perPage: number;
    prevPageUrl: string | null;
    to: number;
    total: number;
}

interface PurchaseRequisitionsPageApiResponse {
    code: string;
    status: boolean;
    message: string;
    data: {
        current_page: number;
        data: any[];
        first_page_url: string;
        from: number;
        last_page: number;
        last_page_url: string;
        links: Array<{ url: string | null; label: string; active: boolean }>;
        next_page_url: string | null;
        path: string;
        per_page: number;
        prev_page_url: string | null;
        to: number;
        total: number;
    } | any[];
}

@Injectable({
    providedIn: 'root'
})
export class PurchaseRequisitionService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    /**
     * Create a new purchase requisition
     */
    create(createDto: CreatePurchaseRequisitionDto): Observable<PurchaseRequisition> {
        return this.http.post<PurchaseRequisition>(this.apiConfig.buildUrl('api/purchase_requisitions'), createDto);
    }

    /**
     * Get purchase requisitions list for "Add item from PR" (GET /api/get_purchase_requisitions).
     * Returns raw PR list with items for selection in PO form.
     */
    getPurchaseRequisitionsForSelection(): Observable<PrForSelectionItem[]> {
        return this.http
            .get<{ code: string; status: boolean; message: string; data: PrForSelectionItem[] }>(
                this.apiConfig.buildUrl('api/get_purchase_requisitions')
            )
            .pipe(map((res) => (res?.data && Array.isArray(res.data) ? res.data : [])));
    }

    /**
     * Get all purchase requisitions
     */
    findAll(): Observable<PurchaseRequisition[]> {
        return this.http.get<PurchaseRequisition[]>(this.apiConfig.buildUrl('api/purchase_requisitions'));
    }

    /**
     * Get paginated purchase requisitions list using POST /api/purchase_requisitions_page
     */
    findAllPaginated(request: PurchaseRequisitionsPageRequest): Observable<PurchaseRequisitionsPageResponse> {
        return this.http.post<PurchaseRequisitionsPageApiResponse>(this.apiConfig.buildUrl('api/purchase_requisitions_page'), request).pipe(
            map(response => this.transformPurchaseRequisitionsPageResponse(response))
        );
    }

    getPrintPdfUrl(id: string): string {
        return this.apiConfig.buildUrl(`api/purchase_requisitions/${encodeURIComponent(id)}/print`);
    }

    getCombinedPdfUrl(id: string): string {
        return this.apiConfig.buildUrl(`api/purchase_requisitions/${encodeURIComponent(id)}/combined-pdf`);
    }

    /**
     * Get purchase requisition by ID
     */
    findOne(id: string): Observable<PurchaseRequisition> {
        return this.http.get<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}`));
    }

    /**
     * Update purchase requisition
     */
    update(id: string, updateDto: UpdatePurchaseRequisitionDto): Observable<PurchaseRequisition> {
        return this.http.put<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}`), updateDto);
    }

    /**
     * Delete purchase requisition
     */
    remove(id: string): Observable<void> {
        return this.http.delete<void>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}`));
    }

    /**
     * Submit purchase requisition for approval
     */
    submit(id: string): Observable<PurchaseRequisition> {
        return this.http.patch<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}/submit`), {});
    }

    /**
     * Complete the current workflow action through the guarded backend endpoint.
     */
    takeAction(id: string, type: string, payload: PurchaseRequisitionActionDto): Observable<any> {
        return this.http.patch<any>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}/actions/${type}`), payload);
    }

    /**
     * Verify purchase requisition
     */
    verify(id: string, verifyDto: VerifyRequisitionDto): Observable<PurchaseRequisition> {
        return this.http.patch<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}/verify`), verifyDto);
    }

    /**
     * Approve or reject purchase requisition
     */
    approve(id: string, approveDto: ApproveRequisitionDto): Observable<PurchaseRequisition> {
        return this.http.patch<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}/approve`), approveDto);
    }

    /**
     * Acknowledge purchase requisition
     */
    acknowledge(id: string, acknowledgeDto: AcknowledgeRequisitionDto): Observable<PurchaseRequisition> {
        return this.http.patch<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}/acknowledge`), acknowledgeDto);
    }

    /**
     * Admin action on purchase requisition
     */
    adminAction(id: string): Observable<PurchaseRequisition> {
        return this.http.patch<PurchaseRequisition>(this.apiConfig.buildUrl(`api/purchase_requisitions/${id}/admin-action`), {});
    }

    /**
     * Send email notification through backend notification endpoint.
     */
    sendEmailNotification(payload: EmailNotificationPayload): Observable<any> {
        return this.http.post<any>(this.apiConfig.buildUrl('api/notifications/send-email'), payload);
    }

    /**
     * Get purchase requisitions by user
     */
    findByUser(userId: string): Observable<PurchaseRequisition[]> {
        return this.http.get<PurchaseRequisition[]>(this.apiConfig.buildUrl(`api/purchase_requisitions/user/${userId}`));
    }

    /**
     * Transform purchase requisitions page API response
     */
    private transformPurchaseRequisitionsPageResponse(response: PurchaseRequisitionsPageApiResponse): PurchaseRequisitionsPageResponse {
        let items: any[] = [];
        let paginationData: any;

        if (Array.isArray(response.data)) {
            items = response.data;
            paginationData = {
                current_page: 1,
                first_page_url: '',
                from: 1,
                last_page: 1,
                last_page_url: '',
                links: [],
                next_page_url: null,
                path: '',
                per_page: items.length,
                prev_page_url: null,
                to: items.length,
                total: items.length
            };
        } else {
            items = response.data.data || [];
            paginationData = response.data;
        }

        return {
            currentPage: paginationData.current_page,
            data: items.map(item => this.transformPurchaseRequisitionItem(item)),
            firstPageUrl: paginationData.first_page_url,
            from: paginationData.from,
            lastPage: paginationData.last_page,
            lastPageUrl: paginationData.last_page_url,
            links: paginationData.links || [],
            nextPageUrl: paginationData.next_page_url,
            path: paginationData.path,
            perPage: paginationData.per_page,
            prevPageUrl: paginationData.prev_page_url,
            to: paginationData.to,
            total: paginationData.total
        };
    }

    /**
     * Normalize status from API (รองรับทั้งตัวเล็กตัวใหญ่ เช่น Approved / approved)
     */
    private normalizeStatusValue(value: string | null | undefined): string | null {
        if (value === null || value === undefined) return null;
        const s = String(value).toLowerCase().trim();
        return s === '' ? null : s;
    }

    /**
     * Transform purchase requisition item from snake_case to camelCase
     */
    private transformPurchaseRequisitionItem(item: any): PurchaseRequisitionRow {
        return {
            id: String(item.id),
            prNo: item.pr_no || item.prNo || '',
            date: item.date || '',
            createdAt: item.created_at || item.createdAt || '',
            updatedAt: item.updated_at || item.updatedAt || '',
            to: item.to || '',
            subject: item.subject || item.name || item.pr_subject || item.purchase_requisition_subject || '',
            requestedBy: item.requested_by || item.requestedBy || '',
            requestedByLabel: this.readEmployeeLabel(item, 'requested_by', 'requestedBy'),
            createdBy: item.create_by || item.createBy || null,
            createdByLabel: this.readEmployeeLabel(item, 'create_by', 'createdBy'),
            reasons: item.reasons_for_purchase || item.reasonsForPurchase || item.reasons || '',
            totalAmount: parseFloat(item.total_amount || item.totalAmount || item.grand_total || item.grandTotal || '0'),
            currency: item.currency_code || item.currency || 'THB',
            status: (item.status?.toLowerCase() || 'submitted') as 'draft' | 'submitted' | 'approved' | 'rejected',
            projectType: item.project_type || item.projectType || '',
            // Workflow "by" fields (for Action Request tab)
            verifiedByIs: item.verified_by_is ?? item.verifiedByIs ?? null,
            verifiedByIsLabel: this.readEmployeeLabel(item, 'verified_by_is', 'verifiedByIs'),
            verifiedBy: item.verified_by ?? item.verifiedBy ?? null,
            verifiedByLabel: this.readEmployeeLabel(item, 'verified_by', 'verifiedBy'),
            approvedBy: item.approved_by ?? item.approvedBy ?? null,
            approvedByLabel: this.readEmployeeLabel(item, 'approved_by', 'approvedBy'),
            approvedBy2: item.approved_by_2 ?? item.approvedBy2 ?? null,
            approvedBy2Label: this.readEmployeeLabel(item, 'approved_by_2', 'approvedBy2'),
            acknowledgedBy: item.acknowledged_by ?? item.acknowledgedBy ?? null,
            acknowledgedByLabel: this.readEmployeeLabel(item, 'acknowledged_by', 'acknowledgedBy'),
            actionByAdmin: item.action_by_admin ?? item.actionByAdmin ?? null,
            actionByAdminLabel: this.readEmployeeLabel(item, 'action_by_admin', 'actionByAdmin'),
            actionByAdminDate: item.action_by_admin_date ?? item.actionByAdminDate ?? null,
            // Workflow status fields (รองรับทั้งตัวเล็กตัวใหญ่จาก API เช่น Approved / approved)
            requestedByStatus: this.normalizeStatusValue(item.requested_by_status) as PurchaseRequisitionRow['requestedByStatus'],
            verifiedByIsStatus: this.normalizeStatusValue(item.verified_by_is_status) as PurchaseRequisitionRow['verifiedByIsStatus'],
            verifiedByStatus: this.normalizeStatusValue(item.verified_by_status) as PurchaseRequisitionRow['verifiedByStatus'],
            approvedByStatus: this.normalizeStatusValue(item.approved_by_status) as PurchaseRequisitionRow['approvedByStatus'],
            approvedBy2Status: this.normalizeStatusValue(item.approved_by_2_status) as PurchaseRequisitionRow['approvedBy2Status'],
            acknowledgedByStatus: this.normalizeStatusValue(item.acknowledged_by_status) as PurchaseRequisitionRow['acknowledgedByStatus'],
            actionByAdminStatus: this.normalizeStatusValue(item.action_by_admin_status) as PurchaseRequisitionRow['actionByAdminStatus'],
        };
    }

    private readEmployeeLabel(item: any, snakeField: string, camelField: string): string {
        const employee = item?.[`${snakeField}_employee`] ?? item?.[`${camelField}Employee`];
        return String(employee?.label ?? item?.[`${snakeField}_label`] ?? item?.[`${camelField}Label`] ?? '').trim();
    }
}
