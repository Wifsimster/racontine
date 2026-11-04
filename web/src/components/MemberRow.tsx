import { Trash2 } from "lucide-react";
import { ROLE_LABELS, type MemberRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ROLES: MemberRole[] = ["reader", "contributor", "admin"];

export function MemberRow({
  name,
  meta,
  detail,
  leading,
  trailing,
  children,
  className,
}: {
  name: React.ReactNode;
  meta?: React.ReactNode;
  detail?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex flex-col gap-2 py-3", className)}>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
        {leading}
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <p className="min-w-0 text-ui">
            <span className="font-bold break-words">{name}</span>
            {meta && (
              <span className="text-meta text-muted-foreground"> — {meta}</span>
            )}
          </p>
          {detail && (
            <p className="truncate text-meta text-muted-foreground">{detail}</p>
          )}
        </div>
        {trailing && (
          <div className="flex shrink-0 items-center gap-1">{trailing}</div>
        )}
      </div>
      {children}
    </li>
  );
}

export function RoleControl({
  role,
  locked,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  role: MemberRole;
  locked?: boolean;
  disabled?: boolean;
  onChange?: (role: MemberRole) => void;
  "aria-label": string;
}) {
  if (locked || !onChange)
    return (
      <span className="px-2 text-meta text-muted-foreground">
        {ROLE_LABELS[role]}
      </span>
    );
  return (
    <Select
      value={role}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-40"
      onChange={(e) => onChange(e.target.value as MemberRole)}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

export function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
      onClick={onClick}
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}
