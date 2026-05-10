import { describe, expect, it } from 'vitest'
import { extractWikilinkTargets } from './wikilink-extractor'

describe('extractWikilinkTargets', () => {
  it('returns each distinct target in document order', () => {
    const source = `
# Notes

See [[Reading]] and [[Writing]] for context.
Also [[Reading]] again — should be deduped.
`
    expect(extractWikilinkTargets(source)).toEqual(['Reading', 'Writing'])
  })

  it('strips alias / heading / block-ref decorations', () => {
    const source = `
[[a-page|My alias]]
[[b-page#some-heading]]
[[c-page^block-id]]
[[d-page#h|alias]]
`
    expect(extractWikilinkTargets(source)).toEqual([
      'a-page',
      'b-page',
      'c-page',
      'd-page',
    ])
  })

  it('still extracts the inner target from `![[embed]]`', () => {
    const source = `Here is an embed: ![[hero.png]] and a link: [[hero.png]].`
    expect(extractWikilinkTargets(source)).toEqual(['hero.png'])
  })

  it('ignores wikilinks inside fenced code blocks', () => {
    const source = '\n```\n[[do-not-pick-me]]\n```\n[[real-link]]'
    expect(extractWikilinkTargets(source)).toEqual(['real-link'])
  })

  it('ignores wikilinks inside inline code', () => {
    const source = 'Use `[[syntax]]` to make a link, e.g. [[my-page]].'
    expect(extractWikilinkTargets(source)).toEqual(['my-page'])
  })

  it('ignores wikilinks inside HTML comments', () => {
    const source = '<!-- [[draft-only]] -->\n[[real]]'
    expect(extractWikilinkTargets(source)).toEqual(['real'])
  })

  it('returns an empty array for content with no wikilinks', () => {
    expect(extractWikilinkTargets('Just plain text.')).toEqual([])
  })

  it('drops empty / whitespace-only targets', () => {
    expect(extractWikilinkTargets('[[]] and [[ ]] and [[real]]')).toEqual([
      'real',
    ])
  })
})
