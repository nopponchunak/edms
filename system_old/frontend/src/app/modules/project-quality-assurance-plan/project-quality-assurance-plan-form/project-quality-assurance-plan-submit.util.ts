export const PQP_SYSTEM_ERROR_MESSAGE =
  'The system could not save the Project Quality Plan. Please try again. If the problem continues, contact support.';

export function buildPqpRequiredFieldMessage(labels: string[]): string {
  return labels.length
    ? `Please fill in required fields: ${labels.join(', ')}`
    : 'Please review the highlighted fields before submitting.';
}

export function resolvePqpSubmitErrorMessage(error: any): string {
  const firstValidationError = Object.values(error?.error?.errors || {})
    .flat()
    .find((message) => typeof message === 'string') as string | undefined;

  if (Number(error?.status) === 422 && firstValidationError) {
    return firstValidationError;
  }

  if (Number(error?.status) === 0) {
    return 'Unable to connect to the system. Please check your connection and try again.';
  }

  if (Number(error?.status) >= 500) {
    return PQP_SYSTEM_ERROR_MESSAGE;
  }

  return firstValidationError
    || error?.error?.message
    || 'The Project Quality Plan could not be saved. Please try again.';
}
