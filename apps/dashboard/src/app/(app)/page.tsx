import { DashboardPanel } from "@/components/dashboard/dashboard-panel";

// Reads live data (the workspace's dashboard config and its sheet).
export const dynamic = "force-dynamic";

export default function Page() {
  return <DashboardPanel />;
}
