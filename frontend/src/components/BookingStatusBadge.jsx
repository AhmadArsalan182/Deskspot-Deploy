import { CheckCircle2, XCircle } from "lucide-react";

export default function BookingStatusBadge({ status }) {
  const cancelled = status === "CANCELLED";
  const Icon = cancelled ? XCircle : CheckCircle2;
  return (
    <span className={`badge badge--${cancelled ? "cancelled" : "active"}`}>
      <Icon size={13} aria-hidden="true" />
      {cancelled ? "Cancelled" : "Confirmed"}
    </span>
  );
}
