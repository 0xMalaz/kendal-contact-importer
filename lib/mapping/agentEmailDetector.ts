import { normalizeString } from "./synonymDictionary";
import { validateEmailPattern } from "./patternValidators";

export type AgentEmailDetectionResult = {
  header: string;
  index: number;
  score: number;
  headerScore: number;
  patternScore: number;
};

const EXACT_HEADER_MATCHES = [
  "agent email",
  "agentemail",
  "agent e mail",
  "agent_email",
  "assigned agent email",
  "assigned agent",
  "assigned_to_email",
  "assigned_to_agent",
  "assigned email",
  "agent contact email",
  "agentcontactemail",
  "advisor email",
  "advisor_email",
  "representative email",
  "rep email",
  "sales agent email",
  "account owner email",
];

const AGENT_TOKENS = [
  "agent",
  "advisor",
  "rep",
  "representative",
  "owner",
  "assignee",
  "assigned",
  "manager",
  "realtor",
  "broker",
];

const EMAIL_TOKENS = ["email", "mail", "e", "address"];

const MINIMUM_CONFIDENCE = 45;

function tokenize(header: string): string[] {
  return header
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreHeader(header: string): number {
  const normalized = normalizeString(header);
  if (!normalized.length) {
    return 0;
  }

  if (EXACT_HEADER_MATCHES.includes(normalized)) {
    return 95;
  }

  const tokens = tokenize(header);
  const hasAgentToken = tokens.some((token) => AGENT_TOKENS.includes(token));
  const hasEmailToken = tokens.some((token) => EMAIL_TOKENS.includes(token));

  if (hasAgentToken && hasEmailToken) {
    return 85;
  }

  if (hasAgentToken && normalized.includes("mail")) {
    return 75;
  }

  if (normalized.includes("assigned") && normalized.includes("agent")) {
    return 70;
  }

  if (hasAgentToken) {
    return 55;
  }

  return 0;
}

function getColumnSamples(rows: string[][], columnIndex: number): string[] {
  return rows
    .map((row) => {
      if (!Array.isArray(row)) {
        return "";
      }
      const value = row[columnIndex];
      if (typeof value === "string") {
        return value.trim();
      }
      if (value === null || value === undefined) {
        return "";
      }
      return String(value).trim();
    })
    .filter((value) => value.length > 0);
}

export function detectAgentEmailColumn(
  headers: string[],
  rowMatrix: string[][]
): AgentEmailDetectionResult | null {
  if (!Array.isArray(headers) || headers.length === 0) {
    return null;
  }

  let bestMatch: AgentEmailDetectionResult | null = null;

  headers.forEach((header, index) => {
    if (typeof header !== "string" || !header.trim().length) {
      return;
    }

    const headerScore = scoreHeader(header);
    const samples = getColumnSamples(rowMatrix, index);
    const patternScore = samples.length ? validateEmailPattern(samples) : 0;
    const combinedScore = Math.round(
      headerScore * 0.7 + patternScore * 100 * 0.3
    );

    if (combinedScore < MINIMUM_CONFIDENCE) {
      return;
    }

    if (!bestMatch || combinedScore > bestMatch.score) {
      bestMatch = {
        header,
        index,
        score: combinedScore,
        headerScore,
        patternScore,
      };
    }
  });

  return bestMatch;
}

export function objectRowsToMatrix(
  headers: string[],
  rows: Record<string, string>[]
): string[][] {
  return rows.map((row) =>
    headers.map((header) => {
      const value = row?.[header];
      if (typeof value === "string") {
        return value;
      }
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    })
  );
}
