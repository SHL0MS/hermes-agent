# Research Tracker — Workflow Patterns

## Pattern 1: Hypothesis-Driven Exploration

The most common pattern. Start with a question, branch into experiments, merge findings.

```
insight: "Does X improve Y?"
├── empirical: "Experiment A: X with config 1" → committed: positive
├── empirical: "Experiment B: X with config 2" → committed: negative
├── empirical: "Experiment C: baseline without X" → committed: positive (confirms A)
└── meta: "Finding: X improves Y under config 1, not config 2"
    └── insight: "Why does config 2 fail? Hypothesis: Z interferes"
        ├── empirical: "Test Z interference" → ...
        └── ...
```

## Pattern 2: Ablation Study

Systematic removal of components to measure individual contributions.

```
insight: "Which components of our system matter?"
├── empirical: "Full system baseline" → committed: positive (BLEU 32.4)
├── empirical: "Ablation: remove attention" → committed: negative (BLEU 24.1)
├── empirical: "Ablation: remove residual" → committed: mixed (BLEU 30.8)
├── empirical: "Ablation: remove normalization" → committed: negative (BLEU 22.6)
└── meta: "Ablation summary" (attach table artifact with all results)
```

## Pattern 3: Scaling Experiments

Test a finding across different scales.

```
empirical: "Method works at small scale" → committed: positive
├── empirical: "Scale to 1B params" → committed: positive
│   └── empirical: "Scale to 7B params" → committed: positive
│       └── empirical: "Scale to 32B params" → abandoned: "OOM, need different approach"
│           └── empirical: "Scale to 32B with gradient checkpointing" → committed: positive
└── meta: "Scaling analysis: method holds through 32B with gradient checkpointing"
```

## Pattern 4: Reproduce and Extend

Start from a published result, reproduce it, then extend.

```
insight: "Paper claims method X achieves Y"
├── empirical: "Reproduce paper results" → committed: mixed ("BLEU 31.2 vs claimed 32.4")
│   └── artifact: reproduction_log.txt, config.json
├── empirical: "Reproduce with their code" → committed: positive ("BLEU 32.3 with their code")
│   └── artifact: their_code_diff.patch
└── insight: "Our implementation differs in tokenizer"
    ├── empirical: "Fix tokenizer, rerun" → committed: positive ("BLEU 32.5")
    └── empirical: "Our extension: add method Z" → ...
```

## Pattern 5: Multi-Objective Optimization

Track tradeoffs between competing objectives.

```
insight: "Optimize for both speed and quality"
├── empirical: "Config A: optimize quality" → committed: positive (quality=95, speed=2x)
├── empirical: "Config B: optimize speed" → committed: positive (quality=82, speed=10x)
├── empirical: "Config C: balanced" → committed: mixed (quality=90, speed=5x)
└── meta: "Pareto frontier analysis"
    └── artifact: pareto_plot.png, tradeoff_table.csv
```

## Anti-Patterns

### Don't: Linear chains for parallel experiments

```
# BAD: sequential chain hides that experiments are independent
A → B → C → D

# GOOD: parallel branches show independence
A → B
A → C
A → D
```

### Don't: Delete failed experiments

```
# BAD: deleting failures loses information
(n_abc deleted)

# GOOD: abandon with reason
n_abc → abandoned: "Learning rate too high, loss diverged at step 200"
```

### Don't: Mega-nodes

```
# BAD: one node for "all experiments"
n_abc: "Run everything" → committed

# GOOD: one node per experiment
n_abc: "Experiment 1: small model" → committed
n_def: "Experiment 2: large model" → committed
n_ghi: "Experiment 3: distilled model" → committed
```

## Naming Conventions

Good node titles are:
- **Insight:** "Hypothesis: [specific claim]" or "Question: [specific question]"
- **Empirical:** "Experiment: [what you're testing]" or "[Method] on [dataset]"
- **Meta:** "Finding: [conclusion]" or "Comparison: [what's being compared]"

Bad node titles:
- "Test 1", "Run 2", "Try this"
- "Results" (results of what?)
- "New experiment" (what's new about it?)
