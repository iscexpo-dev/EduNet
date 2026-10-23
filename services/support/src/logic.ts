/**
 * Help-centre and support desk rules: SLA targets, ticket workflow, crisis
 * detection and resource ranking. Pure functions so policy changes are
 * reviewable and testable without a database.
 */

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

export const SLA_MINUTES: Record<TicketPriority, number> = {
  urgent: 60,
  high: 4 * 60,
  normal: 24 * 60,
  low: 72 * 60,
};

export function slaDueAt(createdAt: Date, priority: TicketPriority): Date {
  return new Date(createdAt.getTime() + SLA_MINUTES[priority] * 60_000);
}

export function isSlaBreached(ticket: { slaDueAt: Date | null; status: TicketStatus }, now = new Date()): boolean {
  if (!ticket.slaDueAt) return false;
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false;
  return now.getTime() > ticket.slaDueAt.getTime();
}

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['pending', 'resolved', 'closed'],
  pending: ['open', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: ['open'],
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextPriority(current: TicketPriority): TicketPriority {
  if (current === 'low') return 'normal';
  if (current === 'normal') return 'high';
  return 'urgent';
}

/**
 * Escalation ladder: repeated breaches or explicit requests raise priority.
 * Returns the priority to apply and whether it changed.
 */
export function escalatePriority(
  current: TicketPriority,
  input: { breached?: boolean; requesterEscalated?: boolean },
): { priority: TicketPriority; changed: boolean } {
  if (!input.breached && !input.requesterEscalated) return { priority: current, changed: false };
  const priority = nextPriority(current);
  return { priority, changed: priority !== current };
}

const CRISIS_TERMS = [
  'suicide',
  'kill myself',
  'self harm',
  'self-harm',
  'hurt myself',
  'end my life',
  'want to die',
  'abuse',
  'being abused',
  'unsafe at home',
];

/**
 * Conservative crisis detection used only to route a ticket to a human
 * counsellor urgently; it is not a diagnostic tool and must not auto-reply.
 */
export function detectCrisis(text: string): { crisis: boolean; matched: string[] } {
  const normalised = text.toLowerCase();
  const matched = CRISIS_TERMS.filter((term) => normalised.includes(term));
  return { crisis: matched.length > 0, matched };
}

export function classifyTicket(input: { subject: string; description: string }): {
  category: string;
  priority: TicketPriority;
  crisis: boolean;
} {
  const text = `${input.subject} ${input.description}`.toLowerCase();
  const crisis = detectCrisis(text).crisis;

  let category = 'general';
  if (/\b(password|login|sign in|account|verify)\b/.test(text)) category = 'account';
  else if (/\b(billing|payment|fee|invoice|refund)\b/.test(text)) category = 'billing';
  else if (/\b(bug|error|crash|broken|not working)\b/.test(text)) category = 'technical';
  else if (/\b(course|lesson|assignment|grade|exam)\b/.test(text)) category = 'academic';
  else if (/\b(harass|bully|threat|abuse)\b/.test(text)) category = 'safety';

  let priority: TicketPriority = 'normal';
  if (crisis || category === 'safety') priority = 'urgent';
  else if (/\b(urgent|asap|immediately|tomorrow|deadline)\b/.test(text)) priority = 'high';
  else if (/\b(later|whenever|no rush)\b/.test(text)) priority = 'low';

  return { category, priority, crisis };
}

// ---------------------------------------------------------------------------
// Resource search
// ---------------------------------------------------------------------------

export interface SupportResource {
  id: string;
  slug: string;
  title: string;
  category: string;
  body: string;
  locale: string;
}

/**
 * Lightweight keyword ranking for the help centre. Title matches outrank body
 * matches; exact phrase matches get a bonus. Ties fall back to id for stability.
 */
export function searchResources(
  resources: readonly SupportResource[],
  query: string,
  locale?: string,
): SupportResource[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return [...resources].filter((resource) => !locale || resource.locale === locale);

  const scored = resources
    .filter((resource) => !locale || resource.locale === locale)
    .map((resource) => {
      const title = resource.title.toLowerCase();
      const body = resource.body.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 5;
        if (body.includes(term)) score += 1;
      }
      if (title.includes(query.toLowerCase())) score += 10;
      return { resource, score };
    })
    .filter((entry) => entry.score > 0);

  return scored
    .sort((a, b) => b.score - a.score || a.resource.id.localeCompare(b.resource.id))
    .map((entry) => entry.resource);
}
