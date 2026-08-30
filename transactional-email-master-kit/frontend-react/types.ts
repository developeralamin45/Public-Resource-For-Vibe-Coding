/**
 * Shared contract between the panels and your backend.
 *
 * The panels never import axios — you hand them any client with `.get/.post/
 * .put/.delete` returning `{ data }`. That keeps the kit usable with axios, a
 * fetch wrapper, or your project's own API helper with its auth interceptors
 * already attached (which is what you almost always want in an admin panel).
 */

export interface HttpClient {
  get: (url: string, config?: any) => Promise<{ data: any }>;
  post: (url: string, body?: any, config?: any) => Promise<{ data: any }>;
  put: (url: string, body?: any, config?: any) => Promise<{ data: any }>;
  delete: (url: string, config?: any) => Promise<{ data: any }>;
}

/**
 * Every endpoint the panels call. Defaults match routes.example.php; override
 * whichever you mount elsewhere.
 */
export interface EmailEndpoints {
  settings: string;       // GET / POST
  analytics: string;      // GET
  logs: string;           // GET  ?status=&type=&search=&per_page=
  test: string;           // POST { email }
  templates: string;      // GET  → { preset, events[], groups[], orphans[] }
  template: string;       // PUT  `${template}/${eventKey}`
  outbox: string;         // GET / DELETE `${outbox}/${id}`
}

export const DEFAULT_ENDPOINTS: EmailEndpoints = {
  settings:  "/admin/email/settings",
  analytics: "/admin/email/analytics",
  logs:      "/admin/email/logs",
  test:      "/admin/email/test",
  templates: "/admin/email/templates",
  template:  "/admin/email/templates",
  outbox:    "/admin/email/outbox",
};

export interface MailStatus {
  /** Which path a send would take right now. */
  mode: "gmail_api" | "smtp";
  from: string;
  host: string | null;
  /** False when credentials are missing — nothing will send. */
  ready: boolean;
}

export interface EmailSettings {
  smtp_from_address: string;
  smtp_from_name: string;

  smtp_host: string;
  smtp_port: string;
  smtp_username: string;

  /**
   * Secrets are never sent back to the browser — the API returns only whether
   * one is stored. An empty input on save means "keep what you have".
   */
  smtp_password_set: boolean;
  gmail_client_secret_set: boolean;
  gmail_refresh_token_set: boolean;

  gmail_client_id: string;

  email_quiet_enabled: boolean;
  email_quiet_start: string;   // "HH:MM"
  email_quiet_end: string;     // "HH:MM"
  email_timezone: string;
  email_dedupe_minutes: number;

  status: MailStatus;
}

export interface EmailAnalytics {
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
  outbox_count: number;
  success_rate: number;
  top_events: { type: string; c: number }[];
  period: string;
}

export interface EmailEvent {
  event_key: string;
  label: string;
  group: string;
  audience: "user" | "admin";
  /** The recipient is waiting on it (OTP, password reset). */
  critical: boolean;
  /** { placeholder: description } — rendered as click-to-insert chips. */
  variables: Record<string, string>;

  subject: string;
  body: string;
  enabled: boolean;

  /** A row exists in email_templates (i.e. the seeder has run). */
  saved: boolean;
  /** Wording differs from the catalogue default. */
  edited: boolean;
  defaults: { subject: string; body: string };
}

export interface TemplatesResponse {
  preset: string;
  events: EmailEvent[];
  groups: string[];
  /** Saved rows whose event no longer exists in config. */
  orphans: string[];
}

export interface QueuedEmail {
  id: number;
  event_key: string;
  to_email: string;
  subject: string;
  send_after: string;
  attempts: number;
  last_error: string | null;
}
