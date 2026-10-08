# approvals — a Claude Code mod

A pane beside the chat that lists the decisions Claude needs from you. Each one is condensed to two lines, a title and Claude's recommendation, so the list is easy to scroll:

```
3 waiting for you

1. Capsule sky [AD-Q1]
✓ "Race under the lights": the track's own sky, no painted glow
[ Approve ]  Chat  more
```

- **Approve** settles it and tells Claude to go ahead with its recommendation.
- **Chat** puts `Re [id] <title>: ` in your prompt box so you can answer in your own words.
- **more** opens the reasoning and the alternatives in place.
- Decided items fold into a `▸ Decided (n)` row.

Claude adds items itself: the mod gives it three tools (`ask`, `resolve`, `list`) and a short instruction to use them whenever it puts a decision to you with a recommendation. If you answer in chat instead of pressing Approve, Claude marks the item settled.

The list is kept per project and survives restarts. The pane opens by itself when something is waiting; `/approvals` shows or hides it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install approvals --marketplace dbroadhurst/claude-mod-approvals
```

Answer `y` to add the marketplace, then choose a scope (user scope loads it in every session).

## Where the pane shows

In the fullscreen layout with a terminal at least 110 columns wide, the pane docks beside the transcript (144 columns when it opens by itself). Narrower, or on the main-screen layout, it sits above the prompt.

## Notes

- Built on Claude Code's function-hooks plugin API (Claude Code 2.1.294), which is early access and may change between releases.
- Develop from a clone with `claude --plugin-dir <path>`; check with `claude plugin validate .` and `claude plugin test .`.

MIT licensed.
