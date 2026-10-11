import { describe, expect, it } from 'vitest'
import { conditionDetails, nextStudyPhase, studySequence } from './studyFlow'

describe('Li study condition order', () => {
  it.each([
    ['geoscratch-first', ['geoscratch', 'geoscratch-questionnaire', 'lecture', 'lecture-questionnaire', 'post', 'complete']],
    ['lecture-first', ['lecture', 'lecture-questionnaire', 'geoscratch', 'geoscratch-questionnaire', 'post', 'complete']],
  ])('runs both conditions before post-study for %s', (order, expected) => {
    expect(studySequence(order)).toEqual(expected)
    let phase = nextStudyPhase(order)
    const visited = [phase]
    while (phase !== 'complete') {
      phase = nextStudyPhase(order, phase)
      visited.push(phase)
    }
    expect(visited).toEqual(expected)
    expect(nextStudyPhase(order, 'complete')).toBe('complete')
  })

  it('records the condition and its position for each order', () => {
    expect(conditionDetails('geoscratch-first', 'geoscratch')).toMatchObject({ condition: 'GeoScratch Exercise', conditionOrder: 'First' })
    expect(conditionDetails('geoscratch-first', 'lecture')).toMatchObject({ condition: 'Lecture slides', conditionOrder: 'Second' })
    expect(conditionDetails('lecture-first', 'lecture')).toMatchObject({ condition: 'Lecture slides', conditionOrder: 'First' })
    expect(conditionDetails('lecture-first', 'geoscratch')).toMatchObject({ condition: 'GeoScratch Exercise', conditionOrder: 'Second' })
  })
})
