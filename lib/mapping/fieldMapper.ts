import type {
  ColumnMapping,
  ContactField,
  FieldMatch,
  ContactFieldType,
} from "./types";
import { FIELD_SYNONYMS, normalizeString } from "./synonymDictionary";
import {
  validateDatePattern,
  validateEmailPattern,
  validateNumberPattern,
  validatePhonePattern,
} from "./patternValidators";

type ScoreContext = {
  baseReason: string | null;
  baseScore: number;
  patternScore: number;
};

const HIGH_CONFIDENCE_THRESHOLD = 75;
const MEDIUM_CONFIDENCE_THRESHOLD = 50;
const STRONG_PATTERN_THRESHOLD = 0.8;
const WEAK_PATTERN_THRESHOLD = 0.3;

const FULL_NAME_TOKENS = ["full name", "fullname"];

/**
 * Core field mapping engine.
 * Analyses CSV columns and suggests system field mappings based on:
 * - Header similarity
 * - Synonym matching
 * - Data pattern analysis
 */
export class FieldMapper {
  private readonly systemFields: ContactField[];

  constructor(systemFields: ContactField[]) {
    this.systemFields = systemFields;
  }

  /**
   * Main mapping function.
   * Analyses CSV columns and suggests system field mappings.
   */
  public mapColumns(headers: string[], sampleData: string[][]): ColumnMapping[] {
    const autoAssignedIds = new Set<string>();

    return headers.map((header, index) => {
      const columnData = sampleData.map((row) => row[index] ?? "");
      const matches = this.findMatches(header, columnData);
      const bestMatch = matches[0];

      let selectedField: string | null = null;
      if (
        bestMatch &&
        bestMatch.confidence === "high" &&
        !autoAssignedIds.has(bestMatch.systemFieldId)
      ) {
        selectedField = bestMatch.systemFieldId;
        autoAssignedIds.add(bestMatch.systemFieldId);
      }

      return {
        csvColumn: header,
        csvIndex: index,
        selectedField,
        suggestedMatches: matches.slice(0, 3),
        isCustomField: matches.length === 0 || matches[0].score < 40,
        sampleData: columnData.slice(0, 5),
      };
    });
  }

  private findMatches(header: string, columnData: string[]): FieldMatch[] {
    const matches: FieldMatch[] = [];

    for (const field of this.systemFields) {
      const match = this.createMatch(header, columnData, field);
      if (match) {
        matches.push(match);
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  private createMatch(
    header: string,
    columnData: string[],
    field: ContactField
  ): FieldMatch | null {
    const normalizedHeader = normalizeString(header);

    if (
      FULL_NAME_TOKENS.some((token) => normalizedHeader.includes(token)) &&
      (field.id === "firstName" || field.id === "lastName")
    ) {
      return null;
    }

    const { baseReason, baseScore, patternScore } = this.calculateScoreContext(
      header,
      columnData,
      field
    );

    if (baseScore <= 0) {
      return null;
    }

    const score = Math.floor(baseScore);
    return {
      systemFieldId: field.id,
      systemFieldLabel: field.label,
      confidence: this.getConfidence(score),
      score,
      matchReason:
        baseReason ??
        this.getPatternReason(field.type, patternScore) ??
        "Possible match",
    };
  }

  private calculateScoreContext(
    header: string,
    columnData: string[],
    field: ContactField
  ): ScoreContext {
    const normalizedHeader = normalizeString(header);
    const normalizedLabel = normalizeString(field.label);

    let score = 0;
    let reason: string | null = null;

    if (!normalizedHeader) {
      return { baseReason: null, baseScore: 0, patternScore: 0 };
    }

    if (normalizedHeader === normalizedLabel) {
      score = 100;
      reason = "Exact header match";
    } else if (
      normalizedHeader.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedHeader)
    ) {
      score = 80;
      reason = "Similar header match";
    } else {
      const synonymScore = this.getSynonymMatchScore(
        normalizedHeader,
        field.id
      );
      if (synonymScore) {
        score = synonymScore.score;
        reason = synonymScore.reason;
      }
    }

    if (score === 0) {
      const similarity = this.calculateStringSimilarity(
        normalizedHeader,
        normalizedLabel
      );
      if (similarity > 0.6) {
        score = Math.floor(similarity * 60);
        reason = "Similar header name";
      }
    }

    const patternScore = this.validateDataPattern(columnData, field.type);

    if (patternScore > STRONG_PATTERN_THRESHOLD) {
      if (score >= 40) {
        score = Math.min(100, score + 20);
      } else {
        score = 50;
        reason = this.getPatternReason(field.type, patternScore);
      }
    } else if (score >= MEDIUM_CONFIDENCE_THRESHOLD && patternScore > 0) {
      if (patternScore < WEAK_PATTERN_THRESHOLD) {
        score = Math.floor(score * 0.6);
      }
    }

    return { baseReason: reason, baseScore: score, patternScore };
  }

  private getSynonymMatchScore(
    normalizedHeader: string,
    fieldId: string
  ):
    | {
        score: number;
        reason: string;
      }
    | null {
    const synonyms = FIELD_SYNONYMS[fieldId] ?? [];

    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeString(synonym);
      if (normalizedSynonym === normalizedHeader) {
        return { score: 75, reason: `Synonym match: "${synonym}"` };
      }
      if (
        normalizedHeader.includes(normalizedSynonym) ||
        normalizedSynonym.includes(normalizedHeader)
      ) {
        return { score: 65, reason: `Synonym match: "${synonym}"` };
      }
    }

    return null;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1.length || !str2.length) return 0;

    const bigrams1 = this.getBigrams(str1);
    const bigrams2 = this.getBigrams(str2);

    if (bigrams1.length === 0 || bigrams2.length === 0) {
      return 0;
    }

    const intersection = bigrams1.filter((bigram) =>
      bigrams2.includes(bigram)
    );
    return (2 * intersection.length) / (bigrams1.length + bigrams2.length);
  }

  private getBigrams(value: string): string[] {
    const bigrams: string[] = [];
    for (let index = 0; index < value.length - 1; index += 1) {
      bigrams.push(value.substring(index, index + 2));
    }
    return bigrams;
  }

  private validateDataPattern(
    data: string[],
    fieldType: ContactFieldType
  ): number {
    const sample = data.slice(0, 100);

    switch (fieldType) {
      case "email":
        return validateEmailPattern(sample);
      case "phone":
        return validatePhonePattern(sample);
      case "datetime":
        return validateDatePattern(sample);
      case "number":
        return validateNumberPattern(sample);
      default:
        return 0.5;
    }
  }

  private getConfidence(score: number): "high" | "medium" | "low" {
    if (score >= HIGH_CONFIDENCE_THRESHOLD) return "high";
    if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return "medium";
    return "low";
  }

  private getPatternReason(
    type: ContactFieldType,
    patternScore: number
  ): string | null {
    if (patternScore <= 0) {
      return null;
    }

    const percent = Math.floor(patternScore * 100);
    switch (type) {
      case "email":
        return `Strong email pattern (${percent}% match)`;
      case "phone":
        return `Strong phone pattern (${percent}% match)`;
      case "datetime":
        return `Strong date pattern (${percent}% match)`;
      case "number":
        return `Strong numeric pattern (${percent}% match)`;
      default:
        return null;
    }
  }
}
