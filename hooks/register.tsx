import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_MODEL, Director, findModel, type Host, MODEL_LABELS, NARRATOR_MODELS, type NarratorModel } from './director'
import { DEFAULT_LOOK, findLook, LOOK_NAMES, LOOKS, lookFor } from './looks'
import type { FablesScene, WeatherReading } from '../types'

import { H, MAX_SVG, resumeAt, sceneToSvg, speaksAfter, W } from './svg'
import { pushReading, weatherTexts } from './weather'

const scene = atom({ plugin: 'fables', key: 'scene' } as const, null)
const enabled = atom({ plugin: 'fables', key: 'enabled' } as const, true)
const style = atom({ plugin: 'fables', key: 'style' } as const, DEFAULT_LOOK)
const collapsed = atom({ plugin: 'fables', key: 'collapsed' } as const, false)
const weatherNow = atom({ plugin: 'fables', key: 'weatherNow' } as const, null)
const weatherTurns = atom({ plugin: 'fables', key: 'weatherTurns' } as const, [] as WeatherReading[])

/** How often the live forecast is read while the session runs: a local read, no model call. */
const WEATHER_EVERY_MS = 5000

const STORE_ENABLED = 'enabled'
const STORE_COLLAPSED = 'collapsed'
const STORE_PIXEL = 'pixelArt'
const STORE_STYLE = 'style'
const STORE_MODEL = 'model'
/** Every scene is drawn with the 3D Claude, in the style the person chose (looks.ts). */
const FIGURE = '3d'
/** This plugin's own tools, if it ever registers any, are not part of the story. */
const OWN_TOOLS = 'mcp__fables__'

/**
 * The band's code font advance in CSS pixels: the desktop measures the band in
 * cells of it, and the Svg wants pixels.
 */
const PX_PER_COLUMN = 8
/** CSS pixels per stage unit: the stage's H units come out this many times taller. */
const SCALE = 1.5

/**
 * The band's box in CSS pixels: its whole width, at a fixed height so the art and
 * the caption keep one size whatever the window; the stage widens to fill it.
 */
function bandBox(columns: number): { width: number; height: number } {
  const width = Number.isFinite(columns) && columns > 0 ? Math.round(columns * PX_PER_COLUMN) : W * SCALE
  return { width, height: Math.round(H * SCALE) }
}

/** The narrator's host in a session: Claude Code's clock, its model, the band, and how the band draws a scene. */
function host($: EngineInterface, band: Band): Host {
  return {
    now: () => $.clock.now(),
    complete: ask => $.model.complete(ask),
    show: drawn => update($, scene, () => drawn),
    speaksAfter: async next => speaksAfter((await draw($, band, next)).base) * 1000,
  }
}

async function chooseLook($: EngineInterface, n: Director, name: string) {
  const look = lookFor(name)
  n.look = look.name
  await $.store.set(STORE_STYLE, look.name)
  await update($, style, () => look.name)
  return { text: `Scenes are now drawn as ${look.label}.` }
}

async function chooseModel($: EngineInterface, n: Director, model: NarratorModel) {
  n.model = model
  await $.store.set(STORE_MODEL, model)
  return { text: `${MODEL_LABELS[model]} now writes the story.` }
}

async function setOn($: EngineInterface, n: Director, at: Host, value: boolean) {
  await n.setOn(at, value)
  await $.store.set(STORE_ENABLED, value)
  await update($, enabled, () => value)
  // Turning it on unfolds it too, so /fables on always brings the cartoon back.
  if (value) await setCollapsed($, n, at, false)
}

/**
 * Reads the context window; `isTurnEnd` also adds it to the sparkline's turns.
 * The live reading is written only when it changed, so the band is not drawn
 * again for nothing.
 */
async function refreshWeather($: EngineInterface, isTurnEnd: boolean) {
  // The forecast is a nicety: a session that cannot say its usage just has none.
  const context = await $.session.usage().then(
    usage => usage.context,
    () => undefined,
  )
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  const reading: WeatherReading = { tokens, window: context.window, percent }
  const was = await read($, weatherNow)
  if (was?.tokens !== reading.tokens || was.window !== reading.window) await update($, weatherNow, () => reading)
  if (isTurnEnd) await update($, weatherTurns, turns => pushReading(turns, reading))
}

/**
 * Folded, the band is the token weather alone and the narrator stops asking
 * the model, so no tokens go on scenes nobody sees; the activity log still
 * fills, so the story picks up where the work is once it is unfolded.
 */
async function setCollapsed($: EngineInterface, n: Director, at: Host, value: boolean) {
  await $.store.set(STORE_COLLAPSED, value)
  await update($, collapsed, () => value)
  const isOn = !value && (await read($, enabled))
  if (isOn !== n.isOn) await n.setOn(at, isOn)
}

/**
 * The scene up now, when it went up, and its drawing in the box and style last
 * asked for. The band is drawn again whenever its props change (the turn
 * ending flips isWorking, the window is resized) and the desktop may start the
 * frame over then; so every drawing after the first is set to the scene's own
 * clock, and it carries on where it was instead of typing its caption again.
 */
type Drawn = { scene: string; at: number; key: string; base: string }
/** The drawing kept, and the band's box as last drawn, so a scene can be drawn the moment it goes up. */
type Band = { drawn?: Drawn; box: { width: number; height: number } }

/** The scene in the band's box and style, drawn once and kept: a scene going up starts its clock. */
async function draw($: EngineInterface, band: Band, next: FablesScene): Promise<Drawn> {
  const look = await read($, style)
  const key = `${band.box.width}x${band.box.height}|${look}`
  const same = JSON.stringify(next)
  const kept = band.drawn
  if (kept?.scene === same && kept.key === key) return kept
  const at = kept?.scene === same ? kept.at : await $.clock.now()
  band.drawn = { scene: same, at, key, base: sceneToSvg(next, { ...band.box, look, figure: FIGURE }) }
  return band.drawn
}

export const register: Register = (on, options) => {
  const n = new Director()
  const band: Band = { box: bandBox(NaN) }
  // The config menu's choice is the default; /fables model overrides it.
  const configured = findModel(options.model) ?? DEFAULT_MODEL
  n.model = configured
  n.look = DEFAULT_LOOK

  on('session.start', async ($, e, next) => {
    const isEnabled = (await $.store.get(STORE_ENABLED)) !== false
    const isCollapsed = (await $.store.get(STORE_COLLAPSED)) === true
    n.isOn = isEnabled && !isCollapsed
    n.model = findModel(await $.store.get(STORE_MODEL)) ?? configured
    await update($, enabled, () => isEnabled)
    await update($, collapsed, () => isCollapsed)
    const saved = await $.store.get(STORE_STYLE)
    // Pixel art was once a switch of its own: someone who turned it off keeps the original look, drawn smooth.
    const smooth = (await $.store.get(STORE_PIXEL)) === false
    n.look = typeof saved === 'string' && LOOKS[saved] ? saved : smooth ? 'original' : DEFAULT_LOOK
    await update($, style, () => n.look)
    await $.command.register({
      name: 'fables',
      description: 'Claude Fables: turn the cartoons above the prompt on or off, pick a style, or pick the model that writes them',
      argumentHint: '[on|off|style [name|off]|model [sonnet|haiku]]',
    })
    $.clock.every(1000, () => void n.tick(host($, band)))
    $.clock.every(WEATHER_EVERY_MS, () => void refreshWeather($, false))
    const started = await next(e)
    await refreshWeather($, true)
    return started
  })

  on('command.run', { command: 'fables' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const md = /^(?:model|models|narrator)\b\s*(.*)$/.exec(arg)
    if (md) {
      const want = (md[1] ?? '').trim()
      if (!want) {
        const list = NARRATOR_MODELS.map(m => `${m === n.model ? '▸' : ' '} ${m} · ${MODEL_LABELS[m]}`).join('\n')
        return { text: `${MODEL_LABELS[n.model]} writes the story. Pick another with /fables model <name>:\n${list}` }
      }
      const model = findModel(want)
      if (!model) return { text: `No narrator called "${want}". Try /fables model sonnet or /fables model haiku.` }
      return chooseModel($, n, model)
    }
    const st = /^(?:style|styles|look)\b\s*(.*)$/.exec(arg)
    if (st) {
      const want = (st[1] ?? '').trim()
      if (!want) {
        const list = LOOK_NAMES.map(name => `${name === n.look ? '▸' : ' '} ${name} · ${lookFor(name).label}`).join('\n')
        return { text: `Scenes are drawn in ${lookFor(n.look).label}. Pick a style with /fables style <name>, or /fables style off for the default:\n${list}` }
      }
      const look = /^(off|none|default|plain)$/.test(want) ? lookFor(DEFAULT_LOOK) : findLook(want)
      if (!look) return { text: `No style called "${want}". /fables style lists them.` }
      return chooseLook($, n, look.name)
    }
    // Pixel art is a style now; the old switch still works, as a way to pick it or the smooth original.
    const px = /^pixel(?:\s+(on|off))?$/.exec(arg)
    if (px) return chooseLook($, n, px[1] === 'off' || (!px[1] && n.look === 'pixel') ? 'original' : 'pixel')
    const value = arg === 'on' ? true : arg === 'off' ? false : !n.isOn
    await setOn($, n, host($, band), value)
    return {
      text: value
        ? `Claude Fables is on: cartoons written by ${MODEL_LABELS[n.model]} play above the prompt while Claude works.`
        : 'Claude Fables is off.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    n.submit(e.text)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const isTold = e.agentId === undefined && !tool.startsWith(OWN_TOOLS)
    if (isTold) n.tool(tool, e)
    const ran = await next(e)
    if (isTold && (ran.deny !== undefined || ran.isError === true)) n.failed(tool, e)
    return ran
  })

  on('session.append', async ($, e, next) => {
    if (e.door === 'response' && e.agentId === undefined && Array.isArray(e.message.content)) {
      const said = e.message.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join(' ')
        .trim()
      n.said(said)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) n.complete(e.reason)
    const done = await next(e)
    // Main-loop turns only: a subagent's turn is not one of the person's.
    if (e.agentId === undefined) await refreshWeather($, true)
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    if (!(await read($, enabled))) return next(e)
    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    const fold = (value: boolean) => () => setCollapsed($, n, host($, band), value)
    const weather = weatherTexts(Text, (await read($, weatherNow)) ?? undefined, await read($, weatherTurns), e.props.bodyColumns)
    const isCollapsed = await read($, collapsed)
    const current = isCollapsed ? null : await read($, scene)
    // Folded, or no scene up between turns: the token weather is the whole band.
    if (!current) {
      return (
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingX={1}>
          <Box flexDirection="row">{weather}</Box>
          {isCollapsed ? (
            <Button key="fables-expand" label="Развернуть мультик" dimColor onPress={fold(false)} />
          ) : (
            <Button key="fables-collapse" role="dismiss" label="✕" plain dimColor onPress={fold(true)} />
          )}
        </Box>
      )
    }
    // The interactive frame does not size itself from the markup (left alone it
    // is a 300x150 box), so give it the band's box; a new width draws anew.
    band.box = bandBox(e.props.bodyColumns)
    const { width, height } = band.box
    const { base, at } = await draw($, band, current)
    // To a tenth of a second, so drawings in the same moment stay the same.
    const along = Math.floor(((await $.clock.now()) - at) / 100) / 10
    const resumed = resumeAt(base, along)
    return (
      <Box flexDirection="column">
        <Box position="relative">
          <Svg
            source={resumed.length <= MAX_SVG ? resumed : base}
            alt={current.caption}
            width={width}
            height={height}
            isInteractive
          />
          <Box position="absolute" top={0} right={1}>
            <Button key="fables-collapse" role="dismiss" label="✕" plain onPress={fold(true)} />
          </Box>
        </Box>
        <Box flexDirection="row" paddingX={1} paddingTop={1}>{weather}</Box>
      </Box>
    )
  })
}
