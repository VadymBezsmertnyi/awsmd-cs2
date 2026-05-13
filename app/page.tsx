import type { FC } from "react";

import DemoDashboard from "@/app/components/demo-dashboard";

const homePage: FC = () => (
  <div className="min-h-full flex-1 bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
    <DemoDashboard />
  </div>
);

export default homePage;
