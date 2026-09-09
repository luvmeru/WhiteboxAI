import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import ReferenceQuestionnaire from "@/components/candidate/ReferenceQuestionnaire";
import {
  ReferenceCheckError,
  getPublicReferenceQuestionnaire,
} from "@/lib/server/reference-checks";

export const metadata: Metadata = {
  title: "Secure work reference · WhiteBox",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReferencePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    const questionnaire =
      await getPublicReferenceQuestionnaire(token);
    return (
      <ReferenceQuestionnaire
        token={token}
        questionnaire={questionnaire}
      />
    );
  } catch (error) {
    const message =
      error instanceof ReferenceCheckError
        ? error.message
        : "This reference invitation is unavailable.";
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <LockKeyhole className="size-8 text-mid" />
        <h1 className="mt-4 font-display text-[27px] text-hi">
          Invitation unavailable
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mid">
          {message}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-lo">
          Ask the candidate or hiring team for a new invitation if this link
          expired. Completed links cannot be reused.
        </p>
      </div>
    );
  }
}
