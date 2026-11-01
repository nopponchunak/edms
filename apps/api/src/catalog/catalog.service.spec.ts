import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const service = new CatalogService();

  it('returns every module for the legacy applications.view permission', () => {
    expect(service.list(undefined, { permissions: ['applications.view'] }).total).toBe(14);
  });

  it('returns every module for a super administrator', () => {
    expect(service.list(undefined, { roles: ['super_admin'], permissions: [] }).total).toBe(14);
  });

  it('returns only the module covered by a module view permission', () => {
    const result = service.list(undefined, { permissions: ['gift-hospitality-offering.view'] });

    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe('gift-offering');
  });

  it('does not expose a module for create-only permission', () => {
    expect(service.list(undefined, { permissions: ['gift-hospitality-offering.create'] }).total).toBe(0);
  });

  it('applies category filtering after permission filtering', () => {
    const principal = {
      permissions: ['expenses-claim.view', 'gift-hospitality-offering.view'],
    };

    expect(service.list('Finance', principal).data.map((module) => module.id)).toEqual(['expenses']);
    expect(service.categories(principal)).toEqual([
      { name: 'Compliance', count: 1 },
      { name: 'Finance', count: 1 },
    ]);
  });
});
