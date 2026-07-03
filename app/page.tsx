import { AnalysisDashboard } from "../components/analysis-dashboard";
import { AuthGate } from "../components/auth-gate";
import { SupabaseConnectionTest } from "../components/supabase-connection-test";

export default function HomePage() {
  return (
    <AuthGate>
      <SupabaseConnectionTest />
      <AnalysisDashboard />
    </AuthGate>
  );
}
