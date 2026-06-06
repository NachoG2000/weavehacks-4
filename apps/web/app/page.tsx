"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WEAVE_PROJECT = process.env.NEXT_PUBLIC_WEAVE_PROJECT ?? "weavehacks-4";

interface Resolution {
  key: string;
  status: "resolved" | "escalated";
  value?: string;
  winner?: string;
  reason?: string;
}
interface RunDetail {
  score: number;
  correct: number;
  total: number;
  breakdown: Record<string, string>;
  conflicts?: number;
  resolutions?: Resolution[];
}
interface Scoreboard {
  name: string;
  solo: number;
  team: number;
  delta: number;
  soloDetail?: RunDetail;
  teamDetail?: RunDetail;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Home() {
  const [board, setBoard] = useState<Scoreboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/compare`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setBoard(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "56px 24px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <p style={{ color: "var(--warn)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
            Project A or B — undecided · neutral scenario
          </p>
          <h1 style={{ fontSize: 30, margin: "6px 0 2px", lineHeight: 1.1 }}>Single agent vs. agent team</h1>
          <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 0 }}>
            Same scenario, run two ways. Every agent call and conflict resolution is traced in Weave.
          </p>
        </div>
        <button onClick={run} disabled={loading} style={btnStyle(loading)}>
          {loading ? "Running…" : "Re-run"}
        </button>
      </header>

      {error && (
        <p style={{ color: "#f87171", fontSize: 14, marginTop: 24 }}>
          {error} — is the API up? Run <code>pnpm dev</code> (api on :3001).
        </p>
      )}

      {board && (
        <>
          {/* Delta hero */}
          <section style={{ ...panel, marginTop: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 28, padding: "28px 24px" }}>
            <Score label="Single agent" value={pct(board.solo)} tone="bad" />
            <div style={{ fontSize: 22, color: "var(--muted)" }}>→</div>
            <Score label="Agent team" value={pct(board.team)} tone="good" />
            <div style={{ width: 1, height: 56, background: "var(--border)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Delta</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: "var(--accent)" }}>
                {board.delta >= 0 ? "+" : ""}
                {Math.round(board.delta * 100)}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>points</div>
            </div>
          </section>

          {/* Side-by-side breakdowns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <Column title="Solo agent" subtitle="no roles · last-write-wins" detail={board.soloDetail} />
            <Column title="Agent team" subtitle="roles + verifier + conflict resolution" detail={board.teamDetail} />
          </div>

          {/* The star moment */}
          {board.teamDetail?.resolutions?.length ? (
            <section style={{ ...panel, marginTop: 16 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>What the team caught</h2>
              {board.teamDetail.resolutions.map((r) => (
                <div key={r.key} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 14 }}>
                  <span>{r.status === "escalated" ? "⚠️" : "✅"}</span>
                  <div>
                    <strong>{r.key}</strong>{" "}
                    {r.status === "escalated" ? (
                      <span style={{ color: "var(--warn)" }}>escalated to a human</span>
                    ) : (
                      <span style={{ color: "var(--accent)" }}>resolved → '{r.value}'</span>
                    )}
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>{r.reason}</div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}

      <footer style={{ color: "var(--muted)", fontSize: 13, marginTop: 28 }}>
        Traced in <strong>W&B Weave</strong> · project <code>{WEAVE_PROJECT}</code> —{" "}
        <a href="https://wandb.ai" target="_blank" rel="noreferrer">
          open dashboard
        </a>
        . CLI: <code>pnpm compare</code>, <code>pnpm demo</code>. Scenario is a neutral placeholder
        (generic <code>record_*</code> keys); it's replaced by the real one once we pick A or B.
      </footer>
    </main>
  );
}

const panel: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

function btnStyle(loading: boolean): React.CSSProperties {
  return {
    background: "var(--accent)",
    color: "#06210f",
    border: 0,
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? "wait" : "pointer",
    whiteSpace: "nowrap",
  };
}

function Score({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 800, color: tone === "good" ? "var(--accent)" : "#f87171" }}>{value}</div>
    </div>
  );
}

function Column({ title, subtitle, detail }: { title: string; subtitle: string; detail?: RunDetail }) {
  return (
    <section style={panel}>
      <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
      <p style={{ color: "var(--muted)", fontSize: 12, margin: "2px 0 14px" }}>{subtitle}</p>
      {detail ? (
        <>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            {detail.correct}/{detail.total} records correct
          </div>
          {Object.entries(detail.breakdown).map(([k, v]) => {
            const wrong = v.startsWith("WRONG");
            const escalated = v.includes("escalated");
            return (
              <div key={k} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 13 }}>
                <span>{wrong ? "❌" : escalated ? "⚠️" : "✅"}</span>
                <span style={{ minWidth: 78, fontFamily: "ui-monospace, monospace" }}>{k}</span>
                <span style={{ color: wrong ? "#f87171" : "var(--muted)" }}>{v}</span>
              </div>
            );
          })}
        </>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>no data</p>
      )}
    </section>
  );
}
