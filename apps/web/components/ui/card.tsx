import * as React from "react";
import { cn } from "@/lib/utils";

type Div = React.HTMLAttributes<HTMLDivElement>;

export const Card = ({ className, ...p }: Div) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: Div) => (
  <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: Div) => (
  <h3 className={cn("text-base font-semibold", className)} {...p} />
);
export const CardDescription = ({ className, ...p }: Div) => (
  <p className={cn("text-sm text-slate-500", className)} {...p} />
);
export const CardContent = ({ className, ...p }: Div) => <div className={cn("p-5 pt-0", className)} {...p} />;
