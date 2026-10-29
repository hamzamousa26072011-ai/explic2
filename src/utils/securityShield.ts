import { SecurityThreatIncident } from '../types';

const SQLI_PATTERNS = [
  /(\b(SELECT|UNION|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*\b(FROM|INTO|TABLE|DATABASE)\b)/i,
  /('|\bOR\b.*=.*)\s*--\s|(;\s*DROP\s|'\s*OR\s+'?1'?\s*=\s*'?1)/i,
];

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /javascript\s*:/i,
  /on(error|load|mouseover|click|focus)\s*=/i,
  /<iframe\b/i,
];

const PROTO_PATTERNS = [
  /__proto__/i,
  /constructor\s*\[\s*['"]prototype['"]\s*\]/i,
  /prototype\s*\[\s*['"]/i,
];

export function generateIncidentId(): string {
  const randomHex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join('');
  return `ENG-SEC-${randomHex}`;
}

export function inspectPayloadForThreats(
  input: unknown,
  sourceAction = 'user-input'
): SecurityThreatIncident | null {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  if (!serialized) return null;

  for (const regex of PROTO_PATTERNS) {
    if (regex.test(serialized)) {
      return {
        incidentId: generateIncidentId(),
        timestamp: new Date().toISOString(),
        vectorType: 'PROTOTYPE_POLLUTION',
        payloadSnippet: serialized.slice(0, 120),
        sourceAction,
        quarantined: true,
      };
    }
  }

  for (const regex of XSS_PATTERNS) {
    if (regex.test(serialized)) {
      return {
        incidentId: generateIncidentId(),
        timestamp: new Date().toISOString(),
        vectorType: 'XSS_PAYLOAD',
        payloadSnippet: serialized.slice(0, 120),
        sourceAction,
        quarantined: true,
      };
    }
  }

  for (const regex of SQLI_PATTERNS) {
    if (regex.test(serialized)) {
      return {
        incidentId: generateIncidentId(),
        timestamp: new Date().toISOString(),
        vectorType: 'SQL_INJECTION',
        payloadSnippet: serialized.slice(0, 120),
        sourceAction,
        quarantined: true,
      };
    }
  }

  return null;
}

export async function reportThreatIncident(incident: SecurityThreatIncident): Promise<void> {
  try {
    await fetch('/api/security/threat-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incident),
    });
  } catch {
    // Fail-safe silent fallback when offline
  }
}
