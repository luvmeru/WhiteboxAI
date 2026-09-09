"use client";

import { Trash2 } from "lucide-react";
import type {
  AttributeEvidenceRequirement,
  AttributeSpec,
  VerificationMethod,
} from "@/lib/types";

const INPUT =
  "iris-focus w-full rounded-lg border border-hairline bg-void2 px-3 py-2 text-[11px] text-hi";
const LABEL =
  "mb-1.5 block font-mono text-[9px] uppercase tracking-[.08em] text-lo";

const METHODS: { value: VerificationMethod; label: string }[] = [
  { value: "self_report", label: "Self-report" },
  { value: "interview", label: "Interview" },
  { value: "test", label: "Knowledge / ability test" },
  { value: "work_sample", label: "Work sample" },
  { value: "document", label: "Document" },
  { value: "reference", label: "Reference" },
  { value: "human_observation", label: "Human observation" },
];

const LEGACY_METHODS = new Set([
  "self_report",
  "interview",
  "test",
  "document",
  "reference",
]);

function defaults(attribute: AttributeSpec): AttributeEvidenceRequirement {
  return (
    attribute.evidenceRequirement ?? {
      priority: attribute.focus ? "essential" : "important",
      targetLevel: 3,
      methods: [attribute.verification],
      minIndependentSources: attribute.focus ? 2 : 1,
      requiredForDecision: Boolean(attribute.focus || attribute.mustHave),
      notes: [],
      specialRequirements: [],
    }
  );
}

function TextList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <textarea
      className={`${INPUT} min-h-24 leading-relaxed`}
      value={values.join("\n")}
      placeholder={placeholder}
      onChange={(event) =>
        onChange(
          event.target.value
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

export default function CriterionDetailEditor({
  attribute,
  onChange,
  onDelete,
}: {
  attribute: AttributeSpec;
  onChange: (attribute: AttributeSpec) => void;
  onDelete: () => void;
}) {
  const requirement = defaults(attribute);
  const setRequirement = (patch: Partial<AttributeEvidenceRequirement>) => {
    const next = { ...requirement, ...patch };
    const firstLegacy = next.methods.find((method) =>
      LEGACY_METHODS.has(method),
    );
    onChange({
      ...attribute,
      evidenceRequirement: next,
      ...(firstLegacy
        ? {
            verification:
              firstLegacy as AttributeSpec["verification"],
          }
        : {}),
    });
  };

  return (
    <details className="border-t border-hairline bg-void2/35 px-4 py-2">
      <summary className="cursor-pointer list-none font-mono text-[9px] uppercase tracking-[.08em] text-lo hover:text-mid">
        Evidence policy, BARS and special requirements
      </summary>
      <div className="mt-3 space-y-4 border-t border-hairline pt-4">
        <div className="grid grid-cols-[160px_130px_170px_1fr] gap-3">
          <label>
            <span className={LABEL}>Decision priority</span>
            <select
              className={INPUT}
              value={requirement.priority}
              onChange={(event) =>
                setRequirement({
                  priority: event.target
                    .value as AttributeEvidenceRequirement["priority"],
                })
              }
            >
              <option value="essential">Essential</option>
              <option value="important">Important</option>
              <option value="supporting">Supporting</option>
            </select>
          </label>
          <label>
            <span className={LABEL}>Target BARS level</span>
            <select
              className={INPUT}
              value={requirement.targetLevel}
              onChange={(event) =>
                setRequirement({
                  targetLevel: Number(event.target.value) as 1 | 2 | 3 | 4 | 5,
                })
              }
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Independent sources</span>
            <select
              className={INPUT}
              value={requirement.minIndependentSources}
              onChange={(event) =>
                setRequirement({
                  minIndependentSources: Number(event.target.value) as 1 | 2 | 3,
                })
              }
            >
              <option value={1}>At least 1</option>
              <option value={2}>At least 2</option>
              <option value={3}>At least 3</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5 text-[11px] text-hi">
            <input
              type="checkbox"
              checked={requirement.requiredForDecision}
              onChange={(event) =>
                setRequirement({
                  requiredForDecision: event.target.checked,
                })
              }
              className="accent-[var(--iris-b)]"
            />
            A decision cannot be finalized without sufficient evidence
          </label>
        </div>

        <div>
          <span className={LABEL}>Allowed evidence methods · multiple selection</span>
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((method) => {
              const selected = requirement.methods.includes(method.value);
              return (
                <button
                  type="button"
                  key={method.value}
                  onClick={() =>
                    setRequirement({
                      methods: selected
                        ? requirement.methods.filter(
                            (value) => value !== method.value,
                          )
                        : [...requirement.methods, method.value],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[10px] ${
                    selected
                      ? "border-irisb/50 bg-irisb/10 text-irisc"
                      : "border-hairline text-lo"
                  }`}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className={LABEL}>Behaviorally anchored rating scale · levels 1–5</span>
          <div className="grid grid-cols-5 gap-2">
            {attribute.scale.anchors.map((anchor, index) => (
              <label key={index}>
                <span className="mb-1 block font-mono text-[9px] text-lo">
                  LEVEL {index + 1}
                </span>
                <textarea
                  className={`${INPUT} min-h-28 leading-relaxed`}
                  value={anchor}
                  onChange={(event) => {
                    const anchors = [
                      ...attribute.scale.anchors,
                    ] as AttributeSpec["scale"]["anchors"];
                    anchors[index] = event.target.value;
                    onChange({
                      ...attribute,
                      scale: { anchors },
                    });
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={LABEL}>Evidence notes · one per line</span>
            <TextList
              values={requirement.notes}
              placeholder="What counts as usable, observable evidence?"
              onChange={(notes) => setRequirement({ notes })}
            />
          </label>
          <label>
            <span className={LABEL}>Special requirements · one per line</span>
            <TextList
              values={requirement.specialRequirements}
              placeholder="Domain context, scale, recency, jurisdiction, constraints…"
              onChange={(specialRequirements) =>
                setRequirement({ specialRequirements })
              }
            />
          </label>
        </div>

        <div className="grid grid-cols-[160px_1fr_1fr] gap-3">
          <label>
            <span className={LABEL}>Taxonomy</span>
            <select
              className={INPUT}
              value={attribute.taxonomyRef?.system ?? "custom"}
              onChange={(event) =>
                onChange({
                  ...attribute,
                  taxonomyRef: {
                    system: event.target
                      .value as NonNullable<
                        AttributeSpec["taxonomyRef"]
                      >["system"],
                    code: attribute.taxonomyRef?.code ?? "",
                  },
                })
              }
            >
              <option>ONET</option>
              <option>ESCO</option>
              <option>SFIA</option>
              <option>UCF</option>
              <option>custom</option>
            </select>
          </label>
          <label>
            <span className={LABEL}>Taxonomy code</span>
            <input
              className={INPUT}
              value={attribute.taxonomyRef?.code ?? ""}
              onChange={(event) =>
                onChange({
                  ...attribute,
                  taxonomyRef: {
                    system: attribute.taxonomyRef?.system ?? "custom",
                    code: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            <span className={LABEL}>Why this criterion is job-related</span>
            <input
              className={INPUT}
              value={attribute.rationale ?? ""}
              onChange={(event) =>
                onChange({ ...attribute, rationale: event.target.value })
              }
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-hairline pt-3">
          <p className="max-w-3xl text-[10px] leading-relaxed text-lo">
            The selected methods must be represented by scored pipeline blocks.
            Required multi-source evidence is enforced by the assessment blueprint,
            not inferred later by the model.
          </p>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neg/30 px-3 py-2 text-[10px] text-neg hover:bg-neg/10"
          >
            <Trash2 className="size-3" /> Delete criterion
          </button>
        </div>
      </div>
    </details>
  );
}
