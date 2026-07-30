# The Gauntlet Loop

A reusable prompt for Claude Code / Codex. Fill in `[GOAL]` and `[BAR]`, paste, run.

---

```
I want you to bring [GOAL] to the level of [BAR]. Every detail should be perfect
against that bar — from the smallest interaction to the overall feel.

Break the goal into the smallest pieces that can be improved and judged on their
own. For each piece, fan out a sub-agent to build it and a separate sub-agent
with fresh context to critique it. The critic must inspect the real output, not
the code: put it side by side with the bar, blind, say which one is better, and
name the single biggest remaining gap. Send that gap back and build again.

That critic should be a really harsh critic. If ours doesn't win the blind
comparison, keep going.

Don't stop until every critic is genuinely wowed by ours next to the bar. Keep a
simple live page showing the pieces, the rounds and the verdicts as they evolve.
/loop until it's utterly perfect. Fan out sub-agents and ultracode.
```

---

## Choosing the bar

The bar is the whole trick. It has to be something an agent can actually open,
look at, and lose to. "Make it beautiful" is not a bar. "Beat this screenshot in
a blind A/B" is.

A good bar is:

- **Concrete** — a file, a screenshot, a measurement, a trace. Not an adjective.
- **External** — produced by someone better than us, not by the agent grading itself.
- **Comparable** — same format, same conditions, so a side-by-side is fair.
- **Losable** — it must be possible for our output to lose, or the loop never runs.

Examples of the same idea in other domains:

| Goal | Bar |
|---|---|
| A game's visuals | Real screenshots of the AAA title, matched camera and lighting |
| A mobile UI | App Store screenshots of the best app in the category, same viewport |
| A CLI | `asciinema` recording of the tool everyone praises, same task |
| An API | The reference implementation's docs and response payloads, same endpoint |
| Copy | The competitor's landing page, same section, read aloud |
| Latency | A flamegraph of the fastest known implementation, same workload |

When no external artifact can be fetched, the fallback is a **reconstruction**
plus **hard invariants**: rebuild the reference as faithfully as you can from
what is documented about it, and pair it with numbers that cannot be argued with
(contrast ratios, tap-target sizes, grid adherence, step counts, frame budget).
Say plainly that it is a reconstruction — a bar you drew yourself is weaker than
one you were handed.

## Keeping the blind A/B honest

The critic inspects the real output, so it knows which one is ours. Strip that
knowledge before it judges:

1. Shuffle the two artifacts into neutral names (`a.png`, `b.png`) and write the
   mapping to a file.
2. The critic judges A and B and commits its verdict in writing.
3. Only then does it read the mapping.

A verdict written after the reveal is not a verdict.
