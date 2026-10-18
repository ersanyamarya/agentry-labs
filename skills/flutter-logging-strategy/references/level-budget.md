# Level budget — the harder calls

Read this when a level choice isn't obvious, or when someone pushes back on the budget.

## The two questions that resolve most disputes

**1. Did the operation recover?** This settles `WARNING` vs `SEVERE` far better than arguing about severity. A failed network write that stays queued for retry is `WARNING` — the system handled it, the user loses nothing. A cache reset that deleted rows is `SEVERE` — nothing recovers that. "The user was annoyed" is not severity; "the data is gone" is.

**2. How often does this fire per user action?** This settles everything at `INFO` and below. Once per action → `INFO`. Several times per action → `FINE`. Once per item in a loop or per inbound message → `FINER`. If you can't answer, the line is in the wrong place — you don't know how hot the path is.

## Worked examples

| Situation | Level | Why |
|---|---|---|
| Write failed, queued for retry | `WARNING` | Recovered; the queue is the recovery |
| Write failed, row dropped | `SEVERE` | Nothing recovers it |
| Local store incompatible, deleting and recreating | `SEVERE` | Destroys user data, even though the app continues |
| Auth rejected the credentials | `WARNING` | Expected outcome of a wrong password; the UI shows it |
| Auth threw something unrecognized | `SEVERE` | Unexpected; carries a stack |
| User cancelled a picker or sign-in sheet | *nothing* | Not a failure. Logging it trains people to ignore logs |
| Sync finished: "pushed 3, 2 still queued" | `INFO` | Once per sync, and genuinely worth seeing |
| Connection state changed | `FINE` | Several per action, especially with retries |
| One inbound message received | `FINER` | Per-message |
| Unknown enum value from the server, defaulted | `FINER` or nothing | The whole point of the default is to absorb this quietly |
| Server sent a value that made you *drop* a record | `WARNING` | Absorbing is fine; silently losing data is not |

That last pair is the distinction worth internalizing. Substituting a default and dropping a row look similar in code and are completely different in consequence. Same for the cancel row: a path whose "error" is the expected outcome should stay silent, and a log there is worse than no log because it teaches readers that warnings are ignorable.

## `CONFIG`, `SHOUT`, and `FINEST`

`logging` gives you eight levels. Using all eight is a mistake — nobody remembers the ordering, and the extra precision buys nothing.

- **`CONFIG`** sits between `INFO` and `FINE`. Skip it unless the project genuinely wants a separate "here is the resolved configuration at startup" channel. If you do use it, use it *only* for that, once, at boot.
- **`SHOUT`** is above `SEVERE`. Skip it. If everything important is `SEVERE`, a level above it just invites debate about which disasters are the real disasters.
- **`FINEST`** is worth *reserving* rather than using. Leaving it unused gives you somewhere to go when a specific investigation needs one more notch, without renumbering everything else. An unused level is a feature.

Five levels in active use — `SEVERE`, `WARNING`, `INFO`, `FINE`, `FINER` — is the sweet spot.

## Pushback you should expect, and honest answers

**"Why not just log everything and filter later?"** Because filtering requires the log to be readable enough that someone notices there's something to filter for. Unbounded `INFO` means the one line that mattered scrolls past. Also, in release builds the gated levels cost a comparison while ungated ones cost string construction on every call.

**"Why keep anything in release?"** Because the alternative is that a user reports a bug and the device carries no diagnostic content at all. `WARNING` and above is a small, bounded volume by construction — if it isn't, the levels are wrong and that's worth discovering.

**"Isn't `WARNING` for things a user should see?"** No — user-facing messaging is a separate concern with its own copy and localization. Levels describe severity *to whoever is reading the log*. A `WARNING` may be completely invisible in the UI, and often should be.

## When the budget is being violated

The reliable symptom is that someone says "the logs are useless" or stops reading them. When that happens, don't add filtering — recount. Pick one common user action, count the lines it produces, and look at what's above `FINE`. Almost always a handful of `INFO`s are firing per-item rather than per-operation. Demoting those fixes the readability problem without losing anything, because the detail is still there one level down.
