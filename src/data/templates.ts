import type { SceneDefinition, SceneLayer, StoryState, TemplateDefinition } from '../types/scene'
import { STORY_DEFAULTS } from './storySchema'

export const DEFAULT_STORY_STATE: StoryState = STORY_DEFAULTS

// Majority Democrats palette (brand/guidelines): #111111, Acid #E7EB94, Blue #3C77BB, Red #ED2426, Spilled Milk #F9FBED.
const INK = '#111111'
const ACID = '#E7EB94'
const BLUE = '#3C77BB'
const RED = '#ED2426'
const MILK = '#F9FBED'

const DRUK_WIDE = '"Druk Wide", "Archivo Expanded", "Arial Black", sans-serif'
const DRUK = '"Druk", Oswald, "Arial Narrow", sans-serif'
const RECOLETA = '"Recoleta", Georgia, serif'

const rect = (id: string, name: string, x: number, y: number, width: number, height: number, fill: string, extra: Partial<SceneLayer> = {}): SceneLayer => ({
  id,
  kind: 'shape',
  name,
  x,
  y,
  width,
  height,
  fill,
  opacity: 1,
  visible: true,
  ...extra,
} as SceneLayer)

/** Quote card with a broken frame and acid quote marks; `size` scales the vertical layout. */
function quoteScene(id: string, name: string, height: number): SceneDefinition {
  const width = 1080
  const frameTop = Math.round(height * 0.13)
  const frameBottom = Math.round(height * 0.87)
  // Quote + author sit as one group in the middle of the frame (tall formats get no dead gap).
  const quoteHeight = Math.min(620, frameBottom - frameTop - 360)
  const quoteTop = Math.round((frameTop + frameBottom) / 2 - (quoteHeight + 100) / 2)
  return {
    id,
    name,
    width,
    height,
    background: BLUE,
    layers: [
      rect(`${id}-circle-a`, 'Circle Top', 640, -160, 620, 620, INK, { radius: 310, opacity: 0.16 } as Partial<SceneLayer>),
      rect(`${id}-circle-b`, 'Circle Bottom', -220, height - 520, 560, 560, INK, { radius: 280, opacity: 0.16 } as Partial<SceneLayer>),
      rect(`${id}-frame-top`, 'Frame Top', 250, frameTop, 690, 8, MILK),
      rect(`${id}-frame-left`, 'Frame Left', 140, frameTop + 110, 8, frameBottom - frameTop - 110, MILK),
      rect(`${id}-frame-bottom`, 'Frame Bottom', 140, frameBottom, 690, 8, MILK),
      rect(`${id}-frame-right`, 'Frame Right', 932, frameTop, 8, frameBottom - frameTop - 110, MILK),
      {
        id: `${id}-mark-open`,
        kind: 'text',
        name: 'Quote Mark Open',
        x: 110,
        y: frameTop - 70,
        width: 160,
        height: 160,
        text: '“',
        color: ACID,
        fontSize: 260,
        fontFamily: RECOLETA,
        fontWeight: 700,
        opacity: 1,
        visible: true,
      },
      {
        id: `${id}-mark-close`,
        kind: 'text',
        name: 'Quote Mark Close',
        x: 820,
        y: frameBottom - 90,
        width: 160,
        height: 160,
        text: '”',
        color: ACID,
        fontSize: 260,
        fontFamily: RECOLETA,
        fontWeight: 700,
        opacity: 1,
        visible: true,
      },
      {
        id: `${id}-quote`,
        kind: 'text',
        name: 'Quote',
        x: 210,
        y: quoteTop,
        width: 660,
        height: quoteHeight,
        text: 'Your quote goes here.',
        binding: 'quote',
        color: MILK,
        fontSize: 64,
        fontFamily: RECOLETA,
        fontWeight: 700,
        lineHeight: 1.15,
        opacity: 1,
        visible: true,
      },
      {
        id: `${id}-author`,
        kind: 'text',
        name: 'Quote Author',
        x: 210,
        y: quoteTop + quoteHeight + 40,
        width: 660,
        height: 60,
        text: 'Speaker Name',
        binding: 'quote_author',
        color: ACID,
        fontSize: 44,
        fontFamily: DRUK,
        fontWeight: 700,
        opacity: 1,
        visible: true,
      },
    ],
  }
}

const lowerThirdScene: SceneDefinition = {
  id: 'scene-lower-third',
  name: 'Lower Third',
  width: 1920,
  height: 1080,
  background: 'transparent',
  layers: [
    rect('shape-lt-bg', 'Bar', 120, 820, 1080, 160, INK),
    rect('shape-lt-accent', 'Accent', 120, 820, 16, 160, ACID),
    {
      id: 'text-lt-name',
      kind: 'text',
      name: 'Name',
      x: 176,
      y: 842,
      width: 990,
      height: 70,
      text: 'Name',
      binding: 'name',
      color: MILK,
      fontSize: 54,
      fontFamily: DRUK_WIDE,
      fontWeight: 700,
      align: 'left',
      opacity: 1,
      visible: true,
    },
    {
      id: 'text-lt-title',
      kind: 'text',
      name: 'Title',
      x: 176,
      y: 920,
      width: 990,
      height: 42,
      text: 'Title',
      binding: 'title',
      color: ACID,
      fontSize: 34,
      fontFamily: RECOLETA,
      fontWeight: 500,
      align: 'left',
      opacity: 1,
      visible: true,
    },
  ],
}

const youtubeThumbnailScene: SceneDefinition = {
  id: 'scene-youtube-thumbnail',
  name: 'YouTube Thumbnail',
  width: 1280,
  height: 720,
  background: INK,
  layers: [
    rect('shape-yt-photo', 'Photo Area', 700, 0, 580, 720, '#2A2A2A'),
    {
      id: 'text-yt-photo-hint',
      kind: 'text',
      name: 'Photo Hint (delete me)',
      x: 720,
      y: 330,
      width: 540,
      height: 60,
      text: 'Drag a photo from Assets here',
      color: '#777777',
      fontSize: 30,
      fontFamily: RECOLETA,
      fontWeight: 500,
      opacity: 1,
      visible: true,
    },
    rect('shape-yt-accent', 'Accent Bar', 60, 92, 120, 14, ACID),
    {
      id: 'text-yt-headline',
      kind: 'text',
      name: 'Headline',
      x: 60,
      y: 130,
      width: 620,
      height: 380,
      text: 'Headline',
      binding: 'headline',
      color: ACID,
      fontSize: 86,
      fontFamily: DRUK_WIDE,
      fontWeight: 700,
      lineHeight: 1.02,
      align: 'left',
      verticalAlign: 'top',
      opacity: 1,
      visible: true,
    },
    {
      id: 'text-yt-subhead',
      kind: 'text',
      name: 'Subhead',
      x: 60,
      y: 560,
      width: 620,
      height: 80,
      text: 'Subhead',
      binding: 'subhead',
      color: MILK,
      fontSize: 38,
      fontFamily: RECOLETA,
      fontWeight: 700,
      align: 'left',
      box: { fill: RED, paddingTop: 14, paddingRight: 24, paddingBottom: 14, paddingLeft: 24, radius: 0 },
      opacity: 1,
      visible: true,
    },
  ],
}

export const TEMPLATE_LIBRARY: TemplateDefinition[] = [
  {
    id: 'template-quote-card',
    label: 'Quote Card 4x5',
    scene: quoteScene('scene-quote-card', 'Quote Card 4x5', 1350),
    favorite: true,
    builtIn: true,
    version: 1,
    versions: [],
  },
  {
    id: 'template-lower-third',
    label: 'Lower Third',
    scene: lowerThirdScene,
    favorite: true,
    builtIn: true,
    version: 1,
    versions: [],
  },
  {
    id: 'template-youtube-thumbnail',
    label: 'YouTube Thumbnail',
    scene: youtubeThumbnailScene,
    favorite: true,
    builtIn: true,
    version: 1,
    versions: [],
  },
  {
    id: 'template-quote-story',
    label: 'Quote Story 9x16',
    scene: quoteScene('scene-quote-story', 'Quote Story 9x16', 1920),
    builtIn: true,
    version: 1,
    versions: [],
  },
]

export const CLEAR_SCENE: SceneDefinition = {
  id: 'scene-clear',
  name: 'Clear',
  width: 1920,
  height: 1080,
  background: 'transparent',
  layers: [],
}

export function cloneScene(scene: SceneDefinition): SceneDefinition {
  if (typeof structuredClone === 'function') {
    return structuredClone(scene)
  }

  return JSON.parse(JSON.stringify(scene)) as SceneDefinition
}
