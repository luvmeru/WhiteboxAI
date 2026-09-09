"use client";

import { Plus, Trash2 } from "lucide-react";
import type {
  AttributeSpec,
  BlockSettings,
  FormFieldType,
  InterviewQuestion,
  JobKnowledgeSettings,
  KnowledgeItemType,
  PipelineBlock,
  RubricDimension,
  SjtFormat,
} from "@/lib/types";

const INPUT =
  "iris-focus w-full rounded-lg border border-hairline bg-void2 px-3 py-2 text-[12px] text-hi";
const LABEL =
  "mb-1.5 block font-mono text-[9px] uppercase tracking-[.08em] text-lo";
const PANEL = "rounded-lg border border-hairline bg-void2/55 p-3";
const BTN =
  "iris-focus inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[10px] text-mid hover:border-hairline-strong hover:text-hi";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
      {help && (
        <span className="mt-1 block text-[10px] leading-relaxed text-lo">
          {help}
        </span>
      )}
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
  help,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 text-[11px] ${
        disabled
          ? "cursor-not-allowed text-lo opacity-60"
          : "cursor-pointer text-hi"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 accent-[var(--iris-b)]"
      />
      <span>
        <span className="block">{label}</span>
        {help && (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-lo">
            {help}
          </span>
        )}
      </span>
    </label>
  );
}

function MultiChoice<T extends string>({
  values,
  options,
  onChange,
}: {
  values: T[];
  options: readonly { value: T; label: string }[];
  onChange: (values: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <button
            type="button"
            key={option.value}
            onClick={() =>
              onChange(
                selected
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value],
              )
            }
            className={`rounded-full border px-2.5 py-1 text-[10px] ${
              selected
                ? "border-irisb/50 bg-irisb/10 text-irisc"
                : "border-hairline text-lo"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TextList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
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

function RubricEditor({
  dimensions,
  attributes,
  codingScoring = false,
  onChange,
}: {
  dimensions: RubricDimension[];
  attributes: AttributeSpec[];
  codingScoring?: boolean;
  onChange: (dimensions: RubricDimension[]) => void;
}) {
  const normalized = (items: RubricDimension[]): RubricDimension[] => {
    if (items.length === 0) return [];
    const base = Math.floor(100 / items.length);
    const remainder = 100 - base * items.length;
    return items.map((item, index) => ({
      ...item,
      weight: base + (index < remainder ? 1 : 0),
    }));
  };
  return (
    <div className="space-y-2">
      {dimensions.map((dimension, index) => (
        <div key={dimension.id} className={PANEL}>
          <div
            className={`grid gap-2 ${
              codingScoring
                ? "grid-cols-[1fr_200px_140px_100px_28px]"
                : "grid-cols-[1fr_220px_76px_28px]"
            }`}
          >
            <input
              aria-label={`Rubric dimension ${index + 1}`}
              className={INPUT}
              value={dimension.name}
              onChange={(event) =>
                onChange(
                  dimensions.map((item) =>
                    item.id === dimension.id
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <select
              aria-label={`Criterion for ${dimension.name}`}
              className={INPUT}
              value={
                dimension.attributeId ??
                (attributes.length === 1 ? attributes[0].id : "")
              }
              onChange={(event) =>
                onChange(
                  dimensions.map((item) =>
                    item.id === dimension.id
                      ? {
                          ...item,
                          attributeId: event.target.value || undefined,
                        }
                      : item,
                  ),
                )
              }
            >
              {attributes.length !== 1 && (
                <option value="">Select one criterion</option>
              )}
              {attributes.map((attribute) => (
                <option key={attribute.id} value={attribute.id}>
                  {attribute.name}
                </option>
              ))}
            </select>
            {codingScoring && (
              <select
                aria-label={`Coding scoring area for ${dimension.name}`}
                className={INPUT}
                value={dimension.codingScoringArea ?? ""}
                onChange={(event) =>
                  onChange(
                    dimensions.map((item) =>
                      item.id === dimension.id
                        ? {
                            ...item,
                            codingScoringArea:
                              (event.target.value ||
                                undefined) as RubricDimension["codingScoringArea"],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="">Select scoring area</option>
                <option value="correctness">Correctness</option>
                <option value="quality">Quality</option>
                <option value="approach">Approach</option>
              </select>
            )}
            <input
              aria-label={`${codingScoring ? "Within-area weight" : "Weight"} for ${dimension.name}`}
              className={INPUT}
              type="number"
              min={0}
              max={100}
              value={dimension.weight}
              onChange={(event) =>
                onChange(
                  dimensions.map((item) =>
                    item.id === dimension.id
                      ? { ...item, weight: Number(event.target.value) }
                      : item,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={`Delete ${dimension.name}`}
              onClick={() =>
                onChange(
                  normalized(
                    dimensions.filter((item) => item.id !== dimension.id),
                  ),
                )
              }
            >
              <Trash2 className="size-3.5 text-lo" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {dimension.anchors.map((anchor, anchorIndex) => (
              <textarea
                key={anchorIndex}
                aria-label={`${dimension.name} level ${anchorIndex + 1}`}
                className={`${INPUT} min-h-20 resize-y px-2 py-1.5 text-[10px]`}
                value={anchor}
                onChange={(event) => {
                  const anchors = [...dimension.anchors] as RubricDimension["anchors"];
                  anchors[anchorIndex] = event.target.value;
                  onChange(
                    dimensions.map((item) =>
                      item.id === dimension.id ? { ...item, anchors } : item,
                    ),
                  );
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className={BTN}
        onClick={() =>
          onChange(
            normalized([
              ...dimensions,
              {
                id: uid("dim"),
                attributeId: attributes[0]?.id,
                codingScoringArea: codingScoring
                  ? ([
                      "correctness",
                      "quality",
                      "approach",
                    ] as const)[dimensions.length % 3]
                  : undefined,
                name: "New evidence dimension",
                weight: 0,
                anchors: [
                  "No usable evidence",
                  "Limited evidence",
                  "Meets the minimum",
                  "Strong evidence",
                  "Exceptional evidence",
                ],
              },
            ]),
          )
        }
      >
        <Plus className="size-3" /> Add rubric dimension
      </button>
    </div>
  );
}

function CriterionMappingEditor<Unit extends string>({
  units,
  mappings,
  attributes,
  onChange,
}: {
  units: Unit[];
  mappings: { unit: Unit; attributeId: string }[];
  attributes: AttributeSpec[];
  onChange: (mappings: { unit: Unit; attributeId: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {units.map((unit) => {
        const mapping = mappings.find((candidate) => candidate.unit === unit);
        return (
          <div
            key={unit}
            className="grid grid-cols-[180px_1fr] items-center gap-2"
          >
            <span className="font-mono text-[10px] text-mid">
              {unit.replaceAll("_", " ")}
            </span>
            <select
              aria-label={`Criterion for ${unit}`}
              className={INPUT}
              value={
                mapping?.attributeId ??
                (attributes.length === 1 ? attributes[0].id : "")
              }
              onChange={(event) => {
                const remaining = mappings.filter(
                  (candidate) => candidate.unit !== unit,
                );
                onChange(
                  event.target.value
                    ? [
                        ...remaining,
                        { unit, attributeId: event.target.value },
                      ]
                    : remaining,
                );
              }}
            >
              {attributes.length !== 1 && (
                <option value="">Select one criterion</option>
              )}
              {attributes.map((attribute) => (
                <option key={attribute.id} value={attribute.id}>
                  {attribute.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function QuestionEditor({
  questions,
  attributes,
  onChange,
}: {
  questions: InterviewQuestion[];
  attributes: AttributeSpec[];
  onChange: (questions: InterviewQuestion[]) => void;
}) {
  const addQuestion = () => {
    const attribute = attributes[0];
    if (!attribute) return;
    onChange([
      ...questions,
      {
        id: uid("q"),
        text: "",
        attributeId: attribute.id,
        type: "behavioral",
        thinkTimeSec: 30,
        answerCapSec: 180,
        modality: "video",
        reRecordAttempts: 1,
        notesAllowed: false,
        probes: [],
        clarification: "",
        situationalFallback: "",
        rubric: {
          id: uid("rubric"),
          attributeId: attribute.id,
          anchors: [...attribute.scale.anchors],
          version: 1,
        },
        source: "manual",
      },
    ]);
  };
  return (
    <div className="space-y-2">
      {questions.map((question, index) => (
        <details key={question.id} className={PANEL}>
          <summary className="cursor-pointer list-none text-[11px] text-hi">
            <span className="font-mono text-lo">Q{index + 1}</span>
            <span className="ml-2">
              {question.text.trim() || "Untitled structured question"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-hairline pt-3">
            <Field label="Question">
              <textarea
                className={`${INPUT} min-h-20`}
                value={question.text}
                onChange={(event) =>
                  onChange(
                    questions.map((item) =>
                      item.id === question.id
                        ? { ...item, text: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </Field>
            <div className="grid grid-cols-4 gap-2">
              <Field label="Primary attribute">
                <select
                  className={INPUT}
                  value={question.attributeId}
                  onChange={(event) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              attributeId: event.target.value,
                              rubric: {
                                ...item.rubric,
                                attributeId: event.target.value,
                              },
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {attributes.map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Question type">
                <select
                  className={INPUT}
                  value={question.type}
                  onChange={(event) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              type: event.target.value as InterviewQuestion["type"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {[
                    "behavioral",
                    "situational",
                    "background",
                    "job_knowledge",
                    "motivation",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <Field label="Answer cap · sec">
                <input
                  className={INPUT}
                  type="number"
                  min={30}
                  max={300}
                  value={question.answerCapSec}
                  onChange={(event) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id
                          ? { ...item, answerCapSec: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Modality">
                <select
                  className={INPUT}
                  value={question.modality}
                  onChange={(event) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              modality: event.target
                                .value as InterviewQuestion["modality"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option>video</option>
                  <option>audio</option>
                  <option>text</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Approved probes · one per line">
                <TextList
                  values={question.probes}
                  onChange={(probes) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id ? { ...item, probes } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Equivalent clarification">
                <textarea
                  className={`${INPUT} min-h-24`}
                  value={question.clarification ?? ""}
                  onChange={(event) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id
                          ? { ...item, clarification: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="No-experience alternative">
                <textarea
                  className={`${INPUT} min-h-24`}
                  value={question.situationalFallback ?? ""}
                  onChange={(event) =>
                    onChange(
                      questions.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              situationalFallback: event.target.value,
                            }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
            </div>
            <button
              type="button"
              className={BTN}
              onClick={() =>
                onChange(questions.filter((item) => item.id !== question.id))
              }
            >
              <Trash2 className="size-3" /> Delete question
            </button>
          </div>
        </details>
      ))}
      <button
        type="button"
        className={BTN}
        disabled={attributes.length === 0}
        onClick={addQuestion}
      >
        <Plus className="size-3" /> Add structured question
      </button>
    </div>
  );
}

function Section({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline pt-4 first:border-0 first:pt-0">
      <div className="text-[12px] font-medium text-hi">{title}</div>
      {text && (
        <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-lo">
          {text}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function BlockSettingsEditor({
  block,
  attributes,
  onChange,
}: {
  block: PipelineBlock;
  attributes: AttributeSpec[];
  onChange: (settings: BlockSettings) => void;
}) {
  const settings = block.settings;
  const measuredAttributes = attributes.filter((attribute) =>
    block.measures.some((measure) => measure.attributeId === attribute.id),
  );

  if (settings.kind === "application_form") {
    return (
      <Section
        title="Form fields"
        text="Contact data stays unscored. Any scored field needs explicit response keys and a job-related rationale."
      >
        <div>
          <Check
            checked={settings.prefillFromCv}
            onChange={(prefillFromCv) =>
              onChange({ ...settings, prefillFromCv })
            }
            label="Prefill from CV"
          />
        </div>
        {settings.prefillFromCv && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
            Publication is blocked: CV prefill needs an immutable field mapping,
            parser provenance and a candidate correction step. Disable it until
            that integration is configured.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {settings.fields.map((field) => {
            const choiceField = [
              "single_choice",
              "multi_choice",
              "dropdown",
            ].includes(field.type);
            return (
              <div key={field.id} className={PANEL}>
                <div className="grid grid-cols-[1fr_150px_190px_repeat(3,78px)_28px] items-center gap-2">
              <input
                aria-label={`Field ${field.label}`}
                className={INPUT}
                value={field.label}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    fields: settings.fields.map((item) =>
                      item.id === field.id
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <select
                aria-label={`Type for ${field.label}`}
                className={INPUT}
                value={field.type}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    fields: settings.fields.map((item) =>
                      item.id === field.id
                        ? {
                            ...item,
                            type: event.target.value as FormFieldType,
                          }
                        : item,
                    ),
                  })
                }
              >
                {[
                  "short_text",
                  "long_text",
                  "single_choice",
                  "multi_choice",
                  "dropdown",
                  "date",
                  "number",
                  "file",
                  "url",
                  "consent",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <select
                aria-label={`Criterion for ${field.label}`}
                className={INPUT}
                disabled={!field.scored}
                value={
                  field.scored
                    ? field.attributeId ??
                      (measuredAttributes.length === 1
                        ? measuredAttributes[0].id
                        : "")
                    : ""
                }
                onChange={(event) =>
                  onChange({
                    ...settings,
                    fields: settings.fields.map((item) =>
                      item.id === field.id
                        ? {
                            ...item,
                            attributeId: event.target.value || undefined,
                          }
                        : item,
                    ),
                  })
                }
              >
                <option value="">
                  {field.scored ? "Select one criterion" : "Context only"}
                </option>
                {measuredAttributes.map((attribute) => (
                  <option key={attribute.id} value={attribute.id}>
                    {attribute.name}
                  </option>
                ))}
              </select>
              {(["required", "pii", "scored"] as const).map((key) => (
                <Check
                  key={key}
                  checked={field[key]}
                  onChange={(checked) =>
                    onChange({
                      ...settings,
                      fields: settings.fields.map((item) =>
                        item.id === field.id ? { ...item, [key]: checked } : item,
                      ),
                    })
                  }
                  label={key}
                />
              ))}
              <button
                type="button"
                aria-label={`Delete ${field.label}`}
                onClick={() =>
                  onChange({
                    ...settings,
                    fields: settings.fields.filter(
                      (item) => item.id !== field.id,
                    ),
                  })
                }
              >
                <Trash2 className="size-3.5 text-lo" />
              </button>
                </div>
                {choiceField && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-[.08em] text-lo">
                      Response key · explicit points are required when scored
                    </div>
                    <div className="space-y-1.5">
                      {(field.options ?? []).map((option, optionIndex) => (
                        <div
                          key={option.id}
                          className="grid grid-cols-[1fr_120px_28px] gap-2"
                        >
                          <input
                            aria-label={`Option ${optionIndex + 1} for ${field.label}`}
                            className={INPUT}
                            value={option.text}
                            onChange={(event) =>
                              onChange({
                                ...settings,
                                fields: settings.fields.map((item) =>
                                  item.id === field.id
                                    ? {
                                        ...item,
                                        options: (item.options ?? []).map(
                                          (candidate) =>
                                            candidate.id === option.id
                                              ? {
                                                  ...candidate,
                                                  text: event.target.value,
                                                }
                                              : candidate,
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                          <input
                            aria-label={`Points for ${option.text}`}
                            className={INPUT}
                            type="number"
                            value={option.points ?? ""}
                            placeholder="Points"
                            onChange={(event) =>
                              onChange({
                                ...settings,
                                fields: settings.fields.map((item) =>
                                  item.id === field.id
                                    ? {
                                        ...item,
                                        options: (item.options ?? []).map(
                                          (candidate) =>
                                            candidate.id === option.id
                                              ? {
                                                  ...candidate,
                                                  points:
                                                    event.target.value === ""
                                                      ? undefined
                                                      : Number(
                                                          event.target.value,
                                                        ),
                                                }
                                              : candidate,
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Delete option ${option.text}`}
                            onClick={() =>
                              onChange({
                                ...settings,
                                fields: settings.fields.map((item) =>
                                  item.id === field.id
                                    ? {
                                        ...item,
                                        options: (item.options ?? []).filter(
                                          (candidate) =>
                                            candidate.id !== option.id,
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            <Trash2 className="size-3.5 text-lo" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`${BTN} mt-2`}
                      onClick={() =>
                        onChange({
                          ...settings,
                          fields: settings.fields.map((item) =>
                            item.id === field.id
                              ? {
                                  ...item,
                                  options: [
                                    ...(item.options ?? []),
                                    {
                                      id: uid("opt"),
                                      text: `Response option ${(item.options?.length ?? 0) + 1}`,
                                      points: item.options?.length ?? 0,
                                    },
                                  ],
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      <Plus className="size-3" /> Add response option
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className={BTN}
            onClick={() =>
              onChange({
                ...settings,
                fields: [
                  ...settings.fields,
                  {
                    id: uid("fld"),
                    label: "New field",
                    type: "short_text",
                    required: false,
                    pii: false,
                    scored: false,
                  },
                ],
              })
            }
          >
            <Plus className="size-3" /> Add field
          </button>
        </div>
      </Section>
    );
  }

  if (settings.kind === "knockout") {
    return (
      <Section
        title="Minimum requirements"
        text="Failed answers go to a recoverable human tray; they never disappear into an automatic rejection."
      >
        <Field label="Placement">
          <select
            className={INPUT}
            value={settings.placement}
            onChange={(event) =>
              onChange({
                ...settings,
                placement: event.target
                  .value as typeof settings.placement,
              })
            }
          >
            <option value="before_form">Before application form</option>
            <option value="after_form">After application form</option>
          </select>
        </Field>
        <div className="mt-3 space-y-2">
          {settings.items.map((item, index) => (
            <details key={item.id} className={PANEL}>
              <summary className="cursor-pointer text-[11px] text-hi">
                {index + 1}. {item.question || "Untitled requirement"}
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3">
                <Field label="Candidate question">
                  <textarea
                    className={`${INPUT} min-h-20`}
                    value={item.question}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        items: settings.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, question: event.target.value }
                            : entry,
                        ),
                      })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rule type">
                    <select
                      className={INPUT}
                      value={item.type}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  type: event.target
                                    .value as typeof item.type,
                                }
                              : entry,
                          ),
                        })
                      }
                    >
                      <option value="yes_no">Yes / no</option>
                      <option value="numeric_threshold">
                        Numeric threshold
                      </option>
                      <option value="single_choice">Single choice</option>
                      <option value="multi_must_include">
                        Multi-choice requirements
                      </option>
                    </select>
                  </Field>
                  {item.type === "numeric_threshold" ? (
                    <Field label="Minimum value">
                      <input
                        className={INPUT}
                        type="number"
                        value={item.threshold ?? 0}
                        onChange={(event) =>
                          onChange({
                            ...settings,
                            items: settings.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    threshold: Number(event.target.value),
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                    </Field>
                  ) : (
                    <Field label="Passing yes/no value">
                      <select
                        className={INPUT}
                        value={String(item.passValue ?? true)}
                        onChange={(event) =>
                          onChange({
                            ...settings,
                            items: settings.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    passValue: event.target.value === "true",
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </Field>
                  )}
                </div>
                <Field label="Human-readable rejection explanation">
                  <textarea
                    className={`${INPUT} min-h-20`}
                    value={item.rejectionText}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        items: settings.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, rejectionText: event.target.value }
                            : entry,
                        ),
                      })
                    }
                  />
                </Field>
                <div className="space-y-2">
                  <Check
                    checked={item.immediate}
                    onChange={(immediate) =>
                      onChange({
                        ...settings,
                        items: settings.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, immediate }
                            : entry,
                        ),
                      })
                    }
                    label="Stop progression immediately"
                  />
                  <Check
                    checked={item.allowAppeal}
                    onChange={(allowAppeal) =>
                      onChange({
                        ...settings,
                        items: settings.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, allowAppeal }
                            : entry,
                        ),
                      })
                    }
                    label="Allow candidate explanation"
                  />
                </div>
                {(item.type === "single_choice" ||
                  item.type === "multi_must_include") && (
                  <Field
                    label="Options · prefix disqualifying with ! and required with +"
                    help="Example: + Valid work authorization"
                  >
                    <TextList
                      values={(item.options ?? []).map(
                        (option) =>
                          `${option.disqualifies ? "!" : option.mustInclude ? "+" : ""}${option.text}`,
                      )}
                      onChange={(values) =>
                        onChange({
                          ...settings,
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  options: values.map((value, optionIndex) => ({
                                    id:
                                      entry.options?.[optionIndex]?.id ??
                                      uid("ko"),
                                    text: value.replace(/^[!+]\s*/, ""),
                                    ...(value.startsWith("!")
                                      ? { disqualifies: true }
                                      : {}),
                                    ...(value.startsWith("+")
                                      ? { mustInclude: true }
                                      : {}),
                                  })),
                                }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                )}
                <button
                  type="button"
                  className={BTN}
                  onClick={() =>
                    onChange({
                      ...settings,
                      items: settings.items.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-3" /> Delete requirement
                </button>
              </div>
            </details>
          ))}
          <button
            type="button"
            className={BTN}
            onClick={() =>
              onChange({
                ...settings,
                items: [
                  ...settings.items,
                  {
                    id: uid("ko"),
                    question: "",
                    type: "yes_no",
                    passValue: true,
                    immediate: false,
                    rejectionText:
                      "This answer may not meet a stated minimum requirement. A recruiter will review it before a decision.",
                    allowAppeal: true,
                  },
                ],
              })
            }
          >
            <Plus className="size-3" /> Add minimum requirement
          </button>
        </div>
      </Section>
    );
  }

  if (settings.kind === "cv_intake") {
    return (
      <Section
        title="CV intake and claims ledger"
        text="The CV provides background and claims to verify; scored evidence comes from structured, role-specific stages."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Accepted formats">
            <MultiChoice
              values={settings.acceptedFormats}
              options={[
                { value: "pdf", label: "PDF" },
                { value: "docx", label: "DOCX" },
              ]}
              onChange={(acceptedFormats) =>
                onChange({ ...settings, acceptedFormats })
              }
            />
          </Field>
          <Field label="Maximum file size · MB">
            <input
              className={INPUT}
              type="number"
              min={1}
              max={50}
              value={settings.maxSizeMb}
              onChange={(event) =>
                onChange({
                  ...settings,
                  maxSizeMb: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Extract">
            <MultiChoice
              values={settings.parseTargets}
              options={[
                { value: "employment", label: "Employment" },
                { value: "education", label: "Education" },
                { value: "certifications", label: "Certifications" },
                { value: "skills", label: "Skills" },
                { value: "publications", label: "Publications" },
                { value: "links", label: "Links" },
              ]}
              onChange={(parseTargets) =>
                onChange({ ...settings, parseTargets })
              }
            />
          </Field>
          <div className="space-y-2">
            <Check
              checked={settings.anonymizeForReview}
              onChange={(anonymizeForReview) =>
                onChange({ ...settings, anonymizeForReview })
              }
              label="Anonymize before review"
            />
            <Check
              checked={settings.extractClaims}
              onChange={(extractClaims) =>
                onChange({ ...settings, extractClaims })
              }
              label="Create claims ledger for later verification"
            />
            <Check
              checked={settings.portfolioUrlField}
              onChange={(portfolioUrlField) =>
                onChange({ ...settings, portfolioUrlField })
              }
              label="Ask for portfolio URL"
            />
          </div>
        </div>
        {(settings.parseTargets.length > 0 || settings.extractClaims) && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
            Publication is blocked: extraction requires a configured parser,
            frozen output schema, provenance and candidate correction flow.
            Private CV upload still works when extraction and claim creation are
            disabled.
          </p>
        )}
      </Section>
    );
  }

  if (
    settings.kind === "async_interview" ||
    settings.kind === "live_ai_interview" ||
    settings.kind === "chat_interview"
  ) {
    return (
      <div className="space-y-4">
        <Section
          title="Conversation policy"
          text="Core questions and rubrics stay fixed. The AI may only choose approved probes, equivalent clarifications and no-experience alternatives."
        >
          {settings.kind === "async_interview" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Evidence probes">
                <select
                  className={INPUT}
                  value={settings.followUpPolicy}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      followUpPolicy: Number(event.target.value) as 0 | 1 | 2,
                    })
                  }
                >
                  <option value={0}>No probes</option>
                  <option value={1}>Up to 1</option>
                  <option value={2}>Up to 2</option>
                </select>
              </Field>
              <div className="rounded-lg border border-hairline bg-void2 px-3 py-2.5">
                <div className="font-mono text-[9px] uppercase tracking-[.08em] text-lo">Candidate format</div>
                <div className="mt-1 text-[11px] leading-relaxed text-mid">Recorded video · fixed question sequence · one response at a time</div>
              </div>
            </div>
          )}
          {settings.kind === "live_ai_interview" && (
            <div className="grid grid-cols-4 gap-3">
              <Field label="Duration cap · minutes">
                <input
                  className={INPUT}
                  type="number"
                  min={10}
                  max={45}
                  value={settings.durationCapMin}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      durationCapMin: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="AI name">
                <input
                  className={INPUT}
                  value={settings.persona.name}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      persona: {
                        ...settings.persona,
                        name: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Voice presentation">
                <select
                  className={INPUT}
                  value={settings.persona.voice}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      persona: {
                        ...settings.persona,
                        voice: event.target
                          .value as typeof settings.persona.voice,
                      },
                    })
                  }
                >
                  <option value="neutral">Neutral</option>
                  <option value="warm">Warm</option>
                  <option value="formal">Formal</option>
                </select>
              </Field>
              <Field label="Latency fallback">
                <select
                  className={INPUT}
                  value={settings.latencyFallback}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      latencyFallback: event.target
                        .value as typeof settings.latencyFallback,
                    })
                  }
                >
                  <option value="async">Recorded async</option>
                  <option value="chat">Structured chat</option>
                </select>
              </Field>
              <Field label="Adaptivity">
                <select
                  className={INPUT}
                  value={settings.adaptivity}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      adaptivity: event.target.value as typeof settings.adaptivity,
                    })
                  }
                >
                  <option value="probe_only">Approved probes only</option>
                  <option value="probe_reorder">Reorder main questions · unavailable</option>
                </select>
              </Field>
              <Check
                checked={settings.bargeInAllowed}
                onChange={(bargeInAllowed) =>
                  onChange({ ...settings, bargeInAllowed })
                }
                label="Allow interruption of AI speech"
              />
            </div>
          )}
          {settings.kind === "live_ai_interview" &&
            (settings.adaptivity !== "probe_only" ||
              settings.latencyFallback !== "async" ||
              settings.bargeInAllowed) && (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
                Publication is blocked unless adaptivity is limited to approved
                probes, fallback is recorded async retry and barge-in is off.
                The current runtime does not reorder frozen main questions,
                switch an active attempt to chat, or stream interruptible TTS.
              </p>
            )}
          {settings.kind === "chat_interview" && (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-3">
                <Field label="Minimum words">
                  <input
                    className={INPUT}
                    type="number"
                    min={1}
                    value={settings.minAnswerWords}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        minAnswerWords: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Maximum words">
                  <input
                    className={INPUT}
                    type="number"
                    min={1}
                    value={settings.maxAnswerWords}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        maxAnswerWords: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Evidence probes">
                  <select
                    className={INPUT}
                    value={settings.followUpPolicy}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        followUpPolicy: Number(event.target.value) as 0 | 1 | 2,
                      })
                    }
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </Field>
                <Field label="Paste policy">
                  <select
                    className={INPUT}
                    value={settings.pastePolicy}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        pastePolicy: event.target
                          .value as typeof settings.pastePolicy,
                      })
                    }
                  >
                    <option value="allow">Allow</option>
                    <option value="warn">Warn</option>
                    <option value="block">Block</option>
                  </select>
                </Field>
                <Field label="Tone">
                  <select
                    className={INPUT}
                    value={settings.tone}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        tone: event.target.value as typeof settings.tone,
                      })
                    }
                  >
                    <option value="neutral">Neutral</option>
                    <option value="warm">Warm</option>
                  </select>
                </Field>
              </div>
              <Check
                checked={settings.typingTelemetry}
                onChange={(typingTelemetry) =>
                  onChange({ ...settings, typingTelemetry })
                }
                label="Capture detailed typing telemetry"
                help="Requires a separately specified and consented telemetry event contract. Publishing is blocked while this is enabled; paste-event policy still works without detailed keystroke telemetry."
              />
            </div>
          )}
        </Section>
        <Section
          title={`Structured question plan · ${settings.questions.length}`}
        >
          <QuestionEditor
            questions={settings.questions}
            attributes={attributes}
            onChange={(questions) => onChange({ ...settings, questions })}
          />
        </Section>
      </div>
    );
  }

  if (settings.kind === "sjt") {
    return (
      <div className="space-y-4">
        <Section
          title="SJT design"
          text="Generated scenarios stay in pilot mode until an SME reviews the scenario, options and scoring key."
        >
          <div className="grid grid-cols-5 gap-3">
            <Field label="Instruction">
              <select
                className={INPUT}
                value={settings.instruction}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    instruction: event.target
                      .value as typeof settings.instruction,
                  })
                }
              >
                <option value="knowledge">What should you do?</option>
                <option value="behavioral_tendency">
                  What would you most likely do?
                </option>
              </select>
            </Field>
            <Field label="Response format">
              <select
                className={INPUT}
                value={settings.format}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    format: event.target.value as SjtFormat,
                  })
                }
              >
                <option value="pick_best">Pick best</option>
                <option value="pick_best_worst">Pick best and worst</option>
                <option value="rank_all">Rank all</option>
                <option value="rate_each">Rate each</option>
              </select>
            </Field>
            <Field label="Scoring key">
              <select
                className={INPUT}
                value={settings.keyType}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    keyType: event.target.value as typeof settings.keyType,
                  })
                }
              >
                <option value="sme">SME</option>
                <option value="consensus">Incumbent consensus</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </Field>
            <Check
              checked={settings.randomizeOrder}
              onChange={(randomizeOrder) =>
                onChange({ ...settings, randomizeOrder })
              }
              label="Randomize order"
            />
            <Check
              checked={settings.pilotMode}
              onChange={(pilotMode) => onChange({ ...settings, pilotMode })}
              label="Pilot · do not rank"
            />
            <Field label="Timing">
              <select
                className={INPUT}
                value={settings.timing}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timing: event.target.value as typeof settings.timing,
                  })
                }
              >
                <option value="untimed">Untimed</option>
                <option value="soft_per_item">
                  Per-item observation · unavailable
                </option>
              </select>
            </Field>
          </div>
          {settings.timing === "soft_per_item" && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked until server-owned item-open and
              item-submit receipts are captured. This setting is never converted
              into a hidden hard cutoff.
            </p>
          )}
        </Section>
        <Section title={`Scenarios · ${settings.items.length}`}>
          <div className="space-y-2">
            {settings.items.map((item, index) => (
              <details key={item.id} className={PANEL}>
                <summary className="cursor-pointer text-[11px] text-hi">
                  {index + 1}. {item.scenario || "Untitled scenario"}
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3">
                  <Field label="Scenario">
                    <textarea
                      className={`${INPUT} min-h-28`}
                      value={item.scenario}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, scenario: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Attribute">
                      <select
                        className={INPUT}
                        value={item.attributeId}
                        onChange={(event) =>
                          onChange({
                            ...settings,
                            items: settings.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    attributeId: event.target.value,
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {attributes.map((attribute) => (
                          <option key={attribute.id} value={attribute.id}>
                            {attribute.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Check
                      checked={item.smeReviewed}
                      onChange={(smeReviewed) =>
                        onChange({
                          ...settings,
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, smeReviewed }
                              : entry,
                          ),
                        })
                      }
                      label="SME reviewed"
                    />
                  </div>
                  <Field label="Options · one per line as score | text">
                    <TextList
                      values={item.options.map(
                        (option) => `${option.keyScore} | ${option.text}`,
                      )}
                      onChange={(values) =>
                        onChange({
                          ...settings,
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  options: values.map((value, optionIndex) => {
                                    const [rawScore, ...text] =
                                      value.split("|");
                                    return {
                                      id:
                                        entry.options[optionIndex]?.id ??
                                        uid("sjt-opt"),
                                      keyScore:
                                        Number(rawScore.trim()) || 0,
                                      text: text.join("|").trim() || value,
                                    };
                                  }),
                                }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className={BTN}
                    onClick={() =>
                      onChange({
                        ...settings,
                        items: settings.items.filter(
                          (entry) => entry.id !== item.id,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3" /> Delete scenario
                  </button>
                </div>
              </details>
            ))}
            <button
              type="button"
              className={BTN}
              disabled={attributes.length === 0}
              onClick={() => {
                const attribute = attributes[0];
                if (!attribute) return;
                onChange({
                  ...settings,
                  items: [
                    ...settings.items,
                    {
                      id: uid("sjt"),
                      scenario: "",
                      mediaKind: "text",
                      attributeId: attribute.id,
                      smeReviewed: false,
                      options: [0, 1, 2, 3].map((score) => ({
                        id: uid("sjt-opt"),
                        text: `Response option ${score + 1}`,
                        keyScore: score,
                      })),
                    },
                  ],
                });
              }}
            >
              <Plus className="size-3" /> Add scenario
            </button>
          </div>
        </Section>
      </div>
    );
  }

  if (settings.kind === "cognitive") {
    return (
      <Section
        title="Cognitive instrument"
        text="This config describes administration. A licensed or locally validated item bank must be attached before scores can affect selection."
      >
        <div className="grid grid-cols-3 gap-4">
          <Field label="Subtests">
            <MultiChoice
              values={settings.subtests}
              options={[
                { value: "numerical", label: "Numerical" },
                { value: "verbal", label: "Verbal" },
                { value: "logical", label: "Logical" },
                { value: "spatial", label: "Spatial" },
                { value: "working_memory", label: "Working memory" },
                { value: "attention", label: "Attention" },
              ]}
              onChange={(subtests) =>
                onChange({
                  ...settings,
                  subtests,
                  criterionMappings: (
                    settings.criterionMappings ?? []
                  ).filter((mapping) => subtests.includes(mapping.unit)),
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Items per subtest">
              <input
                className={INPUT}
                type="number"
                min={6}
                max={15}
                value={settings.itemsPerSubtest}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    itemsPerSubtest: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Total time · minutes">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={settings.totalTimeMin}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    totalTimeMin: Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="space-y-2">
            <Check
              checked={settings.adaptive}
              onChange={(adaptive) => onChange({ ...settings, adaptive })}
              label="Adaptive administration"
            />
            <Check
              checked={settings.calculatorAllowed}
              onChange={(calculatorAllowed) =>
                onChange({ ...settings, calculatorAllowed })
              }
              label="Calculator allowed"
            />
            <div className="text-[10px] text-lo">
              Two unscored practice items are mandatory.
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Field
            label="Subtest-to-criterion mapping"
            help="Each validated subscale contributes to one published job criterion only."
          >
            <CriterionMappingEditor
              units={settings.subtests}
              mappings={settings.criterionMappings ?? []}
              attributes={measuredAttributes}
              onChange={(criterionMappings) =>
                onChange({ ...settings, criterionMappings })
              }
            />
          </Field>
        </div>
      </Section>
    );
  }

  if (settings.kind === "personality") {
    return (
      <Section
        title="Work-style questionnaire"
        text="Personality remains a supporting, job-analysis-linked signal and must never become a clinical or culture-fit diagnosis."
      >
        <div className="grid grid-cols-5 gap-3">
          <Field label="Model">
            <select
              className={INPUT}
              value={settings.model}
              onChange={(event) =>
                onChange({
                  ...settings,
                  model: event.target.value as typeof settings.model,
                })
              }
            >
              <option value="big_five">Big Five</option>
              <option value="hexaco">HEXACO</option>
            </select>
          </Field>
          <Field label="Length">
            <select
              className={INPUT}
              value={settings.lengthItems}
              onChange={(event) =>
                onChange({
                  ...settings,
                  lengthItems: Number(event.target.value) as 60 | 120 | 200,
                })
              }
            >
              <option value={60}>60 items</option>
              <option value={120}>120 items</option>
              <option value={200}>200 items</option>
            </select>
          </Field>
          <Field label="Format">
            <select
              className={INPUT}
              value={settings.format}
              onChange={(event) =>
                onChange({
                  ...settings,
                  format: event.target.value as typeof settings.format,
                })
              }
            >
              <option value="forced_choice">Forced choice</option>
              <option value="likert">Likert</option>
            </select>
          </Field>
          <Check
            checked={settings.contextualizedAtWork}
            onChange={(contextualizedAtWork) =>
              onChange({ ...settings, contextualizedAtWork })
            }
            label="Work-context wording"
          />
          <Check
            checked={settings.candidateFeedbackReport}
            onChange={(candidateFeedbackReport) =>
              onChange({ ...settings, candidateFeedbackReport })
            }
            label="Candidate insight report"
          />
        </div>
        <div className="mt-3">
          <Field
            label="Trait-to-attribute mappings"
            help="Map only constructs supported by the job analysis. Each mapping records its evidence level."
          >
            <div className="space-y-2">
              {settings.traitMappings.map((mapping, index) => (
                <div
                  key={`${mapping.traitId}-${index}`}
                  className="grid grid-cols-[1fr_1fr_150px_28px] gap-2"
                >
                  <input
                    aria-label={`Trait ${index + 1}`}
                    className={INPUT}
                    value={mapping.traitId}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        traitMappings: settings.traitMappings.map(
                          (entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, traitId: event.target.value }
                              : entry,
                        ),
                      })
                    }
                  />
                  <select
                    aria-label={`Attribute for trait ${index + 1}`}
                    className={INPUT}
                    value={mapping.attributeId}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        traitMappings: settings.traitMappings.map(
                          (entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  attributeId: event.target.value,
                                }
                              : entry,
                        ),
                      })
                    }
                  >
                    {attributes.map((attribute) => (
                      <option key={attribute.id} value={attribute.id}>
                        {attribute.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Evidence for trait ${index + 1}`}
                    className={INPUT}
                    value={mapping.evidenceLevel}
                    onChange={(event) =>
                      onChange({
                        ...settings,
                        traitMappings: settings.traitMappings.map(
                          (entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  evidenceLevel: event.target
                                    .value as typeof mapping.evidenceLevel,
                                }
                              : entry,
                        ),
                      })
                    }
                  >
                    <option value="meta-analytic">Meta-analytic</option>
                    <option value="vendor-validated">
                      Vendor validated
                    </option>
                    <option value="experimental">Experimental</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...settings,
                        traitMappings: settings.traitMappings.filter(
                          (_, entryIndex) => entryIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3.5 text-lo" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={BTN}
                disabled={attributes.length === 0}
                onClick={() => {
                  const attribute = attributes[0];
                  if (!attribute) return;
                  onChange({
                    ...settings,
                    traitMappings: [
                      ...settings.traitMappings,
                      {
                        traitId: "",
                        attributeId: attribute.id,
                        evidenceLevel: "experimental",
                      },
                    ],
                  });
                }}
              >
                <Plus className="size-3" /> Add mapping
              </button>
            </div>
          </Field>
        </div>
      </Section>
    );
  }

  if (settings.kind === "integrity_test") {
    return (
      <Section
        title="Integrity and dependability instrument"
        text="Use only for roles where the domains are demonstrably job-relevant. It is never a covert mental-health assessment."
      >
        <div className="grid grid-cols-3 gap-4">
          <Field label="Domains">
            <MultiChoice
              values={settings.domains}
              options={[
                { value: "rule_adherence", label: "Rule adherence" },
                { value: "safety", label: "Safety" },
                { value: "dependability", label: "Dependability" },
                {
                  value: "cwb_attitudes",
                  label: "Counterproductive-work attitudes",
                },
              ]}
              onChange={(domains) =>
                onChange({
                  ...settings,
                  domains,
                  criterionMappings: (
                    settings.criterionMappings ?? []
                  ).filter((mapping) => domains.includes(mapping.unit)),
                })
              }
            />
          </Field>
          <Field label="Length · items">
            <input
              className={INPUT}
              type="number"
              min={8}
              max={200}
              value={settings.lengthItems}
              onChange={(event) =>
                onChange({
                  ...settings,
                  lengthItems: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Format">
            <select
              className={INPUT}
              value={settings.format}
              onChange={(event) =>
                onChange({
                  ...settings,
                  format: event.target.value as typeof settings.format,
                })
              }
            >
              <option value="likert">Likert</option>
              <option value="forced_choice">Forced choice</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Domain-to-criterion mapping"
            help="Do not copy one domain score across multiple traits or requirements."
          >
            <CriterionMappingEditor
              units={settings.domains}
              mappings={settings.criterionMappings ?? []}
              attributes={measuredAttributes}
              onChange={(criterionMappings) =>
                onChange({ ...settings, criterionMappings })
              }
            />
          </Field>
        </div>
      </Section>
    );
  }

  if (settings.kind === "job_knowledge") {
    const updateKnowledge = (next: Partial<JobKnowledgeSettings>) =>
      onChange({ ...settings, ...next });
    return (
      <div className="space-y-4">
        <Section
          title="Knowledge-test policy"
          text="Every item must map to knowledge actually required by observable work, at the difficulty used on the job."
        >
          <div className="grid grid-cols-4 gap-3">
            <Field label="Timing">
              <select
                className={INPUT}
                value={settings.timing}
                onChange={(event) =>
                  updateKnowledge({
                    timing: event.target.value as typeof settings.timing,
                  })
                }
              >
                <option value="total">Total time</option>
                <option value="per_item">Per item</option>
              </select>
            </Field>
            <Field label="Total minutes">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={settings.totalTimeMin ?? 15}
                onChange={(event) =>
                  updateKnowledge({
                    totalTimeMin: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Check
              checked={settings.openBook}
              onChange={(openBook) => updateKnowledge({ openBook })}
              label="Open book"
              help="Changes the construct from recall to information retrieval."
            />
            <Field label="Difficulty mix · easy / medium / hard">
              <div className="grid grid-cols-3 gap-1">
                {(["easy", "medium", "hard"] as const).map((key) => (
                  <input
                    key={key}
                    aria-label={`${key} difficulty percentage`}
                    className={INPUT}
                    type="number"
                    min={0}
                    max={100}
                    value={settings.difficultyMix[key]}
                    onChange={(event) =>
                      updateKnowledge({
                        difficultyMix: {
                          ...settings.difficultyMix,
                          [key]: Number(event.target.value),
                        },
                      })
                    }
                  />
                ))}
              </div>
            </Field>
          </div>
          {settings.timing === "per_item" && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked because the current schema has no frozen
              time cap per item. Use the enforced total timer until per-item
              limits are explicitly authored.
            </p>
          )}
        </Section>
        <Section title={`Frozen item bank · ${settings.items.length}`}>
          <div className="space-y-2">
            {settings.items.map((item, index) => (
              <details key={item.id} className={PANEL}>
                <summary className="cursor-pointer text-[11px] text-hi">
                  {index + 1}. {item.prompt || "Untitled item"}
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3">
                  <Field label="Prompt">
                    <textarea
                      className={`${INPUT} min-h-24`}
                      value={item.prompt}
                      onChange={(event) =>
                        updateKnowledge({
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, prompt: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Type">
                      <select
                        className={INPUT}
                        value={item.type}
                        onChange={(event) =>
                          updateKnowledge({
                            items: settings.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    type: event.target
                                      .value as KnowledgeItemType,
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {[
                          "mcq_single",
                          "mcq_multi",
                          "true_false_justify",
                          "short_answer",
                          "image_hotspot",
                          "sequence",
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Difficulty">
                      <select
                        className={INPUT}
                        value={item.difficulty}
                        onChange={(event) =>
                          updateKnowledge({
                            items: settings.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    difficulty: event.target
                                      .value as typeof item.difficulty,
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        <option>easy</option>
                        <option>medium</option>
                        <option>hard</option>
                      </select>
                    </Field>
                    <Field label="Attribute">
                      <select
                        className={INPUT}
                        value={item.attributeId}
                        onChange={(event) =>
                          updateKnowledge({
                            items: settings.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    attributeId: event.target.value,
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {attributes.map((attribute) => (
                          <option key={attribute.id} value={attribute.id}>
                            {attribute.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Options · prefix correct answers with *">
                    <TextList
                      values={(item.options ?? []).map(
                        (option) =>
                          `${option.correct ? "*" : ""}${option.text}`,
                      )}
                      onChange={(values) =>
                        updateKnowledge({
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  options: values.map((value, optionIndex) => ({
                                    id:
                                      entry.options?.[optionIndex]?.id ??
                                      uid("knowledge-option"),
                                    text: value.replace(/^\*\s*/, ""),
                                    correct: value.startsWith("*"),
                                  })),
                                }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Model answer / key points">
                    <textarea
                      className={`${INPUT} min-h-24`}
                      value={
                        item.modelAnswer ??
                        (item.keyPoints ?? []).join("\n")
                      }
                      onChange={(event) =>
                        updateKnowledge({
                          items: settings.items.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  modelAnswer: event.target.value,
                                  keyPoints: event.target.value
                                    .split("\n")
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                                }
                              : entry,
                          ),
                        })
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className={BTN}
                    onClick={() =>
                      updateKnowledge({
                        items: settings.items.filter(
                          (entry) => entry.id !== item.id,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3" /> Delete item
                  </button>
                </div>
              </details>
            ))}
            <button
              type="button"
              className={BTN}
              disabled={attributes.length === 0}
              onClick={() => {
                const attribute = attributes[0];
                if (!attribute) return;
                updateKnowledge({
                  items: [
                    ...settings.items,
                    {
                      id: uid("knowledge"),
                      type: "short_answer",
                      prompt: "",
                      modelAnswer: "",
                      keyPoints: [],
                      difficulty: "medium",
                      attributeId: attribute.id,
                    },
                  ],
                });
              }}
            >
              <Plus className="size-3" /> Add knowledge item
            </button>
          </div>
        </Section>
      </div>
    );
  }

  if (settings.kind === "language_test") {
    return (
      <Section
        title="Language assessment"
        text="Choose multiple language skills and a CEFR target that is genuinely necessary for the work."
      >
        <div className="grid grid-cols-4 gap-3">
          <Field label="Language">
            <input
              className={INPUT}
              value={settings.language}
              onChange={(event) =>
                onChange({ ...settings, language: event.target.value })
              }
            />
          </Field>
          <Field label="Skills">
            <MultiChoice
              values={settings.skills}
              options={[
                { value: "reading", label: "Reading" },
                { value: "listening", label: "Listening" },
                { value: "writing", label: "Writing" },
                { value: "speaking", label: "Speaking" },
              ]}
              onChange={(skills) =>
                onChange({
                  ...settings,
                  skills,
                  criterionMappings: (
                    settings.criterionMappings ?? []
                  ).filter((mapping) => skills.includes(mapping.unit)),
                })
              }
            />
          </Field>
          <Field label="Target CEFR">
            <select
              className={INPUT}
              value={settings.targetLevel}
              onChange={(event) =>
                onChange({
                  ...settings,
                  targetLevel: event.target
                    .value as typeof settings.targetLevel,
                })
              }
            >
              <option>A2</option>
              <option>B1</option>
              <option>B2</option>
              <option>C1</option>
              <option>C2</option>
            </select>
          </Field>
          <Field label="Minutes per skill">
            <input
              className={INPUT}
              type="number"
              min={1}
              value={settings.minutesPerSkill}
              onChange={(event) =>
                onChange({
                  ...settings,
                  minutesPerSkill: Number(event.target.value),
                })
              }
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field
            label="Skill-to-criterion mapping"
            help="Reading, writing, listening and speaking may support different job requirements."
          >
            <CriterionMappingEditor
              units={settings.skills}
              mappings={settings.criterionMappings ?? []}
              attributes={measuredAttributes}
              onChange={(criterionMappings) =>
                onChange({ ...settings, criterionMappings })
              }
            />
          </Field>
        </div>
      </Section>
    );
  }

  if (settings.kind === "work_sample") {
    return (
      <div className="space-y-4">
        <Section
          title="Work-sample brief"
          text="The task should closely reproduce important work products and conditions while staying proportionate to candidate effort."
        >
          <Field label="Candidate brief">
            <textarea
              className={`${INPUT} min-h-36 leading-relaxed`}
              value={settings.brief}
              onChange={(event) =>
                onChange({ ...settings, brief: event.target.value })
              }
            />
          </Field>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Field label="Deliverables">
              <MultiChoice
                values={settings.deliverables}
                options={[
                  { value: "file", label: "File" },
                  { value: "url", label: "URL" },
                  { value: "rich_text", label: "Rich text" },
                  { value: "spreadsheet", label: "Spreadsheet" },
                ]}
                onChange={(deliverables) =>
                  onChange({ ...settings, deliverables })
                }
              />
            </Field>
            <Field label="Time model">
              <select
                className={INPUT}
                value={settings.timeModel}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timeModel: event.target
                      .value as typeof settings.timeModel,
                  })
                }
              >
                <option value="honesty_window">Honesty window</option>
                <option value="hard_timer">Hard timer</option>
              </select>
            </Field>
            <Field label="Budget · hours">
              <input
                className={INPUT}
                type="number"
                min={0.25}
                step={0.25}
                value={settings.timeBudgetHours}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timeBudgetHours: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="AI-use policy">
              <select
                className={INPUT}
                value={settings.aiPolicy}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    aiPolicy: event.target.value as typeof settings.aiPolicy,
                  })
                }
              >
                <option value="forbidden">Forbidden</option>
                <option value="disclosed">Allowed if disclosed</option>
                <option value="expected">Expected</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-5">
            <Check
              checked={settings.originalityCheck}
              onChange={(originalityCheck) =>
                onChange({ ...settings, originalityCheck })
              }
              label="Originality advisory"
            />
            <Check
              checked={settings.anonymizedGrading}
              onChange={(anonymizedGrading) =>
                onChange({ ...settings, anonymizedGrading })
              }
              label="Anonymous grading"
            />
            <Check
              checked={settings.defenseFollowUp}
              onChange={(defenseFollowUp) =>
                onChange({ ...settings, defenseFollowUp })
              }
              label="Defense probes in next interview"
            />
          </div>
          {(settings.originalityCheck || settings.defenseFollowUp) && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked for enabled controls that lack a frozen
              execution contract. Originality needs a provider, corpus,
              threshold and adjudication policy; defense needs exact questions
              bound to a later interview block.
            </p>
          )}
        </Section>
        <Section title="Exercise-level BARS rubric">
          <RubricEditor
            dimensions={settings.rubricDimensions}
            attributes={measuredAttributes}
            onChange={(rubricDimensions) =>
              onChange({ ...settings, rubricDimensions })
            }
          />
        </Section>
      </div>
    );
  }

  if (settings.kind === "coding") {
    return (
      <div className="space-y-4">
        <Section title="Coding exercise">
          <Field label="Candidate brief">
            <textarea
              className={`${INPUT} min-h-36`}
              value={settings.brief}
              onChange={(event) =>
                onChange({ ...settings, brief: event.target.value })
              }
            />
          </Field>
          <div className="mt-3 grid grid-cols-5 gap-3">
            <Field label="Environment">
              <select
                className={INPUT}
                value={settings.environment}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    environment: event.target
                      .value as typeof settings.environment,
                  })
                }
              >
                <option value="browser_ide">
                  Browser source editor · no execution
                </option>
                <option value="take_home_repo">Take-home repository</option>
              </select>
            </Field>
            <Field label="Languages · comma separated">
              <input
                className={INPUT}
                value={settings.languages.join(", ")}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    languages: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
            <Field label="Task source">
              <select
                className={INPUT}
                value={settings.taskSource}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    taskSource: event.target
                      .value as typeof settings.taskSource,
                  })
                }
              >
                <option value="bank">Validated bank · needs item receipt</option>
                <option value="custom">Custom</option>
                <option value="ai_sme_reviewed">
                  AI + SME reviewed · needs approval receipt
                </option>
              </select>
            </Field>
            <Field label="Time cap · minutes">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={settings.timeCapMin}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timeCapMin: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="AI-use policy">
              <select
                className={INPUT}
                value={settings.aiPolicy}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    aiPolicy: event.target.value as typeof settings.aiPolicy,
                  })
                }
              >
                <option value="forbidden">Forbidden</option>
                <option value="disclosed">Allowed if disclosed</option>
                <option value="expected">Expected</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_180px] gap-3">
            <Field label="Scoring split · correctness / quality / approach">
              <div className="grid grid-cols-3 gap-2">
                {(["correctness", "quality", "approach"] as const).map(
                  (key) => (
                    <input
                      key={key}
                      aria-label={`${key} weight`}
                      className={INPUT}
                      type="number"
                      min={0}
                      max={100}
                      value={settings.scoringSplit[key]}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          scoringSplit: {
                            ...settings.scoringSplit,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                    />
                  ),
                )}
              </div>
              <span className="mt-1 block text-[10px] leading-relaxed text-lo">
                These frozen area weights govern evaluation. Each rubric
                dimension below must be assigned to one area; its own weight is
                relative only to other dimensions in that area.
              </span>
            </Field>
            <Check
              checked={settings.similarityCheck}
              onChange={(similarityCheck) =>
                onChange({ ...settings, similarityCheck })
              }
              label="Similarity advisory"
            />
          </div>
          {settings.similarityCheck && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked until a similarity provider, comparison
              corpus, threshold policy and named-human adjudication path are
              configured.
            </p>
          )}
          {settings.environment === "take_home_repo" && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked: a URL and commit identifier alone do not
              place repository contents in the immutable evidence receipt or
              reviewer workspace. Use the browser source editor until exact
              commit ingestion is implemented.
            </p>
          )}
          {settings.environment === "browser_ide" && (
            <p className="mt-3 text-[10px] leading-relaxed text-lo">
              This is a source-code editor only. Code is not executed and no
              hidden-test result is produced; named reviewers assess the
              submitted source and explanation against the frozen rubric.
            </p>
          )}
          {settings.taskSource !== "custom" && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked because the selected task provenance has no
              frozen bank item/version or named SME approval receipt. Use custom
              source until that provenance is recorded.
            </p>
          )}
        </Section>
        <Section title="Code-quality and approach rubric">
          <RubricEditor
            dimensions={settings.rubricDimensions}
            attributes={measuredAttributes}
            codingScoring
            onChange={(rubricDimensions) =>
              onChange({ ...settings, rubricDimensions })
            }
          />
        </Section>
      </div>
    );
  }

  if (settings.kind === "case_exercise") {
    return (
      <div className="space-y-4">
        <Section title="Case exercise">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Format">
              <select
                className={INPUT}
                value={settings.format}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    format: event.target.value as typeof settings.format,
                  })
                }
              >
                <option value="case_analysis">Case analysis</option>
                <option value="in_basket">In-basket</option>
                <option value="role_play">Role play</option>
                <option value="presentation">Presentation</option>
              </select>
            </Field>
            <Field label="Time box · minutes">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={settings.timeBoxMin}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timeBoxMin: Number(event.target.value),
                  })
                }
              />
            </Field>
            {settings.format === "in_basket" && (
              <Field label="Item count">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  value={settings.itemCount ?? 8}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      itemCount: Number(event.target.value),
                    })
                  }
                />
              </Field>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Case materials">
              <textarea
                className={`${INPUT} min-h-36`}
                value={settings.materials}
                onChange={(event) =>
                  onChange({ ...settings, materials: event.target.value })
                }
              />
            </Field>
            {(settings.format === "role_play" ||
              settings.format === "presentation") && (
              <Field label="Counterpart / audience script">
                <textarea
                  className={`${INPUT} min-h-36`}
                  value={settings.personaScript ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      personaScript: event.target.value,
                    })
                  }
                />
              </Field>
            )}
          </div>
          {settings.format !== "case_analysis" && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
              Publication is blocked for this format. In-basket needs frozen
              items and item-level receipts; role-play needs a disclosed,
              recorded counterpart runtime; presentation needs timed
              presentation capture. The current candidate stage supports case
              analysis responses through text, files or links.
            </p>
          )}
        </Section>
        <Section title="Exercise-level BARS rubric">
          <RubricEditor
            dimensions={settings.rubricDimensions}
            attributes={measuredAttributes}
            onChange={(rubricDimensions) =>
              onChange({ ...settings, rubricDimensions })
            }
          />
        </Section>
      </div>
    );
  }

  if (settings.kind === "doc_verification") {
    return (
      <Section
        title="Document verification"
        text={
          settings.mode === "manual_document_review"
            ? "A named reviewer checks whether the submitted contents meet the published requirement. This does not establish external authenticity."
            : "A connected provider must create a server-owned extraction/match result before adjudication. An upload alone is never treated as verified."
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Verification mode">
            <select
              className={INPUT}
              value={settings.mode}
              onChange={(event) =>
                onChange({
                  ...settings,
                  mode: event.target.value as typeof settings.mode,
                })
              }
            >
              <option value="manual_document_review">
                Named content review
              </option>
              <option value="auto_extract_match">
                Connected provider match
              </option>
            </select>
          </Field>
          <Field label="Accepted formats · comma separated">
            <input
              className={INPUT}
              value={settings.acceptedFormats.join(", ")}
              onChange={(event) =>
                onChange({
                  ...settings,
                  acceptedFormats: event.target.value
                    .split(",")
                    .map((value) => value.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Placement">
            <select
              className={INPUT}
              value={settings.placement}
              onChange={(event) =>
                onChange({
                  ...settings,
                  placement: event.target
                    .value as typeof settings.placement,
                })
              }
            >
              <option value="in_flow">In candidate flow</option>
              <option value="post_shortlist">After shortlist</option>
            </select>
          </Field>
          <Check
            checked={settings.idCheck}
            onChange={(idCheck) => onChange({ ...settings, idCheck })}
            label="Identity check"
            help="Tier 3, final-stage only and explicitly disclosed."
          />
        </div>
        {settings.acceptedFormats.some(
          (format) => !["pdf", "docx"].includes(format.toLowerCase()),
        ) && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
            Publication is blocked because the private upload service currently
            accepts document evidence only as PDF or DOCX.
          </p>
        )}
        {(settings.mode === "auto_extract_match" || settings.idCheck) && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10px] leading-relaxed text-warn">
            Publication is blocked until the selected verification or identity
            provider, disclosure and adjudication receipt contract are bound to
            this vacancy. Named manual content review does not establish issuer
            authenticity or identity.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {settings.requiredDocuments.map((document, index) => (
            <div
              key={document.id}
              className="grid grid-cols-[1fr_1fr_28px] gap-2"
            >
              <input
                aria-label={`Document ${index + 1}`}
                className={INPUT}
                value={document.label}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    requiredDocuments: settings.requiredDocuments.map(
                      (entry) =>
                        entry.id === document.id
                          ? { ...entry, label: event.target.value }
                          : entry,
                    ),
                  })
                }
              />
              <select
                aria-label={`Qualification mapping for ${document.label}`}
                className={INPUT}
                value={document.qualificationAttributeId ?? ""}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    requiredDocuments: settings.requiredDocuments.map(
                      (entry) =>
                        entry.id === document.id
                          ? {
                              ...entry,
                              qualificationAttributeId:
                                event.target.value || undefined,
                            }
                          : entry,
                    ),
                  })
                }
              >
                <option value="">No scored mapping</option>
                {attributes
                  .filter((attribute) => attribute.kind === "qualification")
                  .map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...settings,
                    requiredDocuments: settings.requiredDocuments.filter(
                      (entry) => entry.id !== document.id,
                    ),
                  })
                }
              >
                <Trash2 className="size-3.5 text-lo" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={BTN}
            onClick={() =>
              onChange({
                ...settings,
                requiredDocuments: [
                  ...settings.requiredDocuments,
                  { id: uid("doc"), label: "Required document" },
                ],
              })
            }
          >
            <Plus className="size-3" /> Add document
          </button>
        </div>
      </Section>
    );
  }

  if (settings.kind === "reference_check") {
    return (
      <div className="space-y-4">
        <Section title="Reference collection">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Referee count">
              <select
                className={INPUT}
                value={settings.referees.count}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    referees: {
                      ...settings.referees,
                      count: Number(event.target.value) as 1 | 2 | 3 | 4,
                    },
                  })
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </Field>
            <Field label="Allowed relationships">
              <MultiChoice
                values={settings.referees.relationships}
                options={[
                  { value: "manager", label: "Manager" },
                  { value: "peer", label: "Peer" },
                  { value: "report", label: "Direct report" },
                ]}
                onChange={(relationships) =>
                  onChange({
                    ...settings,
                    referees: { ...settings.referees, relationships },
                  })
                }
              />
            </Field>
            <Field label="Collection window · days">
              <input
                className={INPUT}
                type="number"
                min={1}
                value={settings.collectionWindowDays}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    collectionWindowDays: Number(event.target.value),
                  })
                }
              />
            </Field>
            <div className="space-y-2">
              <Check
                checked={settings.fraudControls}
                onChange={(fraudControls) =>
                  onChange({ ...settings, fraudControls })
                }
                label="Referee fraud controls"
              />
              <Check
                checked={settings.anonymizedAggregation}
                onChange={(anonymizedAggregation) =>
                  onChange({ ...settings, anonymizedAggregation })
                }
                disabled={!settings.anonymizedAggregation}
                label="Anonymous aggregate · unavailable"
                help={
                  settings.anonymizedAggregation
                    ? "Turn this off before publishing. A legacy draft cannot claim anonymity without a server-owned aggregation receipt and minimum-cell enforcement."
                    : "Requires a server-owned aggregation receipt and minimum-cell enforcement. Individual structured responses remain available to authorized reviewers."
                }
              />
            </div>
          </div>
        </Section>
        <Section title="Structured questionnaire">
          <div className="space-y-2">
            {settings.questionnaire.map((question, index) => (
              <div
                key={question.id}
                className="grid grid-cols-[1fr_130px_1fr_28px] gap-2"
              >
                <input
                  aria-label={`Reference question ${index + 1}`}
                  className={INPUT}
                  value={question.text}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      questionnaire: settings.questionnaire.map((entry) =>
                        entry.id === question.id
                          ? { ...entry, text: event.target.value }
                          : entry,
                      ),
                    })
                  }
                />
                <select
                  aria-label={`Type for reference question ${index + 1}`}
                  className={INPUT}
                  value={question.type}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      questionnaire: settings.questionnaire.map((entry) =>
                        entry.id === question.id
                          ? {
                              ...entry,
                              type: event.target
                                .value as typeof question.type,
                            }
                          : entry,
                      ),
                    })
                  }
                >
                  <option value="rating">Rating</option>
                  <option value="open">Open evidence</option>
                </select>
                <select
                  aria-label={`Attribute for reference question ${index + 1}`}
                  className={INPUT}
                  value={question.attributeId ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      questionnaire: settings.questionnaire.map((entry) =>
                        entry.id === question.id
                          ? {
                              ...entry,
                              attributeId: event.target.value || undefined,
                            }
                          : entry,
                      ),
                    })
                  }
                >
                  <option value="">Context only</option>
                  {measuredAttributes.map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...settings,
                      questionnaire: settings.questionnaire.filter(
                        (entry) => entry.id !== question.id,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-3.5 text-lo" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={BTN}
              onClick={() =>
                onChange({
                  ...settings,
                  questionnaire: [
                    ...settings.questionnaire,
                    { id: uid("refq"), text: "", type: "open" },
                  ],
                })
              }
            >
              <Plus className="size-3" /> Add reference question
            </button>
          </div>
        </Section>
      </div>
    );
  }

  if (settings.kind === "human_stage") {
    return (
      <Section
        title="Human interview stage"
        text="Panelists rate independently against the same frozen criteria before discussion."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Panel roles or reviewers · one per line">
            <TextList
              values={settings.panel}
              onChange={(panel) => onChange({ ...settings, panel })}
            />
          </Field>
          <div className="space-y-2">
            <Check
              checked={settings.selfBooking}
              onChange={(selfBooking) =>
                onChange({ ...settings, selfBooking })
              }
              label="Candidate self-booking via employer URL"
              help="Publishing requires the exact HTTPS scheduling link."
            />
            {settings.selfBooking && (
              <Field label="Employer scheduling URL">
                <input
                  className={INPUT}
                  type="url"
                  value={settings.bookingUrl ?? ""}
                  placeholder="https://scheduling.company.example/role"
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      bookingUrl: event.target.value || undefined,
                    })
                  }
                />
              </Field>
            )}
            {settings.interviewKitAuto ? (
              <Check
                checked
                onChange={(interviewKitAuto) =>
                  onChange({ ...settings, interviewKitAuto })
                }
                label="Automatic evidence-gap kit is unavailable · turn off to publish"
                help="No server-owned generation, approval receipt, or frozen panel-delivery contract is connected."
              />
            ) : (
              <div className="rounded-lg border border-hairline bg-void2 px-3 py-2 text-[10px] leading-relaxed text-lo">
                Automatic evidence-gap kit · unavailable until generated
                content has a named approval receipt and frozen panel-delivery
                contract. Author the structured panel protocol explicitly.
              </div>
            )}
            <Check
              checked={settings.aiNotetaker}
              onChange={(aiNotetaker) =>
                onChange({ ...settings, aiNotetaker })
              }
              label="Connected AI notetaker"
              help="Fail-closed until a consented recording, retention and transcript provider is connected."
            />
            <div className="text-[10px] text-pos">
              Independent scoring before discussion is always required.
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (settings.kind === "custom") {
    return (
      <div className="space-y-4">
        <Section
          title="Custom evidence instrument"
          text="Custom methods remain experimental until the employer supplies local validation evidence."
        >
          <Field label="Candidate instructions and assessor protocol">
            <textarea
              className={`${INPUT} min-h-36`}
              value={settings.instructions}
              onChange={(event) =>
                onChange({ ...settings, instructions: event.target.value })
              }
            />
          </Field>
          <div className="mt-3">
            <Field label="Response primitives · select any combination">
              <MultiChoice
                values={settings.primitives}
                options={[
                  { value: "recorder", label: "Recorder" },
                  { value: "text", label: "Text" },
                  { value: "choice", label: "Choice" },
                  { value: "file", label: "File" },
                  { value: "grid", label: "Rating grid" },
                ]}
                onChange={(primitives) =>
                  onChange({ ...settings, primitives })
                }
              />
            </Field>
          </div>
        </Section>
        <Section title="Custom BARS rubric">
          <RubricEditor
            dimensions={settings.rubricDimensions}
            attributes={measuredAttributes}
            onChange={(rubricDimensions) =>
              onChange({ ...settings, rubricDimensions })
            }
          />
        </Section>
      </div>
    );
  }

  return (
    <Section
      title="Method configuration"
      text="This method has no additional candidate-facing settings."
    >
      <div className="text-[11px] text-lo">No additional controls.</div>
    </Section>
  );
}
