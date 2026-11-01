import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface ExternalProject {
  id: number;
  code: string;
  name: string;
  status: string;
  active: boolean;
  proposal_contract_review_id?: number;
  proposalContractReviewId?: number;
  proposal_contract_review_project_id?: number | null;
  proposalContractReviewProjectId?: number | null;
  proposal_number?: string;
  proposalNumber?: string;
  project_number?: string;
  projectNumber?: string;
  project_no?: string;
  projectNo?: string;
  mt_project_no?: string;
  project_name?: string;
  projectName?: string;
  employee?: {
    firstname: string;
    lastname: string;
    email: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ExternalProjectService {
  constructor(private http: HttpClient, private apiConfig: ApiConfig) {}

  getProjects(search: string = '', limit: number = 20): Observable<ExternalProject[]> {
    let params = new HttpParams()
      .set('per_page', limit.toString())
      .set('has_project_number', '1');
    
    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<any>(this.apiConfig.buildUrl('api/proposal_project_references'), { params }).pipe(
      map((response) => this.extractRows(response).map((row) => this.toExternalProject(row))),
      catchError((error) => {
        console.error('Error fetching proposal project references:', error);
        return of([]);
      })
    );
  }

  getProjectById(id: number): Observable<ExternalProject | null> {
    const params = new HttpParams()
      .set('id', id.toString())
      .set('per_page', '1');

    return this.http.get<any>(this.apiConfig.buildUrl('api/proposal_project_references'), { params }).pipe(
      map((response) => {
        const rows = this.extractRows(response);
        return rows.length > 0 ? this.toExternalProject(rows[0]) : null;
      }),
      catchError((error) => {
        console.error('Error fetching proposal project reference by id:', error);
        return of(null);
      })
    );
  }

  private extractRows(response: any): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    if (Array.isArray(response?.items)) {
      return response.items;
    }

    return [];
  }

  private toExternalProject(row: any): ExternalProject {
    const projectNumber =
      row?.project_number ?? row?.projectNumber ?? row?.project_no ?? row?.projectNo ?? '';
    const projectName = row?.project_name ?? row?.projectName ?? '';
    const proposalContractReviewId =
      Number(row?.proposal_contract_review_id ?? row?.proposalContractReviewId ?? 0) || undefined;
    const proposalContractReviewProjectId =
      row?.proposal_contract_review_project_id ?? row?.proposalContractReviewProjectId ?? null;

    return {
      ...row,
      id: Number(row?.id ?? 0),
      code: String(projectNumber || ''),
      name: String(projectName || ''),
      status: String(row?.status ?? 'active'),
      active: String(row?.status ?? 'active').toLowerCase() !== 'inactive',
      proposal_contract_review_id: proposalContractReviewId,
      proposalContractReviewId,
      proposal_contract_review_project_id: proposalContractReviewProjectId,
      proposalContractReviewProjectId,
      proposal_number: row?.proposal_number ?? row?.proposalNumber ?? '',
      proposalNumber: row?.proposal_number ?? row?.proposalNumber ?? '',
      project_number: projectNumber,
      projectNumber: projectNumber,
      project_no: projectNumber,
      projectNo: projectNumber,
      mt_project_no: projectNumber,
      project_name: projectName,
      projectName: projectName,
    };
  }
}
