import { Injectable } from '@angular/core';
import { FuseMockApiService, FuseMockApiUtils } from '@fuse/lib/mock-api';
import { subConsultantTypes as subConsultantTypesData } from 'app/mock-api/apps/settings/data';
import { cloneDeep } from 'lodash-es';

@Injectable({ providedIn: 'root' })
export class SettingsMockApi {
    private _subConsultantTypes: any[] = subConsultantTypesData;

    /**
     * Constructor
     */
    constructor(private _fuseMockApiService: FuseMockApiService) {
        // Register Mock API handlers
        this.registerHandlers();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Register Mock API handlers
     */
    registerHandlers(): void {
        // -----------------------------------------------------------------------------------------------------
        // @ Sub-Consultant Types - GET
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService.onGet('api/settings/sub-consultant-types').reply(() => {
            // Clone the types
            const types = cloneDeep(this._subConsultantTypes);

            // Sort by name
            types.sort((a, b) => a.name.localeCompare(b.name));

            // Return the response
            return [200, types];
        });

        // -----------------------------------------------------------------------------------------------------
        // @ Sub-Consultant Type - POST (Create new type)
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/settings/sub-consultant-types')
            .reply(({ request }) => {
                // Get the type name from request body
                const typeName = request.body.name;

                // Check if type already exists
                const existingType = this._subConsultantTypes.find(
                    (type) => type.name.toLowerCase() === typeName.toLowerCase()
                );

                if (existingType) {
                    // Return existing type if it already exists
                    return [200, cloneDeep(existingType)];
                }

                // Generate a new type
                const newType = {
                    id: FuseMockApiUtils.guid(),
                    name: typeName,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                // Add the new type
                this._subConsultantTypes.push(newType);

                // Sort by name
                this._subConsultantTypes.sort((a, b) => a.name.localeCompare(b.name));

                // Return the response
                return [201, cloneDeep(newType)];
            });

        // -----------------------------------------------------------------------------------------------------
        // @ Sub-Consultants - GET (List all)
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService.onGet('api/settings/sub-consultants').reply(() => {
            // Return empty array for now (can be extended later)
            return [200, []];
        });

        // -----------------------------------------------------------------------------------------------------
        // @ Sub-Consultant - GET (Get by ID)
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onGet('api/settings/sub-consultants')
            .reply(({ request }) => {
                // Get the id from the params
                const id = request.params.get('id');

                // For now, return a mock response
                // In real implementation, this would fetch from database
                return [200, { id, message: 'Sub-Consultant not found in mock data' }];
            });

        // -----------------------------------------------------------------------------------------------------
        // @ Sub-Consultant - POST (Create new)
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPost('api/settings/sub-consultants')
            .reply(({ request }) => {
                // Get the sub-consultant data from request body
                const subConsultantData = cloneDeep(request.body);

                // Generate a new sub-consultant with ID and timestamps
                const newSubConsultant = {
                    id: FuseMockApiUtils.guid(),
                    ...subConsultantData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                // Log the request body for debugging (visible in network tab)
                console.log('Mock API - Creating Sub-Consultant:', newSubConsultant);

                // Return the response
                return [201, cloneDeep(newSubConsultant)];
            });

        // -----------------------------------------------------------------------------------------------------
        // @ Sub-Consultant - PATCH (Update existing)
        // -----------------------------------------------------------------------------------------------------
        this._fuseMockApiService
            .onPatch('api/settings/sub-consultants')
            .reply(({ request }) => {
                // Get the id and data from request body
                const id = request.body.id;
                const updateData = cloneDeep(request.body);

                // Remove id from update data
                delete updateData.id;

                // Generate updated sub-consultant
                const updatedSubConsultant = {
                    id: id,
                    ...updateData,
                    updatedAt: new Date().toISOString(),
                };

                // Log the request body for debugging
                console.log('Mock API - Updating Sub-Consultant:', updatedSubConsultant);

                // Return the response
                return [200, cloneDeep(updatedSubConsultant)];
            });
    }
}

