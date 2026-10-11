/**
 * The idle reel: scenes the band plays while nobody has asked Claude anything
 * (a new window, between turns, once a turn's last scene has lingered). They
 * are written here, never by the model, so they cost nothing; the reel moves
 * on to the next one every few minutes.
 */
import type { FablesScene } from '../types'

/** How long one idle scene stays before the reel moves on. */
export const IDLE_EVERY_MS = 3 * 60 * 1000

const scene = (s: Omit<FablesScene, 'palette' | 'props'>): FablesScene => ({ palette: {}, props: [], title: 'жду', ...s })

export const IDLE_SCENES: readonly FablesScene[] = [
  scene({ backdrop: 'night', hero: { action: 'sleep', from: 45, to: 45 }, caption: 'Хр-р... Разбуди меня промптом.' }),
  scene({ backdrop: 'forest', hero: { action: 'walk', from: 15, to: 50, then: 'think' }, caption: 'Жду следующую задачу. Кофе? :)' }),
  scene({ backdrop: 'space', hero: { action: 'fly', from: 10, to: 60 }, caption: 'Кружу над репозиторием. Готов, когда ты готов.' }),
  scene({ backdrop: 'lab', hero: { action: 'inspect', from: 40, to: 40 }, caption: 'Читаю доки, пока ты думаешь...' }),
  scene({ backdrop: 'desert', hero: { action: 'walk', from: 10, to: 45, then: 'wave' }, caption: 'Привет! Напиши что-нибудь внизу ->' }),
  scene({ backdrop: 'city', hero: { action: 'dance', from: 50, to: 50 }, particles: { kind: 'rain', density: 0.3 }, caption: '`git status`: чисто. Танцую под дождём.' }),
]

/** The idle scene for a turn of the reel: each one in order, round and round. */
export const idleScene = (step: number): FablesScene => IDLE_SCENES[((step % IDLE_SCENES.length) + IDLE_SCENES.length) % IDLE_SCENES.length]!
