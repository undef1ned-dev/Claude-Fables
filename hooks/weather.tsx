/**
 * Token weather: a forecast of the context window, drawn under the cartoon
 * (and as the band itself while the cartoon is folded). register.tsx reads the
 * session's usage, which costs no model calls; this file only draws it.
 */
import type { ElementTable } from 'claude-code'

import type { WeatherReading } from '../types'

/** How many past turns the sparkline remembers. */
export const HISTORY = 12

const BARS = '▁▂▃▄▅▆▇█'

export type Forecast = { upTo: number; icon: string; word: string; color: string }

export const FORECAST: readonly Forecast[] = [
  { upTo: 25, icon: '☀', word: 'Clear', color: 'yellow' },
  { upTo: 50, icon: '☁', word: 'Cloudy', color: 'cyan' },
  { upTo: 75, icon: '☂', word: 'Showers', color: 'blue' },
  { upTo: 90, icon: '☇', word: 'Storm', color: 'magenta' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', color: 'red' },
]

export const forecastFor = (percent: number): Forecast => FORECAST.find(f => percent < f.upTo) ?? FORECAST[FORECAST.length - 1]!

export const pushReading = (history: readonly WeatherReading[], reading: WeatherReading): WeatherReading[] =>
  [...history, reading].slice(-HISTORY)

export function short(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function sparkline(history: readonly WeatherReading[]): string {
  const top = Math.max(...history.map(r => r.tokens), 1)
  return history.map(r => BARS[Math.floor((r.tokens / top) * (BARS.length - 1))]).join('')
}

export function trend(history: readonly WeatherReading[]): string {
  const [before, last] = history.slice(-2)
  if (!before || !last) return ''
  const delta = last.tokens - before.tokens
  if (delta === 0) return '  steady'
  return delta > 0 ? `  ▲ +${short(delta)} last turn` : `  ▼ ${short(-delta)} last turn`
}

/**
 * The forecast as a row of Texts: the reading now, and the turns behind it
 * when the band is wide enough. `now` is the live reading; `history` holds
 * one reading per finished turn.
 */
export function weatherTexts(
  Text: ElementTable['Text'],
  now: WeatherReading | undefined,
  history: readonly WeatherReading[],
  columns: number,
) {
  const at = now ?? history[history.length - 1]
  if (!at) return [<Text dimColor>Claude Fables</Text>]
  const f = forecastFor(at.percent)
  const parts = [
    <Text color={f.color} bold>{`${f.icon}  ${f.word}`}</Text>,
    <Text>{`  ${at.percent}% of context`}</Text>,
    <Text dimColor>{`  ${short(at.tokens)} / ${short(at.window)}`}</Text>,
  ]
  if (columns >= 60 && history.length > 0) {
    parts.push(<Text dimColor>{'   last turns '}</Text>)
    parts.push(<Text color={f.color}>{sparkline(history)}</Text>)
    if (history.length > 1) parts.push(<Text dimColor>{trend(history)}</Text>)
  }
  return parts
}
