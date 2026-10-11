import { describe, expect, mock, test } from 'claude-code/testing'

import { IDLE_EVERY_MS, IDLE_SCENES, idleScene } from '../hooks/idle'
import { parseScene } from '../hooks/scene'
import { MAX_SVG, sceneToSvg } from '../hooks/svg'
import { LOOK_NAMES } from '../hooks/looks'

const BAND = {
  plugin: 'fables',
  surface: 'desktop',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

describe('the idle reel', () => {
  test('every idle scene passes the validator unchanged and fits the Svg element in every look', () => {
    for (const s of IDLE_SCENES) {
      expect(parseScene(JSON.parse(JSON.stringify(s)))).toEqual(s)
      for (const look of LOOK_NAMES) {
        expect(sceneToSvg(s, { width: 1200, height: 192, look, figure: '3d' }).length).toBeLessThanOrEqual(MAX_SVG)
      }
    }
  })

  test('the reel goes round, whatever the step', () => {
    expect(idleScene(0)).toBe(IDLE_SCENES[0])
    expect(idleScene(IDLE_SCENES.length + 1)).toBe(IDLE_SCENES[1])
    expect(idleScene(-1)).toBe(IDLE_SCENES[IDLE_SCENES.length - 1])
  })

  test('plays in a new window without asking the model, moves on, and /fables idle off stops it', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    mock.store(on)
    let asks = 0
    on('model.complete', () => {
      asks++
      return { value: { isAnswered: false, reason: 'api-error', status: 500, error: 'unknown', usage: {} } } as any
    })
    on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: 1000, window: 200_000, percent: 1 } } }) as any)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as any)
    on('command.register', (_, e) => ({ value: { command: e.name } }) as any)
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}) as any)

    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)
    const ui = await $.ui.mount(BAND as any)
    const first = (await ui.find({ type: 'Svg' } as any)) as any
    expect(first).toBeDefined()

    await clock.advance(IDLE_EVERY_MS)
    const second = (await ui.find({ type: 'Svg' } as any)) as any
    expect(second).toBeDefined()
    expect(second.props?.alt ?? second.alt).not.toBe(first.props?.alt ?? first.alt)
    expect(asks).toBe(0)

    await $.command.run({ command: 'fables', args: 'idle off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as any)
    expect(await ui.find({ type: 'Svg' } as any)).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /контекста/ })).toBeDefined()
    await ui.unmount()
  })
})
