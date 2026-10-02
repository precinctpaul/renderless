/**
 * Minimal PDF content-stream lexer, used to remove live-editable pieces (text blocks and
 * the rectangles behind them) from the artwork before it is rasterized. It only needs to
 * find operator boundaries reliably, so it skips strings, hex strings, dictionaries,
 * comments and inline image data without interpreting them.
 */

export interface ContentOperator {
  op: string
  /** Offset where this operator's operands begin (end of the previous operator). */
  operandsStart: number
  /** Offset of the operator keyword itself. */
  start: number
  /** Offset just past the operator keyword (or past the inline image data for BI). */
  end: number
  operands: string[]
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%'])

function isWhitespace(source: string, index: number): boolean {
  return WHITESPACE.has(source.charCodeAt(index))
}

function isOperand(token: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(token) || token === 'true' || token === 'false' || token === 'null'
}

export function lexContentStream(source: string): ContentOperator[] {
  const operators: ContentOperator[] = []
  let operands: string[] = []
  let operandsStart = 0
  let index = 0
  const length = source.length

  while (index < length) {
    const char = source[index]

    if (isWhitespace(source, index)) {
      index += 1
      continue
    }

    if (char === '%') {
      while (index < length && source[index] !== '\n' && source[index] !== '\r') index += 1
      continue
    }

    if (char === '(') {
      const start = index
      let depth = 0
      while (index < length) {
        const current = source[index]
        if (current === '\\') {
          index += 2
          continue
        }
        if (current === '(') depth += 1
        if (current === ')') {
          depth -= 1
          if (depth === 0) {
            index += 1
            break
          }
        }
        index += 1
      }
      operands.push(source.slice(start, index))
      continue
    }

    if (char === '<' && source[index + 1] === '<') {
      operands.push('<<')
      index += 2
      continue
    }

    if (char === '>' && source[index + 1] === '>') {
      operands.push('>>')
      index += 2
      continue
    }

    if (char === '<') {
      const start = index
      while (index < length && source[index] !== '>') index += 1
      index += 1
      operands.push(source.slice(start, index))
      continue
    }

    if (char === '[' || char === ']' || char === '{' || char === '}') {
      operands.push(char)
      index += 1
      continue
    }

    if (char === '/') {
      const start = index
      index += 1
      while (index < length && !isWhitespace(source, index) && !DELIMITERS.has(source[index])) index += 1
      operands.push(source.slice(start, index))
      continue
    }

    const start = index
    while (index < length && !isWhitespace(source, index) && !DELIMITERS.has(source[index])) index += 1
    if (index === start) {
      // Stray delimiter (e.g. an unmatched ')'): skip it rather than loop forever.
      index += 1
      continue
    }

    const token = source.slice(start, index)
    if (isOperand(token)) {
      operands.push(token)
      continue
    }

    let end = index
    if (token === 'BI') {
      // Inline image: skip the binary data after ID up to the EI keyword.
      const dataStart = source.indexOf('ID', index)
      let search = dataStart < 0 ? length : dataStart + 3
      let found = -1
      while (search < length) {
        const candidate = source.indexOf('EI', search)
        if (candidate < 0) break
        const after = candidate + 2
        if (isWhitespace(source, candidate - 1) && (after >= length || isWhitespace(source, after))) {
          found = after
          break
        }
        search = candidate + 2
      }
      end = found < 0 ? length : found
      index = end
    }

    operators.push({ op: token, operandsStart, start, end, operands })
    operands = []
    operandsStart = end
  }

  return operators
}

export interface LocalRect {
  x: number
  y: number
  width: number
  height: number
}

function normalizeRect(x: number, y: number, width: number, height: number): LocalRect {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  }
}

function rectsMatch(a: LocalRect, b: LocalRect, tolerance = 0.6): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  )
}

/**
 * Removes every text object (BT ... ET) and collapses `re` rectangles matching any of the
 * given boxes (in the stream's local coordinates) to zero size. Everything else, including
 * marked-content layer sections, is left byte-for-byte intact.
 */
export function stripTextAndBoxes(source: string, boxes: LocalRect[]): { content: string; removedText: number; removedBoxes: number } {
  const operators = lexContentStream(source)
  const edits: Array<{ start: number; end: number; replacement: string }> = []
  let textStart: number | null = null
  let removedText = 0
  let removedBoxes = 0

  for (const operator of operators) {
    if (operator.op === 'BT' && textStart === null) {
      textStart = operator.start
      continue
    }

    if (operator.op === 'ET' && textStart !== null) {
      edits.push({ start: textStart, end: operator.end, replacement: '' })
      textStart = null
      removedText += 1
      continue
    }

    if (operator.op === 're' && textStart === null && operator.operands.length === 4 && boxes.length > 0) {
      const [x, y, width, height] = operator.operands.map(Number)
      const rect = normalizeRect(x, y, width, height)
      if (boxes.some((box) => rectsMatch(rect, normalizeRect(box.x, box.y, box.width, box.height)))) {
        // Replace only the operands, keeping the operator so path/paint sequencing stays valid.
        const operandText = source.slice(operator.operandsStart, operator.start)
        const leading = operandText.match(/^\s*/)?.[0] ?? ''
        edits.push({ start: operator.operandsStart, end: operator.start, replacement: `${leading}0 0 0 0 ` })
        removedBoxes += 1
      }
    }
  }

  let content = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    content = content.slice(0, edit.start) + edit.replacement + content.slice(edit.end)
  }

  return { content, removedText, removedBoxes }
}
