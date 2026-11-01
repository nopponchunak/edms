import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfig } from '../config/api.config';
import { ApiService } from './api.service';

export type ProjectReviewDiscussionType =
    | 'concept_design_review'
    | 'schematic_design_review'
    | 'submission_review'
    | 'tender_review'
    | 'tender_csa_review'
    | 'tender_csa_verification'
    | 'tender_mep_review'
    | 'tender_mep_verification'
    | 'construction_validation'
    | 'engineering_audit_review'
    | 'value_engineering_review'
    | 'leed_review';

export interface DiscussionAttachment {
    type: 'file' | 'link';
    name: string;
    path: string;
}

export interface DiscussionReply {
    id: number;
    author: string;
    author_code?: string | null;
    author_name?: string | null;
    author_role: 'reviewer' | 'team';
    workflow_role?: string | null;
    date: string;
    message: string;
    attachments: DiscussionAttachment[];
}

export interface DiscussionTopic {
    id: number;
    review_type: ProjectReviewDiscussionType;
    review_id: number;
    document_key?: string | null;
    document_label?: string | null;
    topic_no: number;
    date: string;
    author: string;
    author_code?: string | null;
    author_name?: string | null;
    author_role: 'reviewer' | 'team';
    workflow_role?: string | null;
    comment: string;
    message: string;
    attachments: DiscussionAttachment[];
    status: 'Open' | 'Pending' | 'Resolved';
    status_key: 'open' | 'pending' | 'resolved';
    replies: DiscussionReply[];
}

export interface DiscussionDocumentOption {
    key: string;
    label: string;
}

export interface DiscussionParticipant {
    code: string;
    name: string;
    workflowRole: string;
    authorRole: 'reviewer' | 'team';
}

@Injectable({ providedIn: 'root' })
export class ProjectReviewDiscussionService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig,
        private apiService: ApiService
    ) {}

    listTopics(reviewType: ProjectReviewDiscussionType, reviewId: string | number): Observable<DiscussionTopic[]> {
        return this.http
            .get<any>(
                this.apiConfig.buildUrl(
                    `api/project_review_discussions/${reviewType}/${reviewId}/topics`
                )
            )
            .pipe(map((response) => this.unwrapList<DiscussionTopic>(response)));
    }

    hasDiscussionMessages(reviewType: ProjectReviewDiscussionType, reviewId: string | number): Observable<boolean> {
        return this.listTopics(reviewType, reviewId).pipe(
            map((topics) =>
                topics.some((topic) => {
                    const topicText = [topic.comment, topic.message].some((value) =>
                        String(value || '').trim().length > 0
                    );
                    const replyText = (topic.replies || []).some((reply) =>
                        String(reply.message || '').trim().length > 0
                    );

                    return topicText || replyText;
                })
            )
        );
    }

    createTopic(reviewType: ProjectReviewDiscussionType, reviewId: string | number, payload: any): Observable<DiscussionTopic> {
        return this.http
            .post<any>(
                this.apiConfig.buildUrl(
                    `api/project_review_discussions/${reviewType}/${reviewId}/topics`
                ),
                payload
            )
            .pipe(map((response) => this.unwrapItem<DiscussionTopic>(response)));
    }

    updateTopic(topicId: number, payload: any): Observable<DiscussionTopic> {
        return this.http
            .put<any>(
                this.apiConfig.buildUrl(`api/project_review_discussion_topics/${topicId}`),
                payload
            )
            .pipe(map((response) => this.unwrapItem<DiscussionTopic>(response)));
    }

    deleteTopic(topicId: number): Observable<any> {
        return this.http.delete(
            this.apiConfig.buildUrl(`api/project_review_discussion_topics/${topicId}`)
        );
    }

    createReply(topicId: number, payload: any): Observable<DiscussionReply> {
        return this.http
            .post<any>(
                this.apiConfig.buildUrl(`api/project_review_discussion_topics/${topicId}/replies`),
                payload
            )
            .pipe(map((response) => this.unwrapItem<DiscussionReply>(response)));
    }

    updateReply(replyId: number, payload: any): Observable<DiscussionReply> {
        return this.http
            .put<any>(
                this.apiConfig.buildUrl(`api/project_review_discussion_replies/${replyId}`),
                payload
            )
            .pipe(map((response) => this.unwrapItem<DiscussionReply>(response)));
    }

    deleteReply(replyId: number): Observable<any> {
        return this.http.delete(
            this.apiConfig.buildUrl(`api/project_review_discussion_replies/${replyId}`)
        );
    }

    uploadFiles(files: File[]): Observable<string[]> {
        return this.apiService
            .uploadMultipleFilesToApi(files, 'uploads/project-review-discussions/', 'Y')
            .pipe(map((response) => this.unwrapList<string>(response)));
    }

    private unwrapItem<T>(response: any): T {
        return (response?.data ?? response) as T;
    }

    private unwrapList<T>(response: any): T[] {
        const data = response?.data ?? response;

        if (Array.isArray(data)) {
            return data as T[];
        }

        if (Array.isArray(data?.data)) {
            return data.data as T[];
        }

        return [];
    }
}
