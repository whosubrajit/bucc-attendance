import { Badge } from "@/components/ui/badge";

/** Color-coded attendance status: 🟢 Present | 🟡 Pending | 🔴 Left */
export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PRESENT":
      return (
        <Badge tone="green">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" aria-hidden /> Present
        </Badge>
      );
    case "PENDING_SIGNOUT":
      return (
        <Badge tone="yellow">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-amber-500" aria-hidden /> Pending Sign-Out
        </Badge>
      );
    case "LEFT":
      return (
        <Badge tone="red">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Left
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}
