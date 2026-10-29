/**
 * Original, exploratory calibration stimuli. All variants share a canonical
 * fact set but have NOT yet been psychometrically matched for reading effort.
 * Never market these as a validated assessment.
 */
export type ComparisonId = "format" | "comparison" | "photosynthesis";
export interface ComparisonVariant {
  id: "a" | "b" | "c";
  title: string;
  text: string;
}
export interface ComparisonStimulus {
  id: ComparisonId;
  concept: string;
  canonicalFacts: readonly string[];
  variants: readonly ComparisonVariant[];
}
export const COMPARISON_STIMULI: Record<ComparisonId, ComparisonStimulus> = {
  format: {
    id: "format",
    concept: "HTTP request and response",
    canonicalFacts: [
      "A client sends a request to a server.",
      "The server processes that request.",
      "The server sends a response back to the client."
    ],
    variants: [
      {
        id: "a", title: "Prose",
        text: "A client sends a request to a server. The server processes the request and sends a response back to the client."
      },
      {
        id: "b", title: "Relationship diagram",
        text: "Client ──request──▶ Server\nServer: processes request\nClient ◀──response── Server"
      },
      {
        id: "c", title: "Text with structure",
        text: "Client → request → Server (processes request) → response → Client. First the client asks, then the server processes the request and replies."
      }
    ]
  },
  comparison: {
    id: "comparison",
    concept: "Recursion and factorial",
    canonicalFacts: [
      "Recursion calls a function on a smaller version of a task.",
      "A base case ends the recursive calls.",
      "factorial(3) = 3 × factorial(2).",
      "factorial(2) = 2 × factorial(1).",
      "factorial(1) is the base case and equals 1.",
      "factorial(3) equals 6."
    ],
    variants: [
      {
        id: "a", title: "Big-picture first",
        text: "Recursion solves a task using smaller versions of the same task until a base case stops. For factorial(3): 3 × factorial(2), then 2 × factorial(1), where factorial(1) = 1. The result is 3 × 2 × 1 = 6."
      },
      {
        id: "b", title: "Steps first",
        text: "1. factorial(3) = 3 × factorial(2).\n2. factorial(2) = 2 × factorial(1).\n3. factorial(1) = 1, the base case.\n4. Return 3 × 2 × 1 = 6. Each recursive call handles a smaller task."
      },
      {
        id: "c", title: "Worked example",
        text: "Try factorial(3). It calls factorial(2), then factorial(1):\nfactorial(3) → 3 × factorial(2)\nfactorial(2) → 2 × factorial(1)\nfactorial(1) → 1 (base case)\nTogether: 3 × 2 × 1 = 6. Recursion ends at the base case."
      }
    ]
  },
  photosynthesis: {
    id: "photosynthesis",
    concept: "Photosynthesis",
    canonicalFacts: [
      "Plants absorb light using pigments including chlorophyll.",
      "Photosynthesis uses light energy to convert carbon dioxide and water into sugars.",
      "The sugars store chemical energy that the plant can use.",
      "Oxygen is released during the process."
    ],
    variants: [
      {
        id: "a", title: "Overview",
        text: "Photosynthesis lets plants store energy from light in sugars. Pigments including chlorophyll absorb light. Carbon dioxide and water are converted into sugars, and oxygen is released."
      },
      {
        id: "b", title: "Sequence",
        text: "1. Pigments including chlorophyll absorb light.\\n2. Light energy helps convert carbon dioxide and water into sugars.\\n3. Sugars store chemical energy for the plant.\\n4. Oxygen is released."
      },
      {
        id: "c", title: "Relationships",
        text: "Light → absorbed by chlorophyll and other pigments. Carbon dioxide + water → sugars (stored chemical energy) + released oxygen. The plant can use the sugars for energy."
      }
    ]
  }
};

/** Stable randomized display order, keyed by a random session ID. Never use
 * display positions as score identifiers; answer IDs remain canonical. */
export function displayVariants(stimulus: ComparisonStimulus, sessionId: string): ComparisonVariant[] {
  if (!sessionId) throw new Error("Session ID required to randomize variants");
  let hash = 2166136261;
  for (const char of sessionId + stimulus.id) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  const values = [...stimulus.variants];
  for (let i = values.length - 1; i > 0; i--) {
    const j = (hash >>> 0) % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
    hash = Math.imul(hash ^ i, 16777619);
  }
  return values;
}

export function evaluateTransferAnswer(answer: string): { correct: boolean; rubricId: string } {
  if (!["a", "b", "c", "d"].includes(answer)) throw new Error("Choose an answer a–d");
  // A near-transfer check, NOT a measure of intelligence or general mastery.
  return { correct: answer === "c", rubricId: "factorial4-2026-01" };
}
