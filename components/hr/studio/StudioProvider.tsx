"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createEmptyDraft } from "@/lib/studio";
import type { PipelineBlock, Role, VacancyV2 } from "@/lib/types";
import { STORE_KEYS } from "@/lib/types";

interface InitialReviewer {
  userId: string;
  name: string;
  role: Role;
  piiReveal: boolean;
}

interface StudioCtx {
  draft: VacancyV2;
  update: (mutate: (draft: VacancyV2) => VacancyV2) => void;
  replace: (draft: VacancyV2) => void;
  resetBlank: () => void;
  step: number;
  setStep: (step: number) => void;
  entered: boolean;
  setEntered: (entered: boolean) => void;
  hydrated: boolean;
  savedAt: string | null;
  reviewedPreviewSignature: string | null;
  setReviewedPreviewSignature: (signature: string | null) => void;
}

const Ctx = createContext<StudioCtx | null>(null);

function withCurrentReviewer(
  draft: VacancyV2,
  reviewer: InitialReviewer,
): VacancyV2 {
  const roles = draft.governance.roles.filter(
    (role) =>
      role.userId !== "u-ar" &&
      role.name.trim().toLowerCase() !== "a.rakhimova",
  );
  const exists = roles.some((role) => role.userId === reviewer.userId);
  const pipeline = draft.pipeline.map((block): PipelineBlock => {
    let settings: PipelineBlock["settings"] = block.settings;
    if (settings.kind === "async_interview") {
      settings = {
        ...settings,
        order: "fixed",
        introVideo: "none",
        practiceQuestion: false,
        pauseAllowance: 0,
        reviewBeforeSubmit: false,
      };
    } else if (settings.kind === "live_ai_interview") {
      settings = {
        ...settings,
        adaptivity: "probe_only",
        latencyFallback: "async",
        bargeInAllowed: false,
      };
    } else if (settings.kind === "human_stage") {
      settings = {
        ...settings,
        aiNotetaker: false,
        interviewKitAuto: false,
      };
    }
    return {
      ...block,
      settings,
      integrityTier: block.integrityTier > 1 ? 1 : block.integrityTier,
      languageOverride: "en",
    };
  });
  return {
    ...draft,
    profile: {
      ...draft.profile,
      languages: { primary: "en", alternates: [] },
    },
    pipeline,
    scoring: {
      ...draft.scoring,
      weighting:
        draft.scoring.weighting === "pareto_assist"
          ? "rational"
          : draft.scoring.weighting,
    },
    governance: {
      ...draft.governance,
      roles: exists
        ? roles.map((role) =>
            role.userId === reviewer.userId ? reviewer : role,
          )
        : [reviewer, ...roles],
    },
  };
}

export function useStudio(): StudioCtx {
  const context = useContext(Ctx);
  if (!context) {
    throw new Error("useStudio must be used inside <StudioProvider>");
  }
  return context;
}

export default function StudioProvider({
  children,
  initialReviewer,
}: {
  children: React.ReactNode;
  initialReviewer: InitialReviewer;
}) {
  const stableReviewer = useMemo(
    () => ({
      userId: initialReviewer.userId,
      name: initialReviewer.name,
      role: initialReviewer.role,
      piiReveal: initialReviewer.piiReveal,
    }),
    [
      initialReviewer.name,
      initialReviewer.piiReveal,
      initialReviewer.role,
      initialReviewer.userId,
    ],
  );
  const [draft, setDraft] = useState<VacancyV2>(() =>
    withCurrentReviewer(createEmptyDraft(), stableReviewer),
  );
  const [step, setStep] = useState(1);
  const [entered, setEntered] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [reviewedPreviewSignature, setReviewedPreviewSignature] = useState<string | null>(null);
  const canSave = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEYS.draft);
      if (raw) {
        const saved = JSON.parse(raw) as {
          draft: VacancyV2;
          entered: boolean;
          step: number;
          savedAt?: string;
          reviewedPreviewSignature?: string;
        };
        if (saved?.draft) {
          setDraft(withCurrentReviewer(saved.draft, stableReviewer));
          setEntered(saved.entered ?? false);
          setStep(saved.step ?? 1);
          setSavedAt(saved.savedAt ?? null);
          setReviewedPreviewSignature(saved.reviewedPreviewSignature ?? null);
        }
      }
    } catch {
      // Invalid local state is ignored; the fresh server-linked draft remains.
    }
    setHydrated(true);
  }, [stableReviewer]);

  useEffect(() => {
    if (!hydrated) return;
    if (!canSave.current) {
      canSave.current = true;
      return;
    }
    const nextSavedAt = new Date().toISOString();
    try {
      localStorage.setItem(
        STORE_KEYS.draft,
        JSON.stringify({
          draft,
          entered,
          step,
          savedAt: nextSavedAt,
          reviewedPreviewSignature,
        }),
      );
      setSavedAt(nextSavedAt);
    } catch {
      // The in-memory draft remains usable when browser storage is unavailable.
    }
  }, [draft, entered, hydrated, reviewedPreviewSignature, step]);

  const update = useCallback(
    (mutate: (current: VacancyV2) => VacancyV2) => {
      setDraft((current) => mutate(current));
    },
    [],
  );

  const replace = useCallback(
    (next: VacancyV2) =>
      setDraft(withCurrentReviewer(next, stableReviewer)),
    [stableReviewer],
  );

  const resetBlank = useCallback(() => {
    setDraft(withCurrentReviewer(createEmptyDraft(), stableReviewer));
    setStep(1);
    setEntered(false);
    setSavedAt(null);
    setReviewedPreviewSignature(null);
    try {
      localStorage.removeItem(STORE_KEYS.draft);
    } catch {
      // No persisted draft to remove.
    }
  }, [stableReviewer]);

  return (
    <Ctx.Provider
      value={{
        draft,
        update,
        replace,
        resetBlank,
        step,
        setStep,
        entered,
        setEntered,
        hydrated,
        savedAt,
        reviewedPreviewSignature,
        setReviewedPreviewSignature,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
