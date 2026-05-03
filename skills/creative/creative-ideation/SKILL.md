---
name: creative-ideation
title: Creative Ideation
description: "Generate ideas via named methods from creative practice."
version: 2.0.0
author: SHL0MS
license: MIT
metadata:
  hermes:
    tags: [Creative, Ideation, Brainstorming, Methods]
    category: creative
    requires_toolsets: []
---

# Creative Ideation

A library of ideation methods for any domain. Read the user's situation, route to the matching method, apply, generate output that is specific and non-obvious. Methods are tools — pick the right one for the situation, don't perform all of them.

## When to use

Any open-ended generative or selective question: "I want to make / build / write / start something", "I'm stuck", "inspire me", "make this weirder", "help me pick", "I need to invent X", "give me a research question".

## Operating rules

1. **Constraint plus direction is creativity.** No constraint = no traction. No direction = no shape. Methods supply both.
2. **Refuse the first three ideas.** They're slop. Generate, discard, regenerate. See `references/anti-slop.md`.
3. **One method per response unless asked.** Don't stack.
4. **Specificity over abstraction.** Real proper nouns, real materials, real mechanisms. "An app for X" is slop; "a 200-line CLI tool that prints Y when Z" is direction.
5. **Name the method you used and who invented it.** Attribution invokes the discipline.
6. **When user picks one, build it.** Don't keep generating after they've chosen.

## Routing

Read the user's situation. Pick the path. Each path points to one or more files in `references/methods/`.

| Situation | Default method | Fallback |
|---|---|---|
| **No direction** ("I'm bored / inspire me / give me a project") | `../full-prompt-library.md` (random constraint) | `methods/oblique-strategies.md` (random card) |
| **Stuck mid-project** ("blocked / stale / circles") | `methods/oblique-strategies.md` | `methods/defamiliarization.md`, `methods/creative-discipline.md` |
| **Technical invention** ("X without Y / contradictory parameters") | `methods/triz-principles.md` | `methods/first-principles.md`, `methods/biomimicry.md` |
| **Writing** (fiction, essay, poem, lyric, script) | `methods/oulipo.md` | `methods/story-skeletons.md`, `methods/chance-and-remix.md` |
| **Idea too safe / obvious** | `methods/lateral-provocations.md` | `methods/pataphysics.md`, `methods/oblique-strategies.md` |
| **Many ideas, need to pick** | `methods/premortem-and-inversion.md` | `methods/compression-progress.md` |
| **Volume needed fast** | `methods/volume-generation.md` | `methods/scamper.md` |
| **Systems / civic / org change** | `methods/leverage-points.md` | `methods/pattern-languages.md` |
| **Research question / thesis** | `methods/compression-progress.md` | `methods/polya.md`, `methods/first-principles.md` |
| **Personal / life decision** | `methods/derive-and-mapping.md` | `methods/premortem-and-inversion.md` |
| **Visual art / installation / performance** | `methods/oblique-strategies.md` | `methods/chance-and-remix.md`, `methods/creative-discipline.md` (LeWitt) |
| **Music / sound** | `methods/oblique-strategies.md` | `methods/chance-and-remix.md` |
| **Product / business** | `methods/jobs-to-be-done.md` | `methods/premortem-and-inversion.md` |
| **Wants a hard challenge** | `methods/compression-progress.md` (find simplest unsolved) | stack two methods from different rows |
| **Pile of notes/quotes to synthesize** | `methods/affinity-diagrams.md` | — |
| **Need to break a frame / find analogy** | `methods/analogy-and-blending.md` | `methods/lateral-provocations.md` |

When in doubt, default to the constraint dispatch in `references/full-prompt-library.md`. It's the fastest path and works for the most common request.

## Output format

For the constraint-dispatch default path:

```
## Constraint: [Name] — from [Source]
> [The constraint, one sentence]

### Ideas

1. **[One-line pitch]**
   [2-3 sentences — what specifically is made, why it's interesting]
   ⏱ [weekend/week/month]  •  🔧 [stack/medium/materials]

2. ...
3. ...
```

For other methods, use the format the method specifies (TRIZ produces a contradiction analysis; OuLiPo produces constrained text; Oblique Strategies produces a single applied card → next move). Don't force every method into the constraint template.

## File map

- `references/full-prompt-library.md` — constraint library (default path, fast)
- `references/method-catalog.md` — one-line summary + when-to-use per method
- `references/heuristics.md` — extended decision tree for edge cases
- `references/anti-slop.md` — anti-slop rules; apply to every output
- `references/exercises.md` — time-boxed exercises (5min / 30min / 1hr / day / week)
- `references/methods/` — 22 named methods, one file each, load only the one you're using

## Attribution

Constraint-dispatch core adapted from [wttdotm.com/prompts.html](https://wttdotm.com/prompts.html). Methods drawn from primary sources cited in each method file.
