# Optimization Audit Log

Auto-appended findings from the Langfuse audit hook.

## Audit 48 — 2026-04-06 06:01:47Z

Window size: 10 turn(s)
Sessions: 20260405_134114_4618f1, 20260405_143116_2070af, 20260405_144906_39bc93, 20260405_144954_5e6b77, 20260405_145153_94254c
Avg requests/turn: 3.9
Avg tools/turn: 3.4
Avg request latency: 11.38s

### Findings
- High average request count per turn (3.90). Consider tightening planning/tool hints or adding more specific next-action guidance to reduce loops.
- Average LLM request latency is elevated (11.38s). Review model/provider choice or reduce oversized context/tool chatter.
- Observed 22 slow LLM requests (>=10s). Check for oversized prompts, high reasoning effort, or provider instability.
- Repeated back-to-back use of the same tool appeared 23 times. A cache, batching helper, or stronger tool hints may help.
- Top tools in this window: terminal×18, read_file×7, skill_view×3, skill_manage×3, patch×3.

### Recent turns
- 2026-04-05 09:02:26Z | session=20260405_143116_2070af | requests=5 | tools=skill_view, skill_view, skill_manage, skill_manage
- 2026-04-05 09:11:33Z | session=20260405_134114_4618f1 | requests=11 | tools=read_file, read_file, patch, patch, patch, terminal, terminal, terminal
- 2026-04-05 09:19:32Z | session=20260405_144906_39bc93 | requests=2 | tools=terminal, terminal, terminal
- 2026-04-05 09:20:39Z | session=20260405_144954_5e6b77 | requests=6 | tools=read_file, read_file, read_file, read_file, read_file
- 2026-04-05 09:21:53Z | session=20260405_134114_4618f1 | requests=8 | tools=terminal, terminal, terminal, terminal, terminal, terminal, terminal
- 2026-04-05 09:22:52Z | session=20260405_145153_94254c | requests=3 | tools=skill_view, skill_manage
- 2026-04-06 04:23:20Z | session=20260406_093822_cc7325 | requests=0 | tools=none
- 2026-04-06 04:23:42Z | session=20260406_095320_3a0fa2 | requests=0 | tools=none
- 2026-04-06 05:42:30Z | session=20260405_134114_4618f1 | requests=4 | tools=terminal, terminal, terminal
- 2026-04-06 06:01:47Z | session=20260406_112812_1e0b2a | requests=0 | tools=none

## Audit 49 — 2026-04-06 06:49:09Z

Window size: 10 turn(s)
Sessions: 20260406_112658_4c9e31, 20260406_112812_5f060b, 20260406_112812_c32675, 20260406_120022_7d5b26, 20260406_120022_7d6562
Avg requests/turn: 0.0
Avg tools/turn: 0.0
Avg request latency: 0.0s

### Findings
- No obvious hot spots in the last 10 turns; current trace behavior looks stable.

### Recent turns
- 2026-04-06 06:05:07Z | session=20260406_112812_5f060b | requests=0 | tools=none
- 2026-04-06 06:06:34Z | session=20260406_112812_c32675 | requests=0 | tools=none
- 2026-04-06 06:10:12Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 06:31:01Z | session=20260406_120022_b2e294 | requests=0 | tools=none
- 2026-04-06 06:35:43Z | session=20260406_120022_7d6562 | requests=0 | tools=none
- 2026-04-06 06:37:26Z | session=20260406_120022_7d5b26 | requests=0 | tools=none
- 2026-04-06 06:42:23Z | session=20260406_120820_529e0f | requests=0 | tools=none
- 2026-04-06 06:43:25Z | session=20260406_120820_e3de0b | requests=0 | tools=none
- 2026-04-06 06:43:57Z | session=20260406_120820_b9632d | requests=0 | tools=none
- 2026-04-06 06:49:09Z | session=20260406_112658_4c9e31 | requests=0 | tools=none

## Audit 50 — 2026-04-06 08:01:49Z

Window size: 10 turn(s)
Sessions: 20260406_112658_4c9e31, 20260406_121909_2abefc, 20260406_124936_7ed37a, 20260406_131125_1097c2, 20260406_131125_5503e5
Avg requests/turn: 0.4
Avg tools/turn: 0.8
Avg request latency: 8.48s

### Findings
- Average LLM request latency is elevated (8.48s). Review model/provider choice or reduce oversized context/tool chatter.
- Top tools in this window: read_file×4, terminal×3, search_files×1.

### Recent turns
- 2026-04-06 06:49:49Z | session=20260406_121909_2abefc | requests=0 | tools=none
- 2026-04-06 06:52:57Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 07:19:36Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 07:20:30Z | session=20260406_124936_7ed37a | requests=0 | tools=none
- 2026-04-06 07:45:41Z | session=20260406_131125_5503e5 | requests=0 | tools=none
- 2026-04-06 07:47:57Z | session=20260406_131125_1097c2 | requests=0 | tools=none
- 2026-04-06 07:49:21Z | session=20260406_131125_ec67fe | requests=0 | tools=none
- 2026-04-06 07:51:32Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 07:52:11Z | session=20260406_132133_c1cd81 | requests=0 | tools=none
- 2026-04-06 08:01:49Z | session=20260406_133058_6278d6 | requests=4 | tools=terminal, read_file, search_files, read_file, read_file, terminal, read_file, terminal

## Audit 51 — 2026-04-06 08:40:19Z

Window size: 10 turn(s)
Sessions: 20260405_134114_4618f1, 20260406_112658_4c9e31, 20260406_133058_8382cb, 20260406_133511_406154, 20260406_135757_4b11e8
Avg requests/turn: 6.0
Avg tools/turn: 4.7
Avg request latency: 7.49s

### Findings
- High average request count per turn (6.00). Consider tightening planning/tool hints or adding more specific next-action guidance to reduce loops.
- Observed 11 slow LLM requests (>=10s). Check for oversized prompts, high reasoning effort, or provider instability.
- Repeated back-to-back use of the same tool appeared 35 times. A cache, batching helper, or stronger tool hints may help.
- Top tools in this window: terminal×34, patch×7, read_file×5, write_file×1.

### Recent turns
- 2026-04-06 08:01:49Z | session=20260406_133058_8382cb | requests=4 | tools=read_file, read_file, terminal, terminal
- 2026-04-06 08:05:11Z | session=20260405_134114_4618f1 | requests=34 | tools=terminal, terminal, terminal, terminal, terminal, terminal, terminal, terminal
- 2026-04-06 08:06:25Z | session=20260406_133511_406154 | requests=8 | tools=none
- 2026-04-06 08:07:00Z | session=20260405_134114_4618f1 | requests=1 | tools=none
- 2026-04-06 08:25:21Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 08:26:06Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 08:27:57Z | session=20260406_112658_4c9e31 | requests=0 | tools=none
- 2026-04-06 08:28:37Z | session=20260406_135757_4b11e8 | requests=0 | tools=none
- 2026-04-06 08:38:34Z | session=20260405_134114_4618f1 | requests=4 | tools=terminal, terminal, terminal
- 2026-04-06 08:40:19Z | session=20260405_134114_4618f1 | requests=9 | tools=read_file, read_file, terminal, patch, patch, patch, terminal, terminal

## Audit 3 — 2026-04-06 09:55:47Z

Window size: 10 turn(s)
Sessions: 20260405_134114_4618f1, 20260406_145438_477d10, 20260406_151251_d55ef0, 20260406_151824_89bcef, 20260406_152107_597095
Avg requests/turn: 1.6
Avg tools/turn: 4.5
Avg request latency: 9.9s

### Findings
- Average LLM request latency is elevated (9.90s). Review model/provider choice or reduce oversized context/tool chatter.
- Observed 6 slow LLM requests (>=10s). Check for oversized prompts, high reasoning effort, or provider instability.
- Repeated back-to-back use of the same tool appeared 28 times. A cache, batching helper, or stronger tool hints may help.
- Top tools in this window: terminal×29, execute_code×6, skill_manage×4, read_file×4, skill_view×2.

### Recent turns
- 2026-04-06 09:43:38Z | session=20260406_151251_d55ef0 | requests=0 | tools=skill_view, skill_manage, skill_manage
- 2026-04-06 09:47:08Z | session=20260406_145438_477d10 | requests=0 | tools=execute_code, execute_code, execute_code
- 2026-04-06 09:48:31Z | session=20260406_151824_89bcef | requests=0 | tools=none
- 2026-04-06 09:49:09Z | session=20260405_134114_4618f1 | requests=12 | tools=terminal, terminal, terminal, read_file, terminal, terminal, terminal, terminal
- 2026-04-06 09:50:27Z | session=debug-sess | requests=0 | tools=none
- 2026-04-06 09:51:19Z | session=20260406_152107_597095 | requests=0 | tools=none
- 2026-04-06 09:51:59Z | session=20260406_145438_477d10 | requests=0 | tools=terminal, terminal, execute_code, terminal, terminal, terminal, terminal, terminal
- 2026-04-06 09:53:01Z | session=20260406_152159_60b4f3 | requests=0 | tools=skill_view, skill_manage, skill_manage
- 2026-04-06 09:54:24Z | session=20260406_145438_477d10 | requests=0 | tools=none
- 2026-04-06 09:55:47Z | session=20260405_134114_4618f1 | requests=4 | tools=read_file, terminal, read_file
