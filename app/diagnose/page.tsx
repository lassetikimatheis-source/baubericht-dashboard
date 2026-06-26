import { checkSharedStorageStatus } from "../../lib/server/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SharedStorageStatus = Awaited<ReturnType<typeof checkSharedStorageStatus>>;
type DiagnosticCheck = SharedStorageStatus["connection"];

export default async function DiagnosePage() {
  const status = await checkSharedStorageStatus();
  const envOk = status.environment.projectUrl.valid && status.environment.serverKey.present && status.environment.publishableKey.present;

  return (
    <main className="diagnosticPage">
      <header className="diagnosticHeader">
        <div>
          <p className="eyebrow">Systemdiagnose</p>
          <h1>Supabase Diagnose</h1>
          <p>{status.message}</p>
        </div>
        <a className="button buttonPrimary" href="/api/shared-storage/status">
          JSON Status
        </a>
      </header>

      <section className="diagnosticSummary" aria-label="Supabase Diagnose Zusammenfassung">
        <SummaryCard
          title="Env-Variablen vorhanden"
          ok={envOk}
          value={yesNo(envOk)}
          detail={envOk ? "Project URL, Publishable Key und Server-Key sind gesetzt." : "Mindestens eine relevante Env-Variable fehlt oder ist ungueltig."}
        />
        <SummaryCard title="Supabase-Verbindung" check={status.connection} />
        <SummaryCard title="Tabellen vorhanden" check={status.tables} value={yesNo(status.canReadTables)} />
        <SummaryCard title="Bucket paribus-files vorhanden" check={status.bucket} value={yesNo(status.bucketExists)} />
        <SummaryCard title="Schreibtest erfolgreich" check={status.writeTest} value={yesNo(status.canWrite)} />
      </section>

      <section className="diagnosticPanel">
        <div className="panelHeader">
          <div>
            <h2>Environment</h2>
            <p>Secrets werden nicht angezeigt, nur ob Variablen vorhanden sind.</p>
          </div>
        </div>
        <div className="diagnosticTableWrap">
          <table className="diagnosticTable">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Vorhanden</th>
                <th>Gueltig</th>
                <th>Genutzt</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {status.environment.variables.map((variable) => (
                <tr key={variable.name}>
                  <td>{variable.name}</td>
                  <td><StatusBadge ok={variable.present} /></td>
                  <td>{typeof variable.valid === "boolean" ? <StatusBadge ok={variable.valid} /> : "n/a"}</td>
                  <td><StatusBadge ok={variable.used} /></td>
                  <td>{variable.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="diagnosticPanel">
        <div className="panelHeader">
          <div>
            <h2>Checks</h2>
            <p>Die Diagnose prueft Verbindung, Tabellen, Storage Bucket und einen temporaeren Schreibvorgang.</p>
          </div>
        </div>
        <div className="diagnosticCheckList">
          <CheckRow label="Project URL" check={{
            ok: status.environment.projectUrl.valid,
            state: status.environment.projectUrl.valid ? "pass" : "fail",
            message: status.environment.projectUrl.message
          }} />
          <CheckRow label="Server-Key" check={{
            ok: status.environment.serverKey.present,
            state: status.environment.serverKey.present ? "pass" : "fail",
            message: status.environment.serverKey.message
          }} />
          <CheckRow label="Supabase-Verbindung" check={status.connection} />
          <CheckRow label={`Storage Bucket ${status.bucket.name}`} check={status.bucket} />
          <CheckRow label={`Schreibtest ${status.writeTest.table}`} check={status.writeTest} />
        </div>
      </section>

      <section className="diagnosticPanel">
        <div className="panelHeader">
          <div>
            <h2>Tabellen</h2>
            <p>Alle folgenden Tabellen muessen durch `supabase-schema.sql` angelegt sein.</p>
          </div>
        </div>
        <div className="diagnosticTableWrap">
          <table className="diagnosticTable">
            <thead>
              <tr>
                <th>Tabelle</th>
                <th>Status</th>
                <th>HTTP</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {status.tables.required.map((table) => (
                <tr key={table.name}>
                  <td>{table.name}</td>
                  <td><StatusBadge ok={table.ok} /></td>
                  <td>{table.status ?? "n/a"}</td>
                  <td>{table.detail || table.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  title,
  check,
  ok,
  value,
  detail
}: {
  title: string;
  check?: DiagnosticCheck;
  ok?: boolean | null;
  value?: string;
  detail?: string;
}) {
  const resolvedOk = check ? check.ok : ok ?? null;
  return (
    <article className="diagnosticCard">
      <span>{title}</span>
      <strong>{value || yesNo(resolvedOk)}</strong>
      <StatusBadge ok={resolvedOk} />
      <p>{detail || check?.message || ""}</p>
    </article>
  );
}

function CheckRow({ label, check }: { label: string; check: DiagnosticCheck }) {
  return (
    <div className="diagnosticCheckRow">
      <div>
        <strong>{label}</strong>
        <p>{check.detail || check.message}</p>
      </div>
      <div className="diagnosticCheckMeta">
        <StatusBadge ok={check.ok} />
        <span>{check.status ? `HTTP ${check.status}` : "n/a"}</span>
      </div>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean | null }) {
  const className = ok === true ? "diagnosticBadge diagnosticBadgePass" : ok === false ? "diagnosticBadge diagnosticBadgeFail" : "diagnosticBadge diagnosticBadgeSkip";
  return <span className={className}>{yesNo(ok)}</span>;
}

function yesNo(value: boolean | null): string {
  if (value === true) return "Ja";
  if (value === false) return "Nein";
  return "Nicht getestet";
}
