import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PdfPeople } from '../pdf/pdf-blocks';

/** Name and employee code of a signer as they were when they signed (stored on the record). */
export type SignerSnapshot = Record<string, { name: string; code: string | null }> | null | undefined;

export interface DirectoryUser {
  username: string;
  displayName: string;
  code: string | null;
}

@Injectable({ providedIn: 'root' })
export class DirectoryService {
  private readonly http = inject(HttpClient);

  listUsers(query = ''): Observable<{ data: DirectoryUser[] }> {
    let params = new HttpParams();
    if (query.trim()) params = params.set('q', query.trim());
    return this.http.get<{ data: DirectoryUser[] }>(`${environment.apiBaseUrl}/directory/users`, { params });
  }

  resolvePeople(usernames: (string | null | undefined)[], snapshot?: SignerSnapshot): Observable<PdfPeople> {
    const unique = [...new Set(usernames.filter((u): u is string => !!u))];
    const saved = (username: string) => Object.entries(snapshot ?? {}).find(([key]) => key.toLowerCase() === username.toLowerCase())?.[1];
    const lookups = unique.map((username) => (saved(username) ? of(undefined) : this.listUsers(username).pipe(
      map((res) => res.data.find((u) => u.username.toLowerCase() === username.toLowerCase())),
      catchError(() => of(undefined)),
    )));
    if (!unique.length) return of({ byUsername: {} });
    return forkJoin(lookups).pipe(
      map((users) => ({
        byUsername: Object.fromEntries(unique.map((username, i) => {
          const kept = saved(username);
          return [username, kept ?? { name: users[i]?.displayName ?? username, code: users[i]?.code ?? null }];
        })),
      })),
    );
  }

  resolveNames(usernames: (string | null | undefined)[], snapshot?: SignerSnapshot): Observable<Record<string, string>> {
    const unique = [...new Set(usernames.filter((u): u is string => !!u))];
    const saved = (username: string) => Object.entries(snapshot ?? {}).find(([key]) => key.toLowerCase() === username.toLowerCase())?.[1];
    if (!unique.length) return of({});
    return forkJoin(unique.map((username) => (saved(username) ? of(undefined) : this.listUsers(username).pipe(
      map((res) => res.data.find((u) => u.username.toLowerCase() === username.toLowerCase())),
      catchError(() => of(undefined)),
    )))).pipe(
      map((matches) => Object.fromEntries(unique.map((username, i) => [username, saved(username)?.name ?? matches[i]?.displayName ?? username]))),
    );
  }
}
