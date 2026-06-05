import type { ReactNode } from "react";

type GroupPageFrameProps = {
  children: ReactNode;
  className?: string;
  /** Fill remaining height (e.g. replenishment / excel grids) */
  contentFill?: boolean;
};

/** Content area below the global AppTopbar — ledger spacing. */
export function GroupPageFrame({
  children,
  className = "",
  contentFill = false,
}: GroupPageFrameProps) {
  return (
    <div
      className={[
        "flex w-full min-w-0 flex-col px-6 py-5 lg:px-8 lg:py-6",
        contentFill ? "min-h-0 flex-1 overflow-hidden" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={contentFill ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}>
        {children}
      </div>
    </div>
  );
}
