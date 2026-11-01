import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface CommitteeOption {
    id: number;
    name: string;
    memberCount: number;
}

export interface PositionOption {
    id: number;
    name: string;
}

export interface DepartmentOption {
    id: number;
    name: string;
}

@Injectable({
    providedIn: 'root',
})
export class CommitteeDataService {
    // ข้อมูล mock สำหรับใช้งาน dropdown ชั่วคราว
    private readonly committees: CommitteeOption[] = [
        { id: 1, name: 'Technical Review Committee', memberCount: 5 },
        { id: 2, name: 'Sub-Consultant Evaluation Committee', memberCount: 3 },
    ];

    private readonly positions: PositionOption[] = [
        { id: 1, name: 'Director' },
        { id: 2, name: 'Project Manager' },
        { id: 3, name: 'Engineer' },
    ];

    private readonly departments: DepartmentOption[] = [
        { id: 1, name: 'Structure' },
        { id: 2, name: 'Facade' },
        { id: 3, name: 'MEP' },
        { id: 4, name: 'Lighting' },
    ];

    getCommittees(): Observable<CommitteeOption[]> {
        return of(this.committees);
    }

    getPositions(): Observable<PositionOption[]> {
        return of(this.positions);
    }

    getDepartments(): Observable<DepartmentOption[]> {
        return of(this.departments);
    }
}


