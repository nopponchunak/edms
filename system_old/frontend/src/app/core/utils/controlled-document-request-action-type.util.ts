export const CONTROLLED_DOCUMENT_REQUEST_ACTION_TYPES = [
    'reviewed_by_status',
    'approved_by_status',
    'acknowledged_by_status_2',
] as const;

export type ControlledDocumentRequestActionType =
    (typeof CONTROLLED_DOCUMENT_REQUEST_ACTION_TYPES)[number];

export function isControlledDocumentRequestActionType(
    value: string | null | undefined
): value is ControlledDocumentRequestActionType {
    return CONTROLLED_DOCUMENT_REQUEST_ACTION_TYPES.includes(
        value as ControlledDocumentRequestActionType
    );
}
