export function arrangePhotos(sizes, counts, paper, orientation, margin, spacing) {
  const width = orientation === 'portrait' ? paper.w : paper.h
  const height = orientation === 'portrait' ? paper.h : paper.w
  const usableWidth = width - 2 * margin
  const usableHeight = height - 2 * margin
  const groups = sizes.filter(size => (counts[size.id] || 0) > 0)
    .sort((a, b) => b.w * b.h - a.w * a.h)
  const pages = []
  let page = { photos: [] }
  let y = margin

  for (const size of groups) {
    const columns = Math.floor((usableWidth + spacing + 1e-7) / (size.w + spacing))
    if (columns < 1 || size.h > usableHeight + 1e-7) {
      return { width, height, pages: [], error: `${size.name} does not fit this paper with the current margins.` }
    }
    let remaining = counts[size.id]
    while (remaining > 0) {
      if (y + size.h > height - margin + 1e-7) {
        if (page.photos.length) pages.push(page)
        page = { photos: [] }
        y = margin
      }
      const inRow = Math.min(columns, remaining)
      for (let column = 0; column < inRow; column++) {
        page.photos.push({
          id: size.id,
          x: margin + column * (size.w + spacing),
          y,
          w: size.w,
          h: size.h,
        })
      }
      remaining -= inRow
      y += size.h + spacing
    }
  }
  if (page.photos.length) pages.push(page)
  return { width, height, pages, error: '' }
}
