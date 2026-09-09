import StudioProvider from "@/components/hr/studio/StudioProvider";
import VacancyStudio from "@/components/hr/studio/VacancyStudio";
import { requireHrSession } from "@/lib/server/auth";

export default async function NewVacancyPage() {
  const session = await requireHrSession(["Owner", "HiringManager"]);
  return (
    <StudioProvider
      initialReviewer={{
        userId: session.sub,
        name: session.email,
        role: session.role,
        piiReveal: session.piiReveal,
      }}
    >
      <VacancyStudio />
    </StudioProvider>
  );
}
