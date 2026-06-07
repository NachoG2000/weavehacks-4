# PRODUCT.md — Brigade

> Synthesized from the project's real domain (Le Kyoto / the agent brigade) instead of a
> full interview. Refine anytime with `/impeccable teach`.

**Register:** product

## Product purpose

Brigade is an agentic-first ops copilot for independent restaurants. A team of AI agents (the
kitchen "brigade") turns a restaurant's own data, three years of POS, public reviews, weather,
and local events, into ONE trustworthy call the owner can act on each day: what to prep, what
to promote, what to watch. The reasoning is shown and traceable, and anything that touches
money or public reputation waits for the owner's sign-off.

The pitch is "service as software": not a dashboard the owner has to interpret, but a brigade
that does the analysis and hands back a decision, in plain language, that the owner can
interrogate by asking back.

## Users

The owner/operator of a small independent restaurant (Le Kyoto, a ramen takeout/delivery spot
in Paris). Not an analyst. Time-poor, reads this between services or on a phone at the pass.
Wants the conclusion and one clear action, not charts to decode. Trusts it only if the numbers
visibly trace to real data, and only if it never quietly spends money or posts in their name.

## Tone

A trusted head chef's briefing: warm, calm, specific, confident, plain-spoken. Names real
numbers and their source. Never hypey, never hedgy, never corporate.

## Anti-references

- Generic SaaS analytics dashboards: card grids, gradient KPI tiles, hero-metric headers.
- Dark "AI chat app" aesthetics; neon-on-black; crypto.
- Anything that reads as "AI made that" by reflex (see DESIGN.md category checks).

## Strategic principles

1. **The agent leads.** The Chef's written call is the primary content; the data is the
   evidence beneath it. Agentic-first, not a dashboard with a bolted-on chatbot.
2. **Every claim is grounded and traceable.** Each figure cites its source (POS, reviews,
   canon) and is logged as a Weave trace the owner could open.
3. **Show the disagreement.** The Historian's baseline and the Scout's read of today genuinely
   conflict; Prep reconciles. The reconciliation is the proof, not noise to hide.
4. **Human-in-the-loop for money and reputation.** Promos and public posts are drafted, never
   auto-sent. The owner approves.
5. **One clear action over a wall of charts.** Density is fine where it earns trust (the prep
   sheet); the top of the page is a decision, not a metrics grid.
