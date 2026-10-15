export const CATEGORIES = ['hardware', 'network', 'software', 'account-access'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];
export const ACTIVE = ['open', 'in-progress'];
export const PRIORITY_ORDER = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";
export const NEXT_STATUS = { open: 'in-progress', 'in-progress': 'resolved', resolved: 'closed' };
export const SLA_HOURS = { urgent: 1, high: 4, medium: 24, low: 72 };
