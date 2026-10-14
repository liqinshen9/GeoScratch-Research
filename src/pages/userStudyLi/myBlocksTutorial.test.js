// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findSavedTutorialBlock, myBlocksTutorialStage } from './myBlocksTutorial'

describe('My Blocks tutorial guidance', () => {
  it('requires opening, naming, and saving before completion', () => {
    const state = { open: false, dialogOpen: false, nameEdited: false, name: '', savedBlock: null }
    expect(myBlocksTutorialStage(state)).toBe('myblocks')
    state.open = true
    expect(myBlocksTutorialStage(state)).toBe('make')
    state.dialogOpen = true
    state.name = 'My geometric block'
    expect(myBlocksTutorialStage(state)).toBe('name')
    state.nameEdited = true
    state.name = 'Mouse head'
    expect(myBlocksTutorialStage(state)).toBe('save')
    state.name = ' '
    expect(myBlocksTutorialStage(state)).toBe('name')
    state.dialogOpen = false
    expect(myBlocksTutorialStage(state)).toBe('make')
    state.savedBlock = { name: 'Mouse head' }
    expect(myBlocksTutorialStage(state)).toBe('done')
  })
  it('requires reopening My Blocks after cancelling or closing it', () => {
    expect(myBlocksTutorialStage({ open: false, dialogOpen: false, name: '', savedBlock: { name: 'Mouse head' } })).toBe('done')
    expect(myBlocksTutorialStage({ open: true, dialogOpen: false, name: '', savedBlock: null })).toBe('make')
  })
  it('advances immediately after a successful save even before the dialog state refreshes', () => {
    expect(myBlocksTutorialStage({ open: true, dialogOpen: true, nameEdited: true, name: 'micki', savedBlock: { id: 'saved', name: 'micki' } })).toBe('done')
  })
  it('matches the actual saved workspace, preserving the user’s name and ignoring block positions', () => {
    const saved = { id: 'saved-mouse', name: 'My mouse', xmlText: '<xml><block type="geo_sphere" id="old" x="100" y="100"><value name="RADIUS_INPUT"><block type="scalar"><field name="scalar">2</field></block></value></block></xml>' }
    const unrelated = { name: 'Other', xmlText: '<xml><block type="geo_cube" /></xml>' }
    const current = '<xml><block type="geo_sphere" id="new" x="200" y="200"><value name="RADIUS_INPUT"><block type="scalar"><field name="scalar">2</field></block></value></block></xml>'
    expect(findSavedTutorialBlock([unrelated, saved], current)).toBe(saved)
    expect(findSavedTutorialBlock([unrelated], current)).toBeNull()
    expect(findSavedTutorialBlock([saved], '')).toBeNull()
  })
})
