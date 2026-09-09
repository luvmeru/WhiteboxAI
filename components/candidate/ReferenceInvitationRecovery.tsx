"use client";

import { useState } from "react";
import { Link2, LoaderCircle } from "lucide-react";

interface Delivery {
  refereeOrdinal: number;
  relationship: "manager" | "peer" | "report";
  expiresAt: string;
  deliveryUrl: string;
}

export default function ReferenceInvitationRecovery({
  applicationId,
  blockId,
  compact = false,
}: {
  applicationId: string;
  blockId: string;
  compact?: boolean;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  const recover = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/candidate/applications/${encodeURIComponent(applicationId)}/reference-invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockId }),
        },
      );
      const body = (await response.json()) as {
        referenceCollectionComplete?: boolean;
        referenceInvitations?: Delivery[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error || "Secure links could not be recovered.",
        );
      }
      setComplete(body.referenceCollectionComplete === true);
      setDeliveries(body.referenceInvitations ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Secure links could not be recovered.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "mt-4 border-t border-hairline pt-3"
          : "mt-5 w-full rounded-xl border border-hairline bg-surface p-4 text-left"
      }
    >
      {!deliveries && !complete && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void recover()}
          className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong px-3 py-2 text-[11px] text-hi disabled:opacity-40"
        >
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Link2 className="size-3.5" />
          )}
          Recover pending referee links
        </button>
      )}
      {complete && (
        <p className="text-[11px] leading-relaxed text-pos">
          All required referee responses have been received.
        </p>
      )}
      {deliveries && deliveries.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] leading-relaxed text-lo">
            These are the same active pending links. Completed or revoked
            invitations are never returned.
          </p>
          {deliveries.map((delivery) => (
            <div
              key={delivery.refereeOrdinal}
              className="rounded border border-hairline bg-void2 p-2"
            >
              <div className="font-mono text-[9px] uppercase text-lo">
                Referee {delivery.refereeOrdinal} ·{" "}
                {delivery.relationship}
              </div>
              <div className="mt-1.5 flex gap-2">
                <input
                  readOnly
                  value={delivery.deliveryUrl}
                  aria-label={`Pending link for referee ${delivery.refereeOrdinal}`}
                  className="iris-focus min-w-0 flex-1 rounded border border-hairline bg-surface px-2 py-1.5 font-mono text-[9px] text-hi"
                />
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      delivery.deliveryUrl,
                    )
                  }
                  className="rounded border border-hairline-strong px-2 py-1 text-[10px] text-hi"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[10px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
