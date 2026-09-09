import {
  ApiError,
  createJsonApiRoute,
  expectArray,
  expectBoolean,
  expectObject,
  expectOnlyKeys,
  getClientKey,
} from "@/lib/server/http";
import {
  appendReferenceEvidenceReceipt,
} from "@/lib/server/repository";
import {
  ReferenceCheckError,
  resolveConsumedReferenceResponse,
  submitReferenceResponse,
} from "@/lib/server/reference-checks";

interface ReferenceResponseBody {
  consent: boolean;
  relationshipConfirmed: boolean;
  answers: unknown[];
}

function validateBody(value: unknown): ReferenceResponseBody {
  const body = expectObject(value);
  expectOnlyKeys(body, [
    "consent",
    "relationshipConfirmed",
    "answers",
  ]);
  return {
    consent: expectBoolean(body.consent, "body.consent"),
    relationshipConfirmed: expectBoolean(
      body.relationshipConfirmed,
      "body.relationshipConfirmed",
    ),
    answers: expectArray(body.answers, "body.answers", {
      min: 1,
      max: 50,
    }),
  };
}

function publicError(error: ReferenceCheckError): ApiError {
  switch (error.code) {
    case "INVALID_TOKEN":
      return new ApiError(404, error.code, error.message);
    case "TOKEN_EXPIRED":
      return new ApiError(410, error.code, error.message);
    case "TOKEN_USED":
      return new ApiError(409, error.code, error.message);
    case "INVALID_RESPONSE":
      return new ApiError(422, error.code, error.message);
    default:
      return new ApiError(409, error.code, error.message);
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ token: string }>;
  },
) {
  const { token } = await params;
  const route = createJsonApiRoute(
    {
      routeId: "public.reference.response",
      access: "public",
      sameOrigin: true,
      maxBodyBytes: 256 * 1024,
      rateLimit: { limit: 12, windowMs: 15 * 60_000 },
      validate: validateBody,
    },
    async ({ body, request: routeRequest, requestId }) => {
      try {
        const pointer = await submitReferenceResponse({
          token,
          consent: body.consent,
          relationshipConfirmed:
            body.relationshipConfirmed,
          answers: body.answers,
          clientAddress: getClientKey(routeRequest),
          userAgent:
            routeRequest.headers.get("user-agent") ?? undefined,
          requestId,
        });
        await appendReferenceEvidenceReceipt(pointer, requestId);
        return {
          completed: true,
          receipt: {
            id: pointer.receiptId,
            receivedAt: pointer.respondedAt,
          },
        };
      } catch (error) {
        if (
          error instanceof ReferenceCheckError &&
          error.code === "TOKEN_USED"
        ) {
          // If the immutable response committed but the application pointer
          // failed transiently, an exact replay repairs that server-owned
          // attachment while the public submission still fails as single-use.
          const pointer =
            await resolveConsumedReferenceResponse(token);
          if (pointer) {
            await appendReferenceEvidenceReceipt(
              pointer,
              requestId,
            );
          }
        }
        if (error instanceof ReferenceCheckError) {
          throw publicError(error);
        }
        throw error;
      }
    },
  );
  return route(request);
}
