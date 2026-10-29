export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

const KNOWN_STATUSES: readonly string[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

export function asSubscriptionStatus(
  raw: unknown,
): SubscriptionStatus | null {
  return typeof raw === "string" && KNOWN_STATUSES.includes(raw)
    ? (raw as SubscriptionStatus)
    : null;
}

export const TRIAL_DAYS = 14;

export type PaywallInput = {
  enabled: boolean;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  now: Date;
};

export type AccessReason =
  | "self-hosted"
  | "trial"
  | "subscribed"
  | "payment-late"
  | "trial-over"
  | "subscription-over";

export type CarnetAccess = {
  open: boolean;
  reason: AccessReason;
  daysLeft: number | null;
  until: Date | null;
  endingAt: Date | null;
};

export function daysUntil(target: Date, now: Date): number {
  const ms = target.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
}

export function carnetAccess(input: PaywallInput): CarnetAccess {
  const { enabled, status, currentPeriodEnd, cancelAtPeriodEnd, trialEndsAt, now } =
    input;

  if (!enabled)
    return {
      open: true,
      reason: "self-hosted",
      daysLeft: null,
      until: null,
      endingAt: null,
    };

  const paidPeriodLeft =
    currentPeriodEnd !== null && currentPeriodEnd.getTime() > now.getTime();

  if (status === "active" || status === "trialing")
    return {
      open: true,
      reason: "subscribed",
      daysLeft: null,
      until: currentPeriodEnd,
      endingAt: cancelAtPeriodEnd ? currentPeriodEnd : null,
    };

  if (status === "past_due")
    return {
      open: true,
      reason: "payment-late",
      daysLeft: null,
      until: currentPeriodEnd,
      endingAt: null,
    };

  if (status !== null && paidPeriodLeft)
    return {
      open: true,
      reason: "subscribed",
      daysLeft: null,
      until: currentPeriodEnd,
      endingAt: currentPeriodEnd,
    };

  const trialLeft =
    trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();
  if (trialLeft)
    return {
      open: true,
      reason: "trial",
      daysLeft: daysUntil(trialEndsAt!, now),
      until: trialEndsAt,
      endingAt: null,
    };

  return {
    open: false,
    reason: status === null ? "trial-over" : "subscription-over",
    daysLeft: 0,
    until: null,
    endingAt: null,
  };
}
