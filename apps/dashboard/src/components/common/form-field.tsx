import { Label } from "@reclit/ui/label";
import type { ReactNode } from "react";

/**
 * A label stacked over one control. Every form in the app uses it, so the
 * label-to-control gap is decided once.
 *
 * Pass `htmlFor` for a control the label can target, or `labelId` for one it
 * cannot (`CapsuleSelect` is a radiogroup) and point the control's
 * `aria-labelledby` at it.
 */
export function FormField({
  label,
  htmlFor,
  labelId,
  labelClassName,
  children,
}: {
  label: string;
  htmlFor?: string;
  labelId?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className={labelClassName} htmlFor={htmlFor} id={labelId}>
        {label}
      </Label>
      {children}
    </div>
  );
}
