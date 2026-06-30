import { AnalysisDashboard } from "../components/analysis-dashboard";
import { SupabaseConnectionTest } from "../components/supabase-connection-test";

export default function HomePage() {
  return (
    <>
      <SupabaseConnectionTest />
      <AnalysisDashboard />
    </>
  );
}
