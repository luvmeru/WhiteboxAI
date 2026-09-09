import { generateInterviewQuestion } from "@/lib/server/ai-provider";
import {
  ValidationError,
  createJsonApiRoute,
  expectArray,
  expectBoolean,
  expectEnum,
  expectNumber,
  expectObject,
  expectOnlyKeys,
  expectString,
  optionalString,
} from "@/lib/server/http";
import type { AttributeSpec, MustHave, QuestionType, Seniority } from "@/lib/types";

const ATTRIBUTE_KINDS = ["skill", "trait", "knowledge", "qualification", "experience", "language"] as const;
const VERIFICATION_METHODS = ["self_report", "interview", "test", "document", "reference"] as const;
const QUESTION_TYPES = ["behavioral", "situational", "background", "job_knowledge", "motivation"] as const;
const SENIORITIES = ["Intern", "Junior", "Middle", "Senior", "Lead", "Head", "Executive"] as const;
const MUST_HAVE_RULES = [
  "min_years", "certification", "license", "language_level",
  "location", "work_auth", "min_scale_level", "custom_bool",
] as const;
const TAXONOMIES = ["ONET", "ESCO", "SFIA", "UCF", "custom"] as const;

interface DraftQuestionBody {
  attribute: AttributeSpec;
  type: QuestionType;
  seniority: Seniority;
}

function validateMustHave(value: unknown): MustHave {
  const input = expectObject(value, "body.attribute.mustHave");
  expectOnlyKeys(input, ["rule", "value", "label", "humanRecoverable"], "body.attribute.mustHave");
  if (typeof input.value !== "string" && (typeof input.value !== "number" || !Number.isFinite(input.value))) {
    throw new ValidationError("body.attribute.mustHave.value", "must be a string or finite number");
  }
  if (input.humanRecoverable !== true) {
    throw new ValidationError("body.attribute.mustHave.humanRecoverable", "must be true");
  }
  return {
    rule: expectEnum(input.rule, "body.attribute.mustHave.rule", MUST_HAVE_RULES),
    value: typeof input.value === "string"
      ? expectString(input.value, "body.attribute.mustHave.value", { min: 1, max: 500 })
      : input.value,
    label: expectString(input.label, "body.attribute.mustHave.label", { min: 1, max: 500 }),
    humanRecoverable: true,
  };
}

function validateAttribute(value: unknown): AttributeSpec {
  const input = expectObject(value, "body.attribute");
  expectOnlyKeys(input, [
    "id", "name", "kind", "definition", "weight", "focus", "mustHave",
    "scale", "verification", "taxonomyRef", "rationale",
  ], "body.attribute");

  const scale = expectObject(input.scale, "body.attribute.scale");
  expectOnlyKeys(scale, ["anchors"], "body.attribute.scale");
  const anchors = expectArray(scale.anchors, "body.attribute.scale.anchors", { min: 5, max: 5 })
    .map((anchor, index) =>
      expectString(anchor, `body.attribute.scale.anchors[${index}]`, { min: 1, max: 1_000 })
    ) as [string, string, string, string, string];

  let taxonomyRef: AttributeSpec["taxonomyRef"];
  if (input.taxonomyRef !== undefined) {
    const taxonomy = expectObject(input.taxonomyRef, "body.attribute.taxonomyRef");
    expectOnlyKeys(taxonomy, ["system", "code"], "body.attribute.taxonomyRef");
    taxonomyRef = {
      system: expectEnum(taxonomy.system, "body.attribute.taxonomyRef.system", TAXONOMIES),
      code: expectString(taxonomy.code, "body.attribute.taxonomyRef.code", { min: 1, max: 80 }),
    };
  }

  return {
    id: expectString(input.id, "body.attribute.id", { min: 1, max: 128 }),
    name: expectString(input.name, "body.attribute.name", { min: 1, max: 200 }),
    kind: expectEnum(input.kind, "body.attribute.kind", ATTRIBUTE_KINDS),
    definition: expectString(input.definition, "body.attribute.definition", { min: 1, max: 2_000 }),
    weight: expectNumber(input.weight, "body.attribute.weight", { min: 0, max: 100 }),
    focus: input.focus === undefined ? undefined : expectBoolean(input.focus, "body.attribute.focus"),
    mustHave: input.mustHave === undefined ? undefined : validateMustHave(input.mustHave),
    scale: { anchors },
    verification: expectEnum(input.verification, "body.attribute.verification", VERIFICATION_METHODS),
    taxonomyRef,
    rationale: optionalString(input.rationale, "body.attribute.rationale", { max: 2_000 }),
  };
}

function validateDraftQuestionBody(value: unknown): DraftQuestionBody {
  const body = expectObject(value);
  expectOnlyKeys(body, ["attribute", "type", "seniority"]);
  return {
    attribute: validateAttribute(body.attribute),
    type: body.type === undefined
      ? "behavioral"
      : expectEnum(body.type, "body.type", QUESTION_TYPES),
    seniority: body.seniority === undefined
      ? "Middle"
      : expectEnum(body.seniority, "body.seniority", SENIORITIES),
  };
}

/* Studio-only authoring endpoint; it is wired through the optional HR auth hook. */
export const POST = createJsonApiRoute(
  {
    routeId: "ai.draft-question",
    access: "hr",
    roles: ["Owner", "HiringManager"],
    maxBodyBytes: 32 * 1024,
    rateLimit: { limit: 60, windowMs: 60_000 },
    validate: validateDraftQuestionBody,
  },
  async ({ body }) =>
    generateInterviewQuestion(body.attribute, body.type, body.seniority),
);
