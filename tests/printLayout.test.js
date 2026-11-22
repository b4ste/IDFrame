import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangePhotos } from '../src/printLayout.js'

const a4 = { w: 210, h: 297 }
const one = { id: '1x1', name: '1 × 1', w: 25.4, h: 25.4 }
const two = { id: '2x2', name: '2 × 2', w: 50.8, h: 50.8 }

test('mixed 1×1 and 2×2 copies share one A4 page', () => {
  const result = arrangePhotos([one, two], { '1x1': 12, '2x2': 12 }, a4, 'portrait', 8, 3)
  assert.equal(result.error, '')
  assert.equal(result.pages.length, 1)
  assert.equal(result.pages[0].photos.length, 24)
  const rows = new Map()
  for (const photo of result.pages[0].photos) {
    const row = rows.get(photo.y) || new Set()
    row.add(photo.id)
    rows.set(photo.y, row)
  }
  assert.ok([...rows.values()].every(row => row.size === 1))
})

test('all placements stay within margins without overlapping', () => {
  const passport = { id: 'passport', name: 'Passport', w: 35, h: 45 }
  const result = arrangePhotos([one, two, passport], { '1x1': 25, '2x2': 20, passport: 15 }, a4, 'portrait', 8, 3)
  assert.equal(result.error, '')
  assert.ok(result.pages.length > 1)
  assert.equal(result.pages.reduce((total, page) => total + page.photos.length, 0), 60)
  for (const page of result.pages) {
    for (const [index, photo] of page.photos.entries()) {
      assert.ok(photo.x >= 8 && photo.y >= 8)
      assert.ok(photo.x + photo.w <= result.width - 8 + 1e-7)
      assert.ok(photo.y + photo.h <= result.height - 8 + 1e-7)
      for (const other of page.photos.slice(index + 1)) {
        assert.ok(photo.x + photo.w + 3 <= other.x + 1e-7 || other.x + other.w + 3 <= photo.x + 1e-7 || photo.y + photo.h + 3 <= other.y + 1e-7 || other.y + other.h + 3 <= photo.y + 1e-7)
      }
    }
  }
})

test('reports a size too large for the chosen paper', () => {
  const result = arrangePhotos([two], { '2x2': 1 }, { w: 101.6, h: 152.4 }, 'portrait', 30, 3)
  assert.match(result.error, /does not fit/)
  assert.equal(result.pages.length, 0)
})
