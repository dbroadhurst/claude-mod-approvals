import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Approval, Board } from '../types'

// One board of decisions per project, kept across sessions in $.store.
const PANE = 'approvals'
const TITLE = 'Approvals'
const board = atom({ plugin: 'approvals', key: 'board' } as const, { root: '', items: [] })
const expanded = atom({ plugin: 'approvals', key: 'expanded' } as const, [])

const MAX_RESOLVED = 30
const storeKey = (root: string) => `board:${root}`

const GUIDE = [
  'Approvals pane (the `approvals` plugin): the person sees the decisions you need from them in a pane beside the chat, each with Approve and Chat buttons.',
  '- Whenever you put a decision to the person with a recommendation, also call `mcp__approvals__ask` with a short id (the design-doc id if there is one), a title of a few words, and the recommendation condensed to one line (about 100 characters). Put the reasoning in `why` and the other options in `alternatives`, a line each.',
  '- When the person answers in chat (approves, picks another option, or drops it), call `mcp__approvals__resolve` with the id and the outcome in a few words.',
  '- A prompt starting "Approved [id]" came from the pane\'s Approve button: act on the recommendation as given. "Re [id]" is the person discussing it.',
].join('\n')

const pending = (b: Board) => b.items.filter(i => i.status === 'pending')
const oneLine = (s: string | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// Applies `fn` to the board, keeps the decided list bounded and persists it.
async function change($: EngineInterface, fn: (items: Approval[]) => Approval[]): Promise<Board> {
  let saved: Board = { root: '', items: [] }
  await update($, board, prev => {
    const items = fn(prev.items)
    const open = items.filter(i => i.status === 'pending')
    const done = items
      .filter(i => i.status !== 'pending')
      .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
      .slice(0, MAX_RESOLVED)
    saved = { root: prev.root, items: [...open, ...done] }
    return saved
  })
  await $.store.set(storeKey(saved.root), saved.items)
  return saved
}

async function settle($: EngineInterface, id: string, status: Approval['status'], outcome: string): Promise<Board> {
  const now = await $.clock.now()
  return change($, items => items.map(i => (i.id === id ? { ...i, status, outcome, resolvedAt: now } : i)))
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const root = await $.session.root()
    const items = ((await $.store.get(storeKey(root))) as Approval[] | undefined) ?? []
    await update($, board, () => ({ root, items }))

    await $.command.register({
      name: 'approvals',
      description: 'Show or hide the pane of decisions waiting for you',
    })
    await $.tool.register({
      name: 'ask',
      description:
        'Adds (or updates, by id) a decision the person needs to make to their Approvals pane, with your recommendation condensed to one line. Call it whenever you put a decision to them with a recommendation.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short id, e.g. the design-doc decision id (K7) or a slug' },
          title: { type: 'string', description: 'A few words naming the decision' },
          recommendation: { type: 'string', description: 'Your recommendation in one line, about 100 characters' },
          why: { type: 'string', description: 'The reasoning, one or two lines' },
          alternatives: { type: 'string', description: 'The other options, one line' },
        },
        required: ['id', 'title', 'recommendation'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'resolve',
      description:
        'Marks a decision on the Approvals pane as settled once the person has answered it in chat (approved, another option chosen, or dropped).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          outcome: { type: 'string', description: 'What was decided, a few words' },
        },
        required: ['id', 'outcome'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'list',
      description: 'Lists the decisions still waiting on the Approvals pane.',
      isDeferred: false,
    })

    if (items.some(i => i.status === 'pending')) void openPane($)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      ...composed,
      sections: [...composed.sections, { id: 'approvals:guide', text: GUIDE, scope: 'session' as const }],
    }
  })

  on('command.run', { command: 'approvals' }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'Approvals pane closed.' }
    }
    await openPane($)
    return { text: 'Approvals pane opened.' }
  })

  on('tool.call', { tool: 'mcp__approvals__ask' }, async ($, e) => {
    const input = e as unknown as Partial<Approval>
    const id = oneLine(input.id, 40)
    if (!id || !input.title || !input.recommendation) {
      return { deny: 'approvals: id, title and recommendation are required.' }
    }
    const now = await $.clock.now()
    const item: Approval = {
      id,
      title: oneLine(input.title, 80),
      recommendation: oneLine(input.recommendation, 300),
      why: input.why ? oneLine(input.why, 600) : undefined,
      alternatives: input.alternatives ? oneLine(input.alternatives, 600) : undefined,
      status: 'pending',
      askedAt: now,
    }
    const saved = await change($, items => [...items.filter(i => i.id !== id), item])
    void openPane($)
    return { result: `Added ${id} to the Approvals pane (${pending(saved).length} waiting).` }
  })
    .catch(() => ({ deny: 'approvals: the ask tool failed.' }))

  on('tool.call', { tool: 'mcp__approvals__resolve' }, async ($, e) => {
    const { id, outcome } = e as unknown as { id: string; outcome: string }
    const b = await read($, board)
    if (!b.items.some(i => i.id === id)) return { result: `No decision ${id} on the pane.` }
    const saved = await settle($, id, 'resolved', oneLine(outcome, 120))
    return { result: `Resolved ${id}. ${pending(saved).length} still waiting.` }
  })
    .catch(() => ({ deny: 'approvals: the resolve tool failed.' }))

  on('tool.call', { tool: 'mcp__approvals__list' }, async $ => {
    const open = pending(await read($, board))
    const text = open.length
      ? open.map(i => `${i.id}: ${i.title} → ${i.recommendation}`).join('\n')
      : 'Nothing waiting.'
    return { result: text }
  })
    .catch(() => ({ deny: 'approvals: the list tool failed.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, board)
    const open = b.items.filter(i => i.status === 'pending').sort((x, y) => x.askedAt - y.askedAt)
    const done = b.items.filter(i => i.status !== 'pending')
    const shown = new Set(await read($, expanded))
    const width = Math.max(20, (e.props.bodyColumns ?? 40) - 2)

    const toggle = (key: string) =>
      update($, expanded, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))

    const approve = async (i: Approval) => {
      await settle($, i.id, 'approved', 'approved as recommended')
      void $.prompt.submit({ text: `Approved [${i.id}] ${i.title}: go with your recommendation (${i.recommendation}).` })
    }
    const chat = async (i: Approval) => {
      await $.prompt.fill({ text: `Re [${i.id}] ${i.title}: `, mode: 'replace' })
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>
          {open.length === 0 ? 'Nothing waiting for you' : `${open.length} waiting for you`}
        </Text>
        {open.map((i, n) => {
          const isOpen = shown.has(i.id)
          return (
            <Box key={`item-${i.id}`} flexDirection="column">
              <Text bold wrap="truncate-end">
                {n + 1}. {i.title} <Text dimColor>[{i.id}]</Text>
              </Text>
              <Text color="green" wrap={isOpen ? 'wrap' : 'truncate-end'}>
                ✓ {isOpen ? i.recommendation : oneLine(i.recommendation, width * 2)}
              </Text>
              {isOpen && i.why && <Text dimColor wrap="wrap">Why: {i.why}</Text>}
              {isOpen && i.alternatives && <Text dimColor wrap="wrap">Or: {i.alternatives}</Text>}
              <Box flexDirection="row" gap={1}>
                <Button key={`approve-${i.id}`} variant="primary" label="Approve" onPress={() => approve(i)} />
                <Button key={`chat-${i.id}`} label="Chat" onPress={() => chat(i)} />
                {(i.why || i.alternatives || i.recommendation.length > width) && (
                  <Button key={`more-${i.id}`} dimColor plain label={isOpen ? 'less' : 'more'} onPress={() => toggle(i.id)} />
                )}
              </Box>
            </Box>
          )
        })}
        {done.length > 0 && (
          <Box key="history" flexDirection="column">
            <Button
              key="history-toggle"
              dimColor
              plain
              label={`${shown.has('#history') ? '▾' : '▸'} Decided (${done.length})`}
              onPress={() => toggle('#history')}
            />
            {shown.has('#history') &&
              done.map(i => (
                <Text key={`done-${i.id}`} dimColor wrap="truncate-end">
                  {i.status === 'approved' ? '✓' : '•'} {i.title} [{i.id}]{i.outcome ? `: ${i.outcome}` : ''}
                </Text>
              ))}
            {shown.has('#history') && (
              <Button key="clear" dimColor plain label="clear history" onPress={() => change($, items => items.filter(x => x.status === 'pending'))} />
            )}
          </Box>
        )}
      </Box>
    )
  })
}
