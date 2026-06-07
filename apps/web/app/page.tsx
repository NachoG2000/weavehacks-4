"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./app.module.css";
import {
  RESTAURANT,
  TARGET,
  brief,
  signals,
  reconciliation,
  proof,
  prep,
  draftPost,
  roster,
  sources,
  activity,
  chatSeed,
  suggestions,
  replyFor,
  type Agent,
  type ChatMsg,
} from "./data";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WEAVE_URL =
  process.env.NEXT_PUBLIC_WEAVE_URL ?? "https://wandb.ai/ignaciongarcia00-empirical/weavehacks-4/weave";

interface Resolution {
  key: string;
  status: "resolved" | "escalated";
  value?: string;
  reason?: string;
}
interface Scoreboard {
  solo: number;
  team: number;
  delta: number;
  teamDetail?: { resolutions?: Resolution[] };
}
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Home() {
  return (
    <div className={s.shell}>
      <TopBar />
      <main className={s.wrap}>
        <Overview />
        <Brigade />
        <Sources />
        <Proof />
      </main>
      <div className={s.wrap}>
        <footer className={s.footer}>
          Hardcoded preview of {RESTAURANT.name}&apos;s brigade. The Chef&apos;s call, the roster and the
          prep sheet are what the live agents produce from your POS, reviews, weather and fixtures. The
          Proof panel below is live from the orchestration runtime, every figure traces to Weave.
        </footer>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className={s.topbar}>
      <div className={s.brand}>
        <span className={s.wordmark}>{RESTAURANT.name}</span>
        <span className={s.brigadeTag}>Brigade</span>
      </div>
      <nav className={s.nav}>
        <a className={s.navLink} href="#overview">
          Overview
        </a>
        <a className={s.navLink} href="#brigade">
          Brigade
        </a>
        <a className={s.navLink} href="#sources">
          Sources
        </a>
        <a className={s.navLink} href="#proof">
          Proof
        </a>
      </nav>
      <div className={s.topRight}>
        <span className={s.statusPill}>
          <span className={s.dot} />
          Brigade on shift
        </span>
        <a className={s.navLink} href={WEAVE_URL} target="_blank" rel="noreferrer">
          Weave
        </a>
        <span className={s.avatar}>LK</span>
      </div>
    </header>
  );
}

function Overview() {
  return (
    <section id="overview" className={s.block}>
      <div className={s.grid}>
        <div>
          <div className={s.briefHead}>
            <span className={s.chefMark}>C</span>
            <div>
              <div className={s.chefName}>Chef</div>
              <div className={s.chefSub}>orchestrating Historian, Scout & Prep · {TARGET.weekday}, {TARGET.dateLabel}</div>
            </div>
          </div>

          <h1 className={s.headline}>
            {brief.headline.pre}
            <em>{brief.headline.em}</em>
            {brief.headline.post}
          </h1>
          <div className={s.briefBody}>
            {brief.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className={s.grounding}>
            <span className={s.groundDot} />
            {brief.grounding}
          </p>

          <div className={s.sub}>
            <h2 className={s.subLabel}>What is different about tonight</h2>
            <div className={s.signals}>
              {signals.map((sig) => (
                <div className={s.signal} key={sig.label}>
                  <div>
                    <div className={s.sigLabel}>{sig.label}</div>
                    <div className={s.sigSource}>{sig.source}</div>
                  </div>
                  <span className={s.sigEffect}>
                    {sig.effect}
                    <span className={s.arrow}>{sig.dir === "up" ? "↑" : "↓"}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={s.sub}>
            <h2 className={s.subLabel}>How the brigade landed on it</h2>
            <div className={s.voices}>
              <Voice v={reconciliation.historian} />
              <Voice v={reconciliation.scout} />
              <Voice v={reconciliation.prep} resolved />
            </div>
            <div className={s.proof} style={{ marginTop: 24 }}>
              <div className={s.proofBars}>
                <Bar who="One agent (average Friday)" err={proof.soloErr} kind="solo" />
                <Bar who="The brigade" err={proof.teamErr} kind="team" />
              </div>
              <p className={s.proofLine}>{proof.line}</p>
              <p className={s.proofNote}>{proof.onTheNight}</p>
            </div>
          </div>

          <div className={s.sub}>
            <h2 className={s.subLabel}>Tonight&apos;s prep sheet</h2>
            <table className={s.prepTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Normal Fri</th>
                  <th>Tonight</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {prep.map((row) => {
                  const d = Math.round(((row.rec - row.normal) / row.normal) * 100);
                  return (
                    <tr key={row.item}>
                      <td className={s.prepItem}>
                        {row.item}
                        <span className={s.prepDriver}>{row.driver}</span>
                      </td>
                      <td className={s.prepNormal}>{row.normal}</td>
                      <td className={s.prepRec}>{row.rec}</td>
                      <td className={`${s.delta} ${d >= 0 ? s.deltaUp : s.deltaDown}`}>
                        {d >= 0 ? "+" : ""}
                        {d}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={s.sub}>
            <h2 className={s.subLabel}>Waiting on your sign-off</h2>
            <DraftPost />
          </div>
        </div>

        <aside className={s.rail}>
          <Chat />
        </aside>
      </div>
    </section>
  );
}

function Voice({ v, resolved }: { v: { role: string; claim: string; basis: string }; resolved?: boolean }) {
  return (
    <div className={`${s.voice} ${resolved ? s.voiceResolved : ""}`}>
      <div className={s.voiceRole}>{v.role}</div>
      <div className={s.voiceClaim}>
        {v.claim}
        <span className={s.voiceBasis}>{v.basis}</span>
      </div>
    </div>
  );
}

function Bar({ who, err, kind }: { who: string; err: number; kind: "solo" | "team" }) {
  return (
    <div className={s.proofItem}>
      <div className={s.proofTop}>
        <span className={s.proofWho}>{who}</span>
        <span className={s.proofErr}>off by {err}%</span>
      </div>
      <div className={s.track}>
        <div className={`${s.fill} ${kind === "solo" ? s.fillSolo : s.fillTeam}`} style={{ width: `${err * 3}%` }} />
      </div>
    </div>
  );
}

function DraftPost() {
  const [approved, setApproved] = useState(false);
  return (
    <div className={s.hitl}>
      <div className={s.hitlHead}>⚑ Draft post · {draftPost.channels} · not sent yet</div>
      <p className={s.hitlPost}>&ldquo;{draftPost.text}&rdquo;</p>
      <p className={s.hitlMeta}>{draftPost.why}</p>
      <div className={s.hitlActions}>
        {approved ? (
          <span className={s.approved}>✓ Approved, queued for 18:30</span>
        ) : (
          <>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setApproved(true)}>
              Approve &amp; schedule
            </button>
            <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setApproved(false)}>
              Edit first
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Brigade() {
  const tiers: { key: Agent["tier"]; label: string }[] = [
    { key: "hero", label: "On shift tonight" },
    { key: "breadth", label: "Standby" },
    { key: "coda", label: "Dormant" },
  ];
  return (
    <section id="brigade" className={s.block}>
      <p className={s.kicker}>The team</p>
      <h2 className={s.blockTitle}>Your brigade of {roster.length} agents</h2>
      <div className={s.activity}>
        {activity.map((a) => (
          <div className={s.activityItem} key={a.label}>
            <span className={s.activityValue}>{a.value}</span>
            <span className={s.activityLabel}>{a.label}</span>
          </div>
        ))}
      </div>
      {tiers.map((t) => {
        const members = roster.filter((r) => r.tier === t.key);
        if (!members.length) return null;
        return (
          <div className={s.tier} key={t.key}>
            <p className={s.tierLabel}>{t.label}</p>
            {members.map((a) => (
              <AgentRow key={a.id} a={a} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function AgentRow({ a }: { a: Agent }) {
  const statClass = a.status === "active" ? s.statActive : a.status === "standby" ? s.statStandby : s.statDormant;
  return (
    <div className={s.agentRow}>
      <div className={s.agentHead}>
        <span className={s.agentName}>{a.name}</span>
        <span className={s.agentAuth}>auth {a.authority}</span>
      </div>
      <div>
        <p className={s.agentDoes}>{a.does}</p>
        <p className={s.agentConflict}>
          <b>Conflict:</b> {a.conflict}
        </p>
      </div>
      <div className={s.agentRight}>
        <span className={`${s.stat} ${statClass}`}>
          <span className={s.statDot} />
          {a.status}
        </span>
        {a.sensitive && <span className={s.sensitive}>needs your sign-off</span>}
      </div>
    </div>
  );
}

function Sources() {
  return (
    <section id="sources" className={s.block}>
      <div className={s.twoCol}>
        <div>
          <p className={s.kicker}>Grounding</p>
          <h2 className={s.blockTitle}>Connected sources</h2>
          <div>
            {sources.map((src) => (
              <div className={s.sourceRow} key={src.name}>
                <span className={`${s.srcDot} ${src.connected ? s.srcOn : ""}`} />
                <span className={s.sourceName}>{src.name}</span>
                <span className={s.sourceRole}>{src.role}</span>
                <span className={s.switch} role="switch" aria-checked={src.connected} aria-label={src.name} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className={s.kicker}>Why it matters</p>
          <h2 className={s.blockTitle}>No ungrounded numbers</h2>
          <p className={s.muted} style={{ marginBottom: 14 }}>
            Agents never invent a quantity. Every claim reaches data only through a tool over one of
            these sources, so the Critic can trace it back or send it for a rewrite.
          </p>
          <p className={s.muted}>
            That is the difference between a chatbot that sounds confident and a brigade you can act on.
          </p>
        </div>
      </div>
    </section>
  );
}

function Proof() {
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
    <section id="proof" className={s.block}>
      <div className={s.proofHeadRow}>
        <div>
          <p className={s.kicker}>System eval · live from the runtime</p>
          <h2 className={s.blockTitle} style={{ margin: 0 }}>
            One agent vs. the team
          </h2>
        </div>
        <button className={`${s.btn} ${s.btnGhost}`} onClick={run} disabled={loading}>
          {loading ? "Running…" : "Re-run"}
        </button>
      </div>
      <p className={s.muted} style={{ marginBottom: 20 }}>
        The same scenario run two ways through the orchestration core, scored against the source of
        truth. This is the number the project is judged on, traced live in Weave.
      </p>

      {error && (
        <p className={s.err}>
          {error}. Start the runtime with <code>pnpm dev</code> (API on :3001), then re-run.
        </p>
      )}

      {board && (
        <div className={s.proof}>
          <div className={s.proofBars}>
            <ScoreBar who="Single agent" score={board.solo} kind="solo" />
            <ScoreBar who="Agent team" score={board.team} kind="team" />
          </div>
          <p className={s.proofLine}>
            Team beats solo by{" "}
            <strong style={{ color: "var(--accent-ink)" }}>
              {board.delta >= 0 ? "+" : ""}
              {Math.round(board.delta * 100)} points
            </strong>{" "}
            on this scenario.
          </p>
          {board.teamDetail?.resolutions?.length ? (
            <div style={{ marginTop: 14 }}>
              {board.teamDetail.resolutions.map((r) => (
                <p key={r.key} className={s.proofLine} style={{ marginTop: 6 }}>
                  {r.status === "escalated" ? "⚠️ " : "✅ "}
                  <strong>{r.key}</strong>{" "}
                  {r.status === "escalated" ? "escalated to a human" : `resolved to "${r.value}"`}
                  {r.reason ? `: ${r.reason}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ScoreBar({ who, score, kind }: { who: string; score: number; kind: "solo" | "team" }) {
  return (
    <div className={s.proofItem}>
      <div className={s.proofTop}>
        <span className={s.proofWho}>{who}</span>
        <span className={s.proofErr}>{pct(score)}</span>
      </div>
      <div className={s.track}>
        <div className={`${s.fill} ${kind === "team" ? s.fillTeam : s.fillSolo}`} style={{ width: `${score * 100}%` }} />
      </div>
    </div>
  );
}

function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>(chatSeed);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function ask(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { from: "owner", text: q }]);
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      setMessages((m) => [...m, { from: "chef", text: replyFor(q) }]);
      setThinking(false);
    }, 650);
  }

  return (
    <div className={s.chat}>
      <div className={s.chatHead}>
        <span className={s.chefMark}>C</span>
        <div>
          <div className={s.chatTitle}>Ask the Chef</div>
          <div className={s.chatSub}>grounded in your POS, reviews & today</div>
        </div>
      </div>
      <div className={s.thread} ref={threadRef}>
        {messages.map((m, i) => (
          <div key={i} className={`${s.msg} ${m.from === "chef" ? s.msgChef : s.msgOwner}`}>
            {m.from === "chef" && <div className={s.msgFrom}>Chef</div>}
            {m.text}
          </div>
        ))}
        {thinking && (
          <div className={s.typing} aria-label="Chef is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <div className={s.chips}>
        {suggestions.map((q) => (
          <button key={q} className={s.chip} onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          className={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about tonight…"
          aria-label="Message the Chef"
        />
        <button className={s.send} type="submit" disabled={!input.trim() || thinking}>
          Send
        </button>
      </form>
    </div>
  );
}
