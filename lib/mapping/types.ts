export interface FieldMatch {
  systemFieldId: string;
  systemFieldLabel: string;
  confidence: "high" | "medium" | "low";
  score: number;
  matchReason: string;
}

export interface ColumnMapping {
  csvColumn: string;
  csvIndex: number;
  selectedField: string | null;
  suggestedMatches: FieldMatch[];
  isCustomField: boolean;
  sampleData: string[];
}

export type ContactFieldType = "text" | "number" | "phone" | "email" | "datetime";

export interface ContactField {
  id: string;
  label: string;
  type: ContactFieldType;
  core: boolean;
}
