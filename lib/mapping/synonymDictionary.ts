export const FIELD_SYNONYMS: Record<string, string[]> = {
  firstName: [
    "first",
    "fname",
    "given name",
    "forename",
    "first name",
    "given",
    "name first",
  ],
  lastName: [
    "last",
    "lname",
    "surname",
    "family name",
    "last name",
    "family",
    "name last",
  ],
  phone: [
    "mobile",
    "cell",
    "telephone",
    "contact number",
    "phone number",
    "mobile number",
    "cell phone",
    "phone no",
    "tel",
    "contact no",
  ],
  email: [
    "e-mail",
    "email address",
    "mail",
    "e mail",
    "email addr",
    "electronic mail",
  ],
  agentUid: [
    "agent",
    "assigned to",
    "owner",
    "sales rep",
    "agent email",
    "assigned agent",
    "account owner",
    "sales agent",
    "representative",
  ],
  createdOn: [
    "created",
    "date created",
    "created date",
    "creation date",
    "date added",
    "added on",
  ],
};

export function normalizeString(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_\-\s]+/g, " ")
    .replace(/[^\w\s]/g, "");
}
