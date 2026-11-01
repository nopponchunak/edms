import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface PurchaseOrderItem {
    item: string;
    description: string;
    needAssetCodeRegistration?: boolean;
    assetCode?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
}

export interface PurchaseOrder {
    id: string;
    to: string;
    company: string;
    subject?: string | null;
    fax?: string;
    from: string;
    cc?: string;
    poNo?: string;
    poDate?: Date;
    requisitionDate: Date;
    pageNumber: number;
    totalPages: number;
    items: PurchaseOrderItem[];
    discount?: number;
    subTotal: number;
    vatValue: number;
    grandTotal: number;
    quotationNo?: string;
    quotationDate?: Date;
    deliveryDate?: Date | string;
    paymentTerm?: string;
    otherConditions?: string;
    isSparePart: boolean;
    purchaseRequestBy?: string | null;
    purchaseRequestByDate?: Date | string | null;
    purchaseRequestByStatus?: 'pending' | 'reject' | 'approve' | 'APPROVED' | null;
    verifiedBy?: string | null;
    verifiedByDate?: Date | string | null;
    verifiedByStatus?: 'pending' | 'reject' | 'approve' | 'APPROVED' | null;
    approvedBy?: string | null;
    approvedByDate?: Date | string | null;
    approvedByStatus?: 'pending' | 'reject' | 'approve' | 'APPROVED' | null;
    circ?: string | null;
    circDate?: Date | string | null;
    circStatus?: 'pending' | 'reject' | 'approve' | 'APPROVED' | null;
    signedBy?: string | null;
    signedByDate?: Date | string | null;
    signedByStatus?: 'pending' | 'reject' | 'approve' | 'APPROVED' | null;
    acknowledgedBy?: string | null;
    acknowledgedByDate?: Date | string | null;
    acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | 'APPROVED' | null;
    verifiedDate?: Date;
    approvedDate?: Date;
    rejectedReason?: string;
    deliveryOnTime?: boolean | null;
    meetQualityRequirement?: boolean | null;
    meetGuidelinesForEquipment?: boolean | null;
    deliveryComments?: string;
    inspectorName?: string;
    inspectionDate?: Date;
    signedDate?: Date;
    status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'DELIVERED' | 'COMPLETED';
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    /** Paths from API e.g. ["/uploads/files/a.pdf"] */
    attachments?: string[];
    /** Source PR references/PDF payloads returned by the API when available */
    purchaseRequisitionId?: string | null;
    purchaseRequisitionNo?: string | null;
    purchaseRequisitionPdf?: unknown;
    purchaseRequisitionAttachments?: unknown;
    /** VAT flag from API: 0 = no VAT, 1 = 7% VAT */
    vat?: number | boolean;
    /** Currency code from API e.g. "THB", "USD" */
    currency?: string;
}

export interface UpdateStatusDto {
    table: string;
    field: 'purchase_request_by' | 'verified_by' | 'approved_by' | 'circ' | 'signed_by' | 'acknowledged_by';
    status: 'PENDING' | 'REJECT' | 'APPROVED';
}

export interface CreatePurchaseOrderDto {
    to: string;
    company: string;
    subject?: string | null;
    fax?: string;
    from: string;
    cc?: string;
    requisitionDate: Date;
    pageNumber: number;
    totalPages: number;
    items: PurchaseOrderItem[];
    discount?: number;
    quotationNo?: string;
    deliveryDate?: Date;
    paymentTerm?: string;
    otherConditions?: string;
    isSparePart: boolean;
    status?: 'draft' | 'submitted' | 'DRAFT' | 'SUBMITTED';
}

export interface UpdatePurchaseOrderDto {
    to?: string;
    company?: string;
    subject?: string | null;
    fax?: string;
    from?: string;
    cc?: string;
    requisitionDate?: Date;
    pageNumber?: number;
    totalPages?: number;
    items?: PurchaseOrderItem[];
    discount?: number;
    quotationNo?: string;
    deliveryDate?: Date;
    paymentTerm?: string;
    otherConditions?: string;
    isSparePart?: boolean;
    delivery_on_time?: number | boolean | null;
    meet_quality_requirement?: number | boolean | null;
    meet_equipment_guidelines?: number | boolean | null;
    status?: 'draft' | 'submitted' | 'DRAFT' | 'SUBMITTED';
}

export interface VerifyRequestDto {
    verifiedBy: string;
    verifiedDate: Date;
}

export interface ApproveRequestDto {
    approvedBy: string;
    approvedDate: Date;
    rejectedReason?: string;
}

export interface DeliveryInspectionDto {
    deliveryOnTime: boolean;
    meetQualityRequirement: boolean;
    meetGuidelinesForEquipment: boolean;
    deliveryComments?: string;
    inspectorName: string;
    inspectionDate: Date;
}

export interface PurchaseOrderActionDto {
    decision: 'approved' | 'rejected' | 'approve' | 'reject';
    comments?: string;
    delivery_on_time?: 1 | 0 | boolean | null;
    meet_quality_requirement?: 1 | 0 | boolean | null;
    meet_equipment_guidelines?: 1 | 0 | boolean | null;
}

@Injectable({
    providedIn: 'root'
})
export class PurchaseOrderService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    /**
     * Create a new purchase order
     */
    create(createPurchaseOrderDto: CreatePurchaseOrderDto): Observable<PurchaseOrder> {
        return this.http.post<PurchaseOrder>(this.apiConfig.buildUrl('api/purchase_order'), createPurchaseOrderDto);
    }

    /**
     * Get all purchase orders
     */
    findAll(): Observable<PurchaseOrder[]> {
        return this.http.get<PurchaseOrder[]>(this.apiConfig.buildUrl('api/purchase-order'));
    }

    /**
     * Get paginated purchase orders list using POST /api/purchase_order_page
     */
    findAllPaginated(request: PurchaseOrdersPageRequest): Observable<PurchaseOrdersPageResponse> {
        return this.http.post<PurchaseOrdersPageApiResponse>(this.apiConfig.buildUrl('api/purchase_order_page'), request).pipe(
            map(response => this.transformPurchaseOrdersPageResponse(response))
        );
    }

    exportPurchaseOrders(request: PurchaseOrdersPageRequest): Observable<Blob> {
        return this.http.post(this.apiConfig.buildUrl('api/purchase_order/export'), request, {
            responseType: 'blob'
        });
    }

    downloadCombinedPdf(id: string): Observable<Blob> {
        return this.http.get(this.apiConfig.buildUrl(`api/purchase_order/${id}/download-combined`), {
            responseType: 'blob'
        });
    }

    getCombinedPdfUrl(id: string): string {
        return this.apiConfig.buildUrl(`api/purchase_order/${encodeURIComponent(id)}/combined-pdf`);
    }

    getPrintPdfUrl(id: string): string {
        return this.apiConfig.buildUrl(`api/purchase_order/${encodeURIComponent(id)}/print`);
    }

    /**
     * Get purchase order by ID
     */
    findOne(id: string): Observable<PurchaseOrder> {
        return this.http.get<PurchaseOrderApiResponse>(this.apiConfig.buildUrl(`api/purchase_order/${id}`)).pipe(
            map(response => this.transformPurchaseOrderApiResponse(response))
        );
    }

    /**
     * Update purchase order
     */
    update(id: string, updatePurchaseOrderDto: UpdatePurchaseOrderDto): Observable<PurchaseOrder> {
        return this.http.put<PurchaseOrderApiResponse>(this.apiConfig.buildUrl(`api/purchase_order/${id}`), updatePurchaseOrderDto).pipe(
            map(response => this.transformPurchaseOrderApiResponse(response))
        );
    }

    /**
     * Delete purchase order
     */
    remove(id: string): Observable<void> {
        return this.http.delete<void>(this.apiConfig.buildUrl(`api/purchase_order/${id}`));
    }

    /**
     * Submit purchase order for approval
     */
    submit(id: string): Observable<PurchaseOrder> {
        return this.http.patch<PurchaseOrderApiResponse>(this.apiConfig.buildUrl(`api/purchase_order/${id}/submit`), {}).pipe(
            map(response => this.transformPurchaseOrderApiResponse(response))
        );
    }

    /**
     * Complete the current workflow action through the guarded backend endpoint.
     */
    takeAction(id: string, type: string, payload: PurchaseOrderActionDto): Observable<PurchaseOrder> {
        return this.http.patch<PurchaseOrderApiResponse>(this.apiConfig.buildUrl(`api/purchase_order/${id}/actions/${type}`), payload).pipe(
            map(response => this.transformPurchaseOrderApiResponse(response))
        );
    }

    /**
     * Verify purchase order (for spare parts)
     */
    verify(id: string, verifyRequestDto: VerifyRequestDto): Observable<PurchaseOrder> {
        return this.http.patch<PurchaseOrder>(this.apiConfig.buildUrl(`api/purchase-order/${id}/verify`), verifyRequestDto);
    }

    /**
     * Approve or reject purchase order
     */
    approve(id: string, approveRequestDto: ApproveRequestDto): Observable<PurchaseOrder> {
        return this.http.patch<PurchaseOrder>(this.apiConfig.buildUrl(`api/purchase-order/${id}/approve`), approveRequestDto);
    }

    /**
     * Complete delivery inspection
     */
    completeInspection(id: string, deliveryInspectionDto: DeliveryInspectionDto): Observable<PurchaseOrder> {
        return this.http.patch<PurchaseOrder>(this.apiConfig.buildUrl(`api/purchase-order/${id}/inspection`), deliveryInspectionDto);
    }

    /**
     * Acknowledge purchase order (admin)
     */
    acknowledge(id: string, acknowledgedBy: string): Observable<PurchaseOrder> {
        return this.http.patch<PurchaseOrder>(this.apiConfig.buildUrl(`api/purchase-order/${id}/acknowledge`), { acknowledgedBy });
    }

    /**
     * Update workflow status
     */
    updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
        return this.http.put(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
    }

    /**
     * Get purchase orders by status
     */
    findByStatus(status: string): Observable<PurchaseOrder[]> {
        return this.http.get<PurchaseOrder[]>(this.apiConfig.buildUrl(`api/purchase-order/status/${status}`));
    }

    /**
     * Get purchase orders by user
     */
    findByUser(userId: string): Observable<PurchaseOrder[]> {
        return this.http.get<PurchaseOrder[]>(this.apiConfig.buildUrl(`api/purchase-order/user/${userId}`));
    }

    /**
     * Get pending approvals for user
     */
    getPendingApprovals(userId: string): Observable<PurchaseOrder[]> {
        return this.http.get<PurchaseOrder[]>(this.apiConfig.buildUrl(`api/purchase-order/pending/${userId}`));
    }

    /**
     * Generate PO number
     */
    generatePONumber(): Observable<{ poNo: string }> {
        return this.http.get<{ poNo: string }>(this.apiConfig.buildUrl('api/purchase-order/generate-po-number'));
    }

    /**
     * Get next PO number for new purchase order
     * GET /api/purchase-orders/next-number
     */
    getNextPoNumber(): Observable<number> {
        return this.http.get<{ success: boolean; data: { next_po_no: number } }>(this.apiConfig.buildUrl('api/purchase-orders/next-number')).pipe(
            map(res => res?.data?.next_po_no ?? 1)
        );
    }

    /**
     * Transform API response to match PurchaseOrderRow structure
     */
    private transformPurchaseOrdersPageResponse(response: PurchaseOrdersPageApiResponse): PurchaseOrdersPageResponse {
        return {
            currentPage: response.data.current_page,
            data: response.data.data.map(item => this.transformPurchaseOrderItem(item)),
            firstPageUrl: response.data.first_page_url,
            from: response.data.from,
            lastPage: response.data.last_page,
            lastPageUrl: response.data.last_page_url,
            links: response.data.links,
            nextPageUrl: response.data.next_page_url,
            path: response.data.path,
            perPage: response.data.per_page,
            prevPageUrl: response.data.prev_page_url,
            to: response.data.to,
            total: response.data.total,
            companyOptions: response.data.company_options || []
        };
    }

    /**
     * Transform purchase order item from snake_case to camelCase
     */
    private transformPurchaseOrderItem(item: any): PurchaseOrderRow {
        return {
            id: String(item.id),
            poNo: item.po_no,
            subject: this.getPurchaseOrderSubject(item) || this.toCleanDisplayString(item.to),
            company: item.company,
            to: item.to,
            from: item.from,
            requisitionDate: item.requisition_date,
            quotationNo: item.quotation_no,
            deliveryDate: item.delivery_date,
            paymentTerm: item.payment_term,
            status: (item.status?.toUpperCase() || 'SUBMITTED') as any,
            grandTotal: Number(item.grand_total) || 0,
            currency: item.currency_code || item.currency || 'THB',
            // Workflow fields
            purchaseRequestBy: item.purchase_request_by || null,
            purchaseRequestByStatus: item.purchase_request_by_status as any || null,
            verifiedBy: item.verified_by || null,
            verifiedByStatus: item.verified_by_status as any || null,
            approvedBy: item.approved_by || null,
            approvedByStatus: item.approved_by_status as any || null,
            circ: item.circ || item.circ_by || null,
            circStatus: (item.circ_status ?? item.circ_by_status) as any || null,
            signedBy: item.signed_by || null,
            signedByStatus: item.signed_by_status as any || null,
            acknowledgedBy: item.acknowledged_by || null,
            acknowledgedByStatus: item.acknowledged_by_status as any || null,
            createdBy: item.create_by || null,
        };
    }

    /**
     * Transform single purchase order API response to PurchaseOrder model
     */
    private transformPurchaseOrderApiResponse(response: PurchaseOrderApiResponse): PurchaseOrder {
        const item = response.data;
        const requisition = this.getNestedRequisition(item);
        
        // Helper to safely parse dates from various possible string formats in API
        const parseApiDate = (dateVal: any): Date | undefined => {
            if (!dateVal) return undefined;
            const d = new Date(dateVal);
            return isNaN(d.getTime()) ? undefined : d;
        };

        return {
            id: String(item.id),
            to: item.to,
            company: item.company,
            subject: this.getPurchaseOrderSubject(item),
            fax: item.fax || '',
            from: item.from,
            cc: item.cc || '',
            poNo: item.po_no,
            poDate: parseApiDate(item.po_date),
            requisitionDate: parseApiDate(item.requisition_date) || new Date(),
            pageNumber: item.page || 1,
            totalPages: item.total_page || 1,
            items: item.items ? item.items.map((it: any) => ({
                item: it.item,
                description: it.description,
                needAssetCodeRegistration: this.toBooleanFlag(it.need_asset_code_registration ?? it.needAssetCodeRegistration),
                assetCode: it.asset_code || it.assetCode || '',
                quantity: Number(it.quantity) || 1,
                unitPrice: Number(it.unit_price) || 0,
                amount: Number(it.amount) || 0
            })) : [],
            discount: Number(item.discount) || 0,
            subTotal: Number(item.sub_total) || 0,
            vatValue: Number(item.vat_value) || 0,
            grandTotal: Number(item.grand_total) || 0,
            quotationNo: item.quotation_no,
            quotationDate: parseApiDate(item.quotation_date),
            deliveryDate: item.delivery_date != null && item.delivery_date !== ''
                ? (typeof item.delivery_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.delivery_date.trim())
                    ? new Date(item.delivery_date)
                    : item.delivery_date)
                : undefined,
            paymentTerm: item.payment_term,
            otherConditions: item.other_conditions,
            isSparePart: this.resolveIsSparePartFlag(item),
            
            // Workflow fields - using both possible namings from API/Legacy
            purchaseRequestBy: item.purchase_request_by || null,
            purchaseRequestByDate: parseApiDate(item.purchase_request_by_date || item.purchase_request_date),
            purchaseRequestByStatus: item.purchase_request_by_status || null,
            
            verifiedBy: item.verified_by || null,
            verifiedByDate: parseApiDate(item.verified_by_date),
            verifiedByStatus: item.verified_by_status || null,
            verifiedDate: parseApiDate(item.verified_date || item.verified_by_date),
            
            approvedBy: item.approved_by || null,
            approvedByDate: parseApiDate(item.approved_by_date),
            approvedByStatus: item.approved_by_status || null,
            approvedDate: parseApiDate(item.approved_date || item.approved_by_date),
            circ: item.circ || item.circ_by || null,
            circDate: parseApiDate(item.circ_date || item.circ_by_date),
            circStatus: item.circ_status || item.circ_by_status || null,
            
            rejectedReason: undefined,
            deliveryOnTime: this.toNullableBooleanFlag(item.delivery_on_time),
            meetQualityRequirement: this.toNullableBooleanFlag(item.meet_quality_requirement),
            meetGuidelinesForEquipment: this.toNullableBooleanFlag(item.meet_equipment_guidelines),
            deliveryComments: item.comments,
            inspectorName: undefined,
            inspectionDate: undefined,
            
            signedBy: item.signed_by || null,
            signedByDate: parseApiDate(item.signed_by_date),
            signedByStatus: item.signed_by_status || null,
            signedDate: parseApiDate(item.signed_date || item.signed_by_date),
            
            acknowledgedBy: item.acknowledged_by || null,
            acknowledgedByDate: parseApiDate(item.acknowledged_by_date),
            acknowledgedByStatus: item.acknowledged_by_status || null,
            
            status: (item.status?.toUpperCase() || 'SUBMITTED') as any,
            createdBy: item.create_by || '',
            createdAt: parseApiDate(item.created_at) || new Date(),
            updatedAt: parseApiDate(item.updated_at) || new Date(),
            attachments: Array.isArray(item.attachments) ? item.attachments : undefined,
            purchaseRequisitionId: this.readFirstString(item, ['purchase_requisition_id', 'purchaseRequisitionId', 'requisition_id', 'requisitionId', 'pr_id', 'prId'])
                ?? this.readFirstString(requisition, ['id', 'purchase_requisition_id', 'purchaseRequisitionId']),
            purchaseRequisitionNo: this.readFirstString(item, ['purchase_requisition_no', 'purchaseRequisitionNo', 'requisition_no', 'requisitionNo', 'pr_no', 'prNo'])
                ?? this.readFirstString(requisition, ['pr_no', 'prNo', 'purchase_requisition_no', 'purchaseRequisitionNo']),
            purchaseRequisitionPdf: this.readFirstValue(item, [
                'purchase_requisition_pdf',
                'purchase_requisition_pdf_url',
                'purchase_requisition_pdf_path',
                'purchaseRequisitionPdf',
                'purchaseRequisitionPdfUrl',
                'purchaseRequisitionPdfPath',
                'requisition_pdf',
                'requisition_pdf_url',
                'requisition_pdf_path',
                'requisitionPdf',
                'requisitionPdfUrl',
                'requisitionPdfPath',
                'pr_pdf',
                'pr_pdf_url',
                'pr_pdf_path',
                'prPdf',
                'prPdfUrl',
                'prPdfPath',
                'pdf_pr',
                'pdf_pr_url',
                'pdf_pr_path',
                'pdfPr',
                'pdfPrUrl',
                'pdfPrPath',
                'pr_file',
                'pr_file_url',
                'pr_file_path',
                'prFile',
                'prFileUrl',
                'prFilePath',
                'purchase_requisition_file',
                'purchase_requisition_file_url',
                'purchase_requisition_file_path',
                'purchaseRequisitionFile',
                'purchaseRequisitionFileUrl',
                'purchaseRequisitionFilePath'
            ]) ?? this.readFirstValue(requisition, [
                'pdf',
                'pdf_url',
                'pdf_path',
                'pdfUrl',
                'pdfPath',
                'purchase_requisition_pdf',
                'purchaseRequisitionPdf',
                'pr_pdf',
                'prPdf',
                'pr_file',
                'prFile',
                'purchase_requisition_file',
                'purchaseRequisitionFile'
            ]),
            purchaseRequisitionAttachments: this.readFirstValue(item, [
                'purchase_requisition_attachments',
                'purchaseRequisitionAttachments',
                'requisition_attachments',
                'requisitionAttachments',
                'pr_attachments',
                'prAttachments'
            ]) ?? this.readFirstValue(requisition, ['attachments', 'files', 'documents']),
            vat: item.vat,
            currency: item.currency_code || item.currency,
        };
    }

    private toBooleanFlag(value: unknown): boolean {
        return value === 1 || value === '1' || value === true;
    }

    private resolveIsSparePartFlag(item: any): boolean {
        const directValue = item?.is_spare_part ?? item?.isSparePart;
        if (directValue !== undefined && directValue !== null && directValue !== '') {
            return this.toBooleanFlag(directValue);
        }

        const notSparePart = item?.not_spare_part ?? item?.notSparePart;
        if (notSparePart !== undefined && notSparePart !== null && notSparePart !== '') {
            return !this.toBooleanFlag(notSparePart);
        }

        return !!item?.verified_by;
    }

    private getPurchaseOrderSubject(item: any): string {
        const directSubject = this.toCleanDisplayString(
            item?.subject
            ?? item?.Subject
            ?? item?.po_subject
            ?? item?.purchase_order_subject
        );

        if (directSubject) {
            return directSubject;
        }

        const requisition = this.getNestedRequisition(item);

        const nestedSubject = this.toCleanDisplayString(
            requisition?.subject
            ?? requisition?.Subject
            ?? requisition?.pr_subject
            ?? requisition?.purchase_requisition_subject
        );

        if (nestedSubject) {
            return nestedSubject;
        }

        return this.toCleanDisplayString(
            item?.purchase_requisition_subject
            ?? item?.requisition_subject
            ?? item?.purchase_request_subject
            ?? item?.pr_subject
        );
    }

    private getNestedRequisition(item: any): any {
        return item?.purchase_requisition
            ?? item?.purchaseRequisition
            ?? item?.requisition
            ?? item?.purchase_request
            ?? item?.purchaseRequest
            ?? item?.pr
            ?? null;
    }

    private readFirstString(source: any, keys: string[]): string | null {
        const value = this.readFirstValue(source, keys);
        const text = this.toCleanDisplayString(value);
        return text || null;
    }

    private readFirstValue(source: any, keys: string[]): unknown {
        if (!source || typeof source !== 'object') {
            return null;
        }

        for (const key of keys) {
            const value = source[key];
            if (value !== null && value !== undefined && value !== '') {
                return value;
            }
        }

        return null;
    }

    private toCleanDisplayString(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value).trim();
    }

    private toNullableBooleanFlag(value: unknown): boolean | null {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        if (value === true || value === 1 || value === '1') {
            return true;
        }

        if (value === false || value === 0 || value === '0') {
            return false;
        }

        return null;
    }
}

interface PurchaseOrderApiResponse {
    code: string;
    status: boolean;
    message: string;
    data: {
        id: number;
        to: string;
        company: string;
        subject?: string | null;
        fax?: string;
        from: string;
        cc?: string;
        po_no?: string;
        status?: string;
        po_date?: string;
        requisition_date: string;
        page?: number;
        total_page?: number;
        circ?: string;
        circ_by?: string;
        quotation_no?: string;
        quotation_date?: string;
        delivery_date?: string;
        payment_term?: string;
        other_conditions?: string;
        purchase_request_by?: string;
        purchase_request_by_date?: string;
        purchase_request_by_status?: 'pending' | 'reject' | 'approve' | null;
        purchase_request_date?: string;
        verified_by?: string;
        verified_by_date?: string;
        verified_by_status?: 'pending' | 'reject' | 'approve' | null;
        verified_date?: string;
        approved_by?: string;
        approved_by_date?: string;
        approved_by_status?: 'pending' | 'reject' | 'approve' | null;
        approved_date?: string;
        circ_date?: string;
        circ_status?: 'pending' | 'reject' | 'approve' | null;
        circ_by_date?: string;
        circ_by_status?: 'pending' | 'reject' | 'approve' | null;
        delivery_on_time?: number;
        meet_quality_requirement?: number;
        meet_equipment_guidelines?: number;
        comments?: string;
        signed_by?: string;
        signed_by_date?: string;
        signed_by_status?: 'pending' | 'reject' | 'approve' | null;
        signed_date?: string;
        acknowledged_by?: string;
        acknowledged_by_date?: string;
        acknowledged_by_status?: 'pending' | 'reject' | 'approve' | null;
        acknowledged_date?: string;
        create_by?: string;
        update_by?: string;
        created_at: string;
        updated_at: string;
        deleted_at?: string | null;
        items?: Array<{
            item: string;
            description: string;
            need_asset_code_registration?: boolean | number | string | null;
            asset_code?: string | null;
            quantity: number;
            unit_price: number;
            amount: number;
        }> | null;
        discount?: number;
        [key: string]: any;
    };
}

// Interfaces for purchase orders page API
export interface PurchaseOrdersPageRequest {
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

export interface PurchaseOrderRow {
    id: string;
    poNo?: string;
    subject?: string;
    company: string;
    to: string;
    requisitionDate: Date | string;
    status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'DELIVERED' | 'COMPLETED';
    grandTotal: number;
    currency?: string;
    from?: string;
    quotationNo?: string;
    deliveryDate?: string;
    paymentTerm?: string;
    // Workflow fields
    purchaseRequestBy?: string | null;
    purchaseRequestByStatus?: 'pending' | 'reject' | 'approve' | null;
    verifiedBy?: string | null;
    verifiedByStatus?: 'pending' | 'reject' | 'approve' | null;
    approvedBy?: string | null;
    approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
    circ?: string | null;
    circStatus?: 'pending' | 'reject' | 'approve' | null;
    signedBy?: string | null;
    signedByStatus?: 'pending' | 'reject' | 'approve' | null;
    acknowledgedBy?: string | null;
    acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
    createdBy?: string | null;
}

export interface PurchaseOrdersPageResponse {
    currentPage: number;
    data: PurchaseOrderRow[];
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
    companyOptions: string[];
}

interface PurchaseOrdersPageApiResponse {
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
        company_options?: string[];
    };
}
