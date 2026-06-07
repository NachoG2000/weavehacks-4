"use client";

import { useEffect, useRef, useState } from "react";
import s from "./owner.module.css";
import {
  RESTAURANT,
  TARGET,
  brief,
  signals,
  reconciliation,
  proof,
  prep,
  draftPost,
  chatSeed,
  suggestions,
  replyFor,
  type ChatMsg,
} from "./data";

const WEAVE_URL =
  process.env.NEXT_PUBLIC_WEAVE_URL ?? "https://wandb.ai/ignaciongarcia00-empirical/weavehacks-4/weave";

export default function OwnerPage() {
  const [messages, setMessages] = useState<ChatMsg[]>(chatSeed);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [approved, setApproved] = useState(false);
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
    <div className={s.shell}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.wordmark}>{RESTAURANT.name}</span>
          <span className={s.brigadeTag}>Brigade</span>
        </div>
        <div className={s.topRight}>
          <span>
            {TARGET.weekday}, {TARGET.dateLabel}
          </span>
          <span className={s.statusPill}>
            <span className={s.dot} />
            Brigade on shift
          </span>
          <a className={s.weaveLink} href={WEAVE_URL} target="_blank" rel="noreferrer">
            Traces in Weave
          </a>
        </div>
      </header>

      <main className={s.grid}>
        {/* ── reading column ── */}
        <div>
          <div className={s.briefHead}>
            <span className={s.chefMark}>C</span>
            <div>
              <div className={s.chefName}>Chef</div>
              <div className={s.chefSub}>orchestrating Historian, Scout & Prep</div>
            </div>
          </div>

          <h1 className={s.headline}>
            Friday is not a normal Friday. Cook for <em>about 28% more</em>, weighted to broth.
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

          {/* signals */}
          <section className={s.section}>
            <h2 className={s.sectionLabel}>What is different about tonight</h2>
            <div className={s.signals}>
              {signals.map((sig) => (
                <div className={s.signal} key={sig.label}>
                  <div>
                    <div className={s.sigLabel}>{sig.label}</div>
                    <div className={s.sigSource}>{sig.source}</div>
                  </div>
                  <span />
                  <span className={s.sigEffect}>
                    {sig.effect}
                    <span className={s.arrow}>{sig.dir === "up" ? "↑" : "↓"}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* reconciliation + proof */}
          <section className={s.section}>
            <h2 className={s.sectionLabel}>How the brigade landed on it</h2>
            <div className={s.voices}>
              <Voice v={reconciliation.historian} />
              <Voice v={reconciliation.scout} />
              <Voice v={reconciliation.prep} resolved />
            </div>

            <div className={s.proof} style={{ marginTop: 24 }}>
              <div className={s.proofBars}>
                <div className={s.proofItem}>
                  <div className={s.proofTop}>
                    <span className={s.proofWho}>One agent (average Friday)</span>
                    <span className={s.proofErr}>off by {proof.soloErr}%</span>
                  </div>
                  <div className={s.track}>
                    <div className={`${s.fill} ${s.fillSolo}`} style={{ width: `${proof.soloErr * 3}%` }} />
                  </div>
                </div>
                <div className={s.proofItem}>
                  <div className={s.proofTop}>
                    <span className={s.proofWho}>The brigade</span>
                    <span className={s.proofErr}>off by {proof.teamErr}%</span>
                  </div>
                  <div className={s.track}>
                    <div className={`${s.fill} ${s.fillTeam}`} style={{ width: `${proof.teamErr * 3}%` }} />
                  </div>
                </div>
              </div>
              <p className={s.proofLine}>{proof.line}</p>
              <p className={s.proofNote}>{proof.onTheNight}</p>
            </div>
          </section>

          {/* prep sheet */}
          <section className={s.section}>
            <h2 className={s.sectionLabel}>Tonight&apos;s prep sheet</h2>
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
          </section>

          {/* HITL */}
          <section className={s.section}>
            <h2 className={s.sectionLabel}>Waiting on your sign-off</h2>
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
                    <button className={`${s.btn} ${s.btnGhost}`} onClick={() => ask("Make the post quieter")}>
                      Ask Chef to revise
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── chat rail ── */}
        <aside className={s.rail}>
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
        </aside>
      </main>

      <footer className={s.footer}>
        Hardcoded preview of the owner view. The Chef&apos;s call, the evidence, and the prep sheet are
        what the live brigade produces from {RESTAURANT.name}&apos;s POS, reviews, weather and fixtures,
        with every figure traceable in Weave.
      </footer>
    </div>
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
