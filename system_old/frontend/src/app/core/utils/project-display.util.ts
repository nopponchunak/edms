export function formatProjectDisplay(item: any, separator = ' - ', emptyValue = ''): string {
    const projectCode = String(item?.project_code ?? item?.projectCode ?? '').trim();
    const projectName = String(item?.project_name ?? item?.projectName ?? '').trim();

    return [projectCode, projectName].filter(Boolean).join(separator) || emptyValue;
}
