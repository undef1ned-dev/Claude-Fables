import { describe, expect, mock, test } from 'claude-code/testing'

const band = (isWorking: boolean) =>
  ({
    plugin: 'fables',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 120 },
  }) as const

describe('the compact button', () => {
  test('asks twice before compacting, gives up on its own, and hides while Claude works', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    mock.store(on)
    let compactions = 0
    const toasts: string[] = []
    on('session.compact', () => {
      compactions++
      const summary = { role: 'user', text: 'Summary of the conversation so far.', toolUses: [] }
      return { messages: [summary], tokensBefore: 180_000, tokensAfter: 22_000 } as any
    })
    on('ui.toast', ($, e: any) => {
      toasts.push(e.text)
      return { value: undefined } as any
    })
    on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: 180_000, window: 1_000_000, percent: 18 } } }) as any)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as any)
    on('command.register', (_, e) => ({ value: { command: e.name } }) as any)
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}) as any)

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)

    // While Claude works there is nothing to press: compaction would be refused.
    const busy = await $.ui.mount(band(true) as any)
    expect(await busy.find({ key: 'fables-compact' })).toBeUndefined()
    await busy.unmount()

    const ui = await $.ui.mount(band(false) as any)
    const label = async () => ((await ui.find({ key: 'fables-compact' })) as any)?.props?.label
    expect(await label()).toBe('⟲ Сжать')

    // One press only arms it, and left alone it disarms.
    await ui.press({ key: 'fables-compact' })
    expect(await label()).toBe('Точно сжать?')
    expect(compactions).toBe(0)
    await clock.advance(5000)
    expect(await label()).toBe('⟲ Сжать')

    // Two presses compact, and a toast says what it saved.
    await ui.press({ key: 'fables-compact' })
    await ui.press({ key: 'fables-compact' })
    expect(compactions).toBe(1)
    expect(toasts.at(-1)).toBe('Контекст сжат: 180k → 22k')
    expect(await label()).toBe('⟲ Сжать')
    await ui.unmount()
  })

  test('where the session cannot compact between turns, it runs the /compact command instead', async ($, on) => {
    mock.clock(on, { now: 0 })
    mock.store(on)
    // No session.compact beneath the plugin: the call rejects, as it does in a headless session.
    const commands: string[] = []
    on('command.run', { command: 'compact' }, ($, e: any) => {
      commands.push(`${e.command} ${e.args}`.trim())
      return { text: '' } as any
    })
    const toasts: string[] = []
    on('ui.toast', ($, e: any) => {
      toasts.push(e.text)
      return { value: undefined } as any
    })
    on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: 1000, window: 1_000_000, percent: 0 } } }) as any)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as any)
    on('command.register', (_, e) => ({ value: { command: e.name } }) as any)
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}) as any)

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    const ui = await $.ui.mount(band(false) as any)
    await ui.press({ key: 'fables-compact' })
    await ui.press({ key: 'fables-compact' })
    expect(toasts).toEqual(['Сжатие запущено'])
    expect(commands).toEqual(['compact'])
    await ui.unmount()
  })
})
