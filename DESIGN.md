# DESIGN.md — Brigade

Register: **product** (agentic-first). The owner-facing app lives at `apps/web/app/owner`.

## Theme

Warm light. Scene: the owner between services, laptop at the pass in a warm kitchen, wanting
one trustworthy call. Not a dark ops dashboard, not a dark chat app. The surface feels like a
well-set head-chef's brief on warm paper.

## Color — strategy: Restrained, with one committed identity color

OKLCH. Neutrals tinted warm (toward the accent hue). Persimmon/shoyu is the one committed
color, carrying the agent voice, primary actions, and key figures; semantic colors are used
sparingly and never on inactive states.

```
--paper      oklch(0.975 0.008 80)   warm off-white background
--surface    oklch(0.993 0.005 85)   raised panel (chat, prep sheet)
--surface-2  oklch(0.958 0.010 78)   recessed second neutral
--ink        oklch(0.26 0.018 60)    primary text (never #000)
--ink-soft   oklch(0.44 0.015 60)    secondary text
--muted      oklch(0.58 0.012 65)    labels, captions
--line       oklch(0.90 0.012 75)    hairlines
--accent     oklch(0.62 0.17 42)     persimmon/shoyu — committed identity
--accent-ink oklch(0.45 0.16 40)     accent text on light
--accent-bg  oklch(0.95 0.035 55)    accent tint surface
--up         oklch(0.52 0.10 150)    demand up / grounded-good
--down       oklch(0.52 0.07 50)     demand down (warm, muted)
--warn       oklch(0.66 0.13 75)     attention / awaiting sign-off
--nori       oklch(0.30 0.03 165)    deep green-black, the Chef mark
```

## Typography

- **Inter** (`--font-sans`, via `next/font`): all UI, labels, data, the prep table.
- **Newsreader** (`--font-serif`, via `next/font`): the agent's voice only, the Chef's brief
  and chat messages and section headlines. Serif = the brigade speaking; sans = the product.
- Fixed rem scale, ratio ~1.2. Prose capped ~68ch.

## Layout

Editorial, two columns on desktop: a main reading column (the Chef's brief, the evidence, the
prep sheet, the awaiting-approval post) and a sticky right rail (Ask the Chef). Single column
on mobile, chat last. Generous, varied warm spacing. No card grids, no nested cards.

## Motion

150–250 ms, ease-out (quart/expo). Chat messages fade+rise in; a three-dot typing indicator
while the Chef "thinks". Nothing animates layout properties; no page-load choreography.

## Forbidden (shared bans + register)

No side-stripe accent borders, no gradient text, no glassmorphism, no hero-metric template, no
identical card grids, no modal-first. No em dashes in UI copy. No display fonts in labels/data.
