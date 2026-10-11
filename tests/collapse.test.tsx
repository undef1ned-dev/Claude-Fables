import { describe, expect, mock, test } from 'claude-code/testing'

const SCENE = JSON.stringify({
  backdrop: 'forest',
  hero: { action: 'walk', from: 10, to: 60 },
  caption: 'Reading `register.tsx`',
  tone: 'work',
})

const BAND = {
  plugin: 'fables',
  surface: 'desktop',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120 },
} as const

describe('the close button', () => {
  test('folds the cartoon to the token weather and stops asking the model until unfolded', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    mock.store(on)
    let asks = 0
    let tokens = 36_100
    on('model.complete', () => {
      asks++
      return { value: { isAnswered: true, text: SCENE, usage: { input_tokens: 1, output_tokens: 1 } } } as any
    })
    on('session.usage', () => ({
      value: { startedAt: 0, rateLimits: [], context: { tokens, window: 200_000, percent: Math.round(tokens / 2_000) } },
    }) as any)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as any)
    on('prompt.submit', ($, e) => ({ text: e.text }) as any)
    on('turn.complete', () => ({ text: '' }) as any)
    on('command.register', () => ({ value: undefined }) as any)
    // What the engine draws in the band when no plugin does: an empty row.
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}) as any)

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    const ui = await $.ui.mount(BAND as any)

    // Before anything is asked the idle reel plays, the weather beneath it, and no model is asked.
    expect(await ui.find({ type: 'Svg' } as any)).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Ясно/ })).toBeDefined()
    expect(asks).toBe(0)

    await $.prompt.submit({ text: 'fix the date bug' } as any)
    await clock.advance(1000)
    await clock.advance(1000)
    expect(asks).toBe(1)
    // The cartoon is up, with the weather beneath it.
    expect(await ui.find({ type: 'Svg' } as any)).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /18% контекста/ })).toBeDefined()

    // The live reading follows the work without waiting for the turn to end.
    tokens = 134_400
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: /Дождь/ })).toBeDefined()

    await ui.press({ key: 'fables-collapse' })
    expect(await ui.find({ key: 'fables-expand' })).toBeDefined()
    expect(await ui.find({ type: 'Svg' } as any)).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /67% контекста/ })).toBeDefined()

    // Folded: a whole new turn of work goes by and not one scene is asked for.
    asks = 0
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)
    await $.prompt.submit({ text: 'and add a test' } as any)
    for (let i = 0; i < 30; i++) await clock.advance(1000)
    expect(asks).toBe(0)
    expect(await ui.find({ type: 'Text', text: /за ход/ })).toBeDefined()

    // Unfolded: the story picks up again.
    await ui.press({ key: 'fables-expand' })
    for (let i = 0; i < 3; i++) await clock.advance(1000)
    expect(asks).toBeGreaterThan(0)
    expect(await ui.find({ key: 'fables-collapse' })).toBeDefined()
    await ui.unmount()
  })
})
