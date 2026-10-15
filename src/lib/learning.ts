import { request } from "./api";
export type PracticeAttempt = {
  id: string;
  target: string;
  candidate: string | null;
  outcome: "match" | "different" | "uncertain";
  modelSource: "initial" | "personal";
  createdAt?: string;
};
export function practiceOutcome(
  target: string,
  candidate: string | null,
): PracticeAttempt["outcome"] {
  return candidate === null
    ? "uncertain"
    : target === candidate
      ? "match"
      : "different";
}
export const loadPracticeHistory = () =>
  request<PracticeAttempt[]>("/practice");
export const savePracticeAttempt = (attempt: PracticeAttempt) =>
  request<PracticeAttempt>("/practice", "POST", attempt);
