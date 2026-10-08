import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'approvals',
  props: { title: 'Approvals', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { top: 0, bodyRows: 30, treeRows: 0 }, view: {} },
} as const

test('a decision shows on the pane and Approve settles it', async ($, on) => {
  const submitted: string[] = []
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('prompt.fill', async () => ({ value: { isFilled: true } }) as never)
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)

  await $.tool.call({
    tool: 'mcp__approvals__ask',
    id: 'K7',
    title: 'Harbour Lights in launch build',
    recommendation: 'Yes: it is built and approved; the night track shows more than sunset',
    why: 'All phases approved; only the PO play-test is left',
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'approvals', surface, ...PANE } as never)
    expect(await ui.find({ type: 'Text', text: /1 waiting for you/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Harbour Lights in launch build/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'approvals', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'approve-K7' })
  expect(submitted[0]).toMatch(/^Approved \[K7\]/)
  expect(await ui.find({ type: 'Text', text: /Nothing waiting for you/ })).toBeDefined()

  const listed = await $.tool.call({ tool: 'mcp__approvals__list' } as never)
  expect(String((listed as { result?: unknown }).result)).toBe('Nothing waiting.')
})
