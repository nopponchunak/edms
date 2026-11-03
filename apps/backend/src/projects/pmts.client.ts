import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What the sync needs from a PMTS project (see PMTS_INTEGRATION_API_USAGE_GUIDE_TH.md). */
export interface PmtsProject {
  id: string;
  code: string;
  name: string;
  status: string | null;
  parentCode: string | null;
  updatedAt: string | null;
}

export interface PmtsPage {
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  projects: PmtsProject[];
}

export interface PmtsSource {
  isConfigured(): boolean;
  fetchProjects(page: number, pageSize: number, updatedSince: string | null): Promise<PmtsPage>;
}

const DEFAULT_BASE_URL = 'https://pmts.meinhardt.net/api/integration/v1';
/** PMTS can take a while to answer a page; the sync runs in the background, so wait generously. */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Read-only client for the PMTS Integration API. The key stays on the server: it comes from PMTS_API_KEY, or else from
 * the client named EDMS in PMTS_PROJECT_API_CLIENTS. It is never logged or sent to the browser.
 */
@Injectable()
export class PmtsClient implements PmtsSource {
  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('PMTS_BASE_URL')?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private get apiKey(): string | null {
    const direct = this.config.get<string>('PMTS_API_KEY')?.trim();
    if (direct) return direct;
    try {
      const clients = JSON.parse(this.config.get<string>('PMTS_PROJECT_API_CLIENTS') ?? '[]') as { name?: string; key?: string }[];
      return (clients.find((c) => c.name === 'EDMS') ?? clients[0])?.key ?? null;
    } catch {
      return null;
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetchProjects(page: number, pageSize: number, updatedSince: string | null): Promise<PmtsPage> {
    const key = this.apiKey;
    if (!key) throw new Error('PMTS API key is not configured (PMTS_API_KEY).');
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const company = this.config.get<string>('PMTS_COMPANY')?.trim();
    if (company) params.set('company', company);
    if (updatedSince) params.set('updatedSince', updatedSince);

    const response = await fetch(`${this.baseUrl}/projects?${params}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(`PMTS answered ${response.status}${body?.message ? `: ${body.message}` : ''}`);
    }
    return (await response.json()) as PmtsPage;
  }
}
