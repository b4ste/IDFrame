import { useEffect, useMemo, useRef, useState } from 'react'
import { arrangePhotos } from './printLayout'
import './App.css'

const DPI = 300
const px = mm => Math.round(mm / 25.4 * DPI)
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
const presets = [
  { id: '1x1', name: '1 × 1 inch', short: '1 × 1', w: 25.4, h: 25.4 },
  { id: '2x2', name: '2 × 2 inches', short: '2 × 2', w: 50.8, h: 50.8 },
  { id: 'passport', name: 'PH passport', short: 'Passport', w: 35, h: 45 },
  { id: '3.5x4.5', name: '3.5 × 4.5 cm', short: '3.5 × 4.5', w: 35, h: 45 },
]
const papers = {
  a4: { name: 'A4', w: 210, h: 297 },
  short: { name: 'Short bond', w: 215.9, h: 279.4 },
  long: { name: 'Long bond', w: 215.9, h: 330.2 },
  legal: { name: 'US Legal', w: 215.9, h: 355.6 },
  a5: { name: 'A5', w: 148, h: 210 },
  fourR: { name: '4R', w: 101.6, h: 152.4 },
  fiveR: { name: '5R', w: 127, h: 177.8 },
}
const initial = { zoom: 1, x: 0, y: 0 }
function Icon({ name, size = 18 }) {
  const shapes = { upload: <><path d="M12 16V3m0 0-5 5m5-5 5 5M4 16v4h16v-4"/></>, image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></>, download: <path d="M12 3v13m0 0-5-5m5 5 5-5M4 18v3h16v-3"/>, print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 15h12v6H6z"/></>, reset: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>, plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>, close: <path d="M5 5l14 14M19 5 5 19"/>, check: <path d="m5 12 4 4L19 6"/>, lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></> }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}
function crop(image, size, adjustment, width = px(size.w)) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(canvas.width * size.h / size.w))
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * adjustment.zoom
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale
  ctx.drawImage(image, (canvas.width - w) / 2 * (1 + adjustment.x), (canvas.height - h) / 2 * (1 + adjustment.y), w, h)
  return canvas
}
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) } return (crc ^ -1) >>> 0 }
async function withDpi(blob, format) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (format === 'jpg') {
    // JPEG JFIF density fields are big endian and declare dots per inch.
    if (bytes.length > 18 && bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.slice(6, 11)) === 'JFIF\0') {
      bytes[13] = 1; bytes[14] = 1; bytes[15] = 44; bytes[16] = 1; bytes[17] = 44
      return new Blob([bytes], { type: 'image/jpeg' })
    }
    const jfif = new Uint8Array([255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 1, 44, 1, 44, 0, 0])
    return new Blob([bytes.slice(0, 2), jfif, bytes.slice(2)], { type: 'image/jpeg' })
  }
  // PNG pHYs uses pixels per metre: 11811 is approximately 300 DPI.
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer)
  view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); view.setUint32(8, 11811); view.setUint32(12, 11811); chunk[16] = 1; view.setUint32(17, crc32(chunk.slice(4, 17)))
  return new Blob([bytes.slice(0, 33), chunk, bytes.slice(33)], { type: 'image/png' })
}
function blobOf(canvas, format) { return new Promise((resolve, reject) => canvas.toBlob(async b => { if (!b) return reject(new Error('Export failed')); try { resolve(await withDpi(b, format)) } catch (error) { reject(error) } }, format === 'jpg' ? 'image/jpeg' : 'image/png', .95)) }
function save(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000) }
function Heading({ step, title, right }) { return <div className="card-heading"><div><span className="eyebrow">{step}</span><h2>{title}</h2></div>{right}</div> }
function Upload({ image, fileName, onFile, onRemove, error }) {
  const input = useRef(null), [dragging, setDragging] = useState(false)
  return <section className="card upload-card" id="upload"><Heading step="GET STARTED" title="Your photo" right={image && <button className="icon-button" onClick={onRemove} aria-label="Remove photo"><Icon name="close"/></button>}/><div className={`drop-zone ${dragging ? 'dragging' : ''} ${image ? 'has-image' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}>{image ? <><img src={image.src} alt="Uploaded portrait"/><strong className="file-name">{fileName}</strong><small>Stored only in this session</small><button className="outline-button" onClick={() => input.current.click()}>Replace photo</button></> : <><span className="upload-icon"><Icon name="upload" size={25}/></span><strong>Drop your photo here</strong><span>or browse from your device</span><button className="primary-button" onClick={() => input.current.click()}>Browse files</button><small>JPG, PNG or WebP · Max 25 MB</small></>}</div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }}/>{error && <p className="error" role="alert">{error}</p>}<p className="privacy"><Icon name="lock" size={15}/> Your photo never leaves your device.</p></section>
}
function Editor({ image, size, adjustment, setAdjustment }) {
  const canvas = useRef(null), drag = useRef(null)
  useEffect(() => { if (!image || !canvas.current) return; const source = crop(image, size, adjustment, 900); canvas.current.width = source.width; canvas.current.height = source.height; canvas.current.getContext('2d').drawImage(source, 0, 0) }, [image, size, adjustment])
  const set = (key, value) => setAdjustment(a => ({ ...a, [key]: value }))
  function move(e) { if (!drag.current) return; const rect = canvas.current.getBoundingClientRect(), scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight) * drag.current.zoom; const overX = Math.max(1, image.naturalWidth * scale - rect.width), overY = Math.max(1, image.naturalHeight * scale - rect.height); setAdjustment(a => ({ ...a, x: clamp(drag.current.x - 2 * (e.clientX - drag.current.cx) / overX, -1, 1), y: clamp(drag.current.y - 2 * (e.clientY - drag.current.cy) / overY, -1, 1) })) }
  return <section className="card editor-card" id="editor"><Heading step="01 / FINE TUNE" title="Photo editor" right={<button className="text-button" disabled={!image} onClick={() => setAdjustment(initial)}><Icon name="reset" size={17}/> Reset</button>}/><div className="editor-stage">{image ? <div className="editor-frame" style={{ aspectRatio: `${size.w}/${size.h}` }}><canvas ref={canvas} aria-label="Crop preview; drag to reposition" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { cx: e.clientX, cy: e.clientY, x: adjustment.x, y: adjustment.y, zoom: adjustment.zoom } }} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}/><i className="corner tl"/><i className="corner tr"/><i className="corner bl"/><i className="corner br"/></div> : <div className="editor-empty"><span><Icon name="image" size={30}/></span><strong>Your canvas is ready</strong><small>Upload a photo to start adjusting it.</small></div>}</div><div className="editor-caption"><span>{size.name} crop frame</span><span>{image ? 'Drag photo to reposition' : 'Live crop preview'}</span></div><div className="adjustments"><div className="control-row"><label htmlFor="zoom">Zoom</label><button className="tiny-button" disabled={!image} onClick={() => set('zoom', clamp(+(adjustment.zoom - .05).toFixed(2), 1, 3))} aria-label="Zoom out"><Icon name="minus" size={16}/></button><input id="zoom" type="range" min="1" max="3" step=".01" value={adjustment.zoom} disabled={!image} onChange={e => set('zoom', +e.target.value)}/><button className="tiny-button" disabled={!image} onClick={() => set('zoom', clamp(+(adjustment.zoom + .05).toFixed(2), 1, 3))} aria-label="Zoom in"><Icon name="plus" size={16}/></button><output>{Math.round(adjustment.zoom * 100)}%</output></div><div className="control-row"><label htmlFor="horizontal">Horizontal</label><input id="horizontal" type="range" min="-1" max="1" step=".01" value={adjustment.x} disabled={!image} onChange={e => set('x', +e.target.value)}/><output>{Math.round(adjustment.x * 100)}%</output></div><div className="control-row"><label htmlFor="vertical">Vertical</label><input id="vertical" type="range" min="-1" max="1" step=".01" value={adjustment.y} disabled={!image} onChange={e => set('y', +e.target.value)}/><output>{Math.round(adjustment.y * 100)}%</output></div></div></section>
}
function Sizes({ sizes, selected, setSelected, active, setActive, custom, setCustom }) {
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  return <section className="card sizes-card" id="sizes"><Heading step="02 / CHOOSE SIZES" title="Photo sizes" right={<span className="pill">{selected.length} selected</span>}/><p className="hint">Select every size you need. Click a card to edit its crop.</p><div className="size-list">{sizes.map(s => <div className={`size-option ${active === s.id ? 'active' : ''}`} key={s.id}><button className="size-main" onClick={() => { setActive(s.id); if (!selected.includes(s.id)) toggle(s.id) }}><span className="size-glyph" style={{ aspectRatio: `${s.w}/${s.h}` }}/><span><strong>{s.name}</strong><small>{s.w.toFixed(1)} × {s.h.toFixed(1)} mm</small></span></button><label className="check-wrap"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`}/><span><Icon name="check" size={13}/></span></label></div>)}</div><div className="custom"><strong>Custom dimensions</strong><div className="custom-grid"><label>Width<input type="number" min="1" max="300" step=".1" value={custom.width} onChange={e => setCustom({ ...custom, width: e.target.value })}/></label><label>Height<input type="number" min="1" max="300" step=".1" value={custom.height} onChange={e => setCustom({ ...custom, height: e.target.value })}/></label><label>Unit<select value={custom.unit} onChange={e => setCustom({ ...custom, unit: e.target.value })}><option value="mm">mm</option><option value="in">inch</option></select></label></div><button className="subtle-button" onClick={() => { setActive('custom'); if (!selected.includes('custom')) setSelected([...selected, 'custom']) }}><Icon name="plus" size={16}/> Add custom size</button></div></section>
}
function Previews({ image, sizes, selected, adjustment, format, setFormat, download }) {
  return <section className="card previews-card" id="previews"><Heading step="03 / READY TO SAVE" title="Your photo sizes" right={<div className="format-toggle"><button className={format === 'jpg' ? 'chosen' : ''} onClick={() => setFormat('jpg')}>JPG</button><button className={format === 'png' ? 'chosen' : ''} onClick={() => setFormat('png')}>PNG</button></div>}/>{selected.length ? <div className="preview-grid">{sizes.filter(s => selected.includes(s.id)).map(s => <div className="preview-item" key={s.id}><div className="preview-visual" style={{ aspectRatio: `${s.w}/${s.h}` }}>{image ? <img src={crop(image, s, adjustment, 360).toDataURL('image/jpeg', .9)} alt={`${s.name} preview`}/> : <Icon name="image" size={30}/>}</div><div className="preview-details"><div><strong>{s.short}</strong><small>{px(s.w)} × {px(s.h)} px · 300 DPI</small></div><button className="download-icon" disabled={!image} onClick={() => download(s)} aria-label={`Download ${s.name}`}><Icon name="download"/></button></div></div>)}</div> : <p className="empty-selection">Select a photo size to see its preview.</p>}</section>
}
function SheetPage({ layout, page, imageUrls, index }) {
  return <div className="sheet-wrap"><span>PAGE {index + 1}</span><div className="sheet" style={{ aspectRatio: `${layout.width}/${layout.height}` }}>{page.photos.map((photo, i) => <div className="sheet-photo" key={i} style={{ left: `${photo.x / layout.width * 100}%`, top: `${photo.y / layout.height * 100}%`, width: `${photo.w / layout.width * 100}%`, height: `${photo.h / layout.height * 100}%` }}>{imageUrls[photo.id] && <img src={imageUrls[photo.id]} alt=""/>}</div>)}</div></div>
}
function PrintSheet({ image, sizes, selected, adjustment, notify }) {
  const [paperId, setPaperId] = useState('a4')
  const [orientation, setOrientation] = useState('portrait')
  const [counts, setCounts] = useState({})
  const [gap, setGap] = useState(3)
  const [margin, setMargin] = useState(8)
  const [format, setFormat] = useState('png')
  const available = sizes.filter(size => selected.includes(size.id))
  const requested = Object.fromEntries(available.map(size => [size.id, counts[size.id] ?? 5]))
  const total = Object.values(requested).reduce((sum, count) => sum + count, 0)
  const layout = arrangePhotos(available, requested, papers[paperId], orientation, margin, gap)
  const imageUrls = image ? Object.fromEntries(available.map(size => [size.id, crop(image, size, adjustment, 420).toDataURL('image/jpeg', .9)])) : {}
  const canExport = () => {
    if (!image) { notify('Upload a photo before exporting.'); return false }
    if (layout.error) { notify(layout.error); return false }
    if (!total) { notify('Set at least one photo copy to print.'); return false }
    return true
  }
  const photoData = () => Object.fromEntries(available.filter(size => requested[size.id]).map(size => [size.id, crop(image, size, adjustment).toDataURL('image/jpeg', .95)]))
  function exportPdf() {
    if (!canExport()) return
    try {
      const pdf = new window.jspdf.jsPDF({ orientation, unit: 'mm', format: [layout.width, layout.height], compress: true })
      const data = photoData()
      layout.pages.forEach((page, index) => {
        if (index) pdf.addPage([layout.width, layout.height], orientation)
        page.photos.forEach(photo => pdf.addImage(data[photo.id], 'JPEG', photo.x, photo.y, photo.w, photo.h, undefined, 'FAST'))
      })
      pdf.save(`IDFrame_${papers[paperId].name.replaceAll(' ', '-')}_mixed-sheet.pdf`)
    } catch { notify('Could not create the PDF. Try fewer copies.') }
  }
  async function exportImages() {
    if (!canExport()) return
    try {
      const sources = Object.fromEntries(available.filter(size => requested[size.id]).map(size => [size.id, crop(image, size, adjustment)]))
      for (let index = 0; index < layout.pages.length; index++) {
        const canvas = document.createElement('canvas')
        canvas.width = px(layout.width); canvas.height = px(layout.height)
        const context = canvas.getContext('2d')
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
        layout.pages[index].photos.forEach(photo => context.drawImage(sources[photo.id], px(photo.x), px(photo.y), px(photo.w), px(photo.h)))
        save(await blobOf(canvas, format), `IDFrame_${papers[paperId].name.replaceAll(' ', '-')}_sheet_page-${index + 1}.${format}`)
      }
    } catch { notify('Could not export the sheet images. Try fewer copies.') }
  }
  function print() {
    if (!canExport()) return
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;left:-10000px;width:1px;height:1px'
    document.body.append(frame)
    const data = photoData()
    const pages = layout.pages.map(page => `<div class="page">${page.photos.map(photo => `<img src="${data[photo.id]}" style="position:absolute;left:${photo.x}mm;top:${photo.y}mm;width:${photo.w}mm;height:${photo.h}mm">`).join('')}</div>`).join('')
    const doc = frame.contentDocument
    frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000) }
    doc.open()
    doc.write(`<!doctype html><html><head><style>@page{size:${layout.width}mm ${layout.height}mm;margin:0}html,body{margin:0}.page{position:relative;width:${layout.width}mm;height:${layout.height}mm;break-after:page;overflow:hidden}.page:last-child{break-after:auto}</style></head><body>${pages}</body></html>`)
    doc.close()
  }
  return <section className="print-section" id="print">
    <div className="section-title"><div><span className="eyebrow">04 / PRINT YOUR PHOTOS</span><h2>Make a print sheet</h2><p>Combine all selected photo sizes on the same sheets to use the paper efficiently.</p></div><span className="sheet-badge"><Icon name="print"/> Print ready</span></div>
    <div className="print-grid"><div className="card print-controls">
      <div className="field"><label>Selected sizes and copies</label><div className="sheet-size-list">{available.length ? available.map(size => <label className="sheet-size-row" key={size.id}><span><strong>{size.name}</strong><small>{size.w.toFixed(1)} × {size.h.toFixed(1)} mm</small></span><input type="number" min="0" max="100" value={requested[size.id]} onChange={event => setCounts(previous => ({ ...previous, [size.id]: clamp(Number(event.target.value) || 0, 0, 100) }))} aria-label={`${size.name} copies`}/></label>) : <p className="empty-selection">Choose photo sizes above to add them here.</p>}</div><small className="copies-hint">Set copies to 0 to leave a size off the sheet.</small></div>
      <div className="two-fields"><div className="field"><label htmlFor="paper">Paper size</label><select id="paper" value={paperId} onChange={event => setPaperId(event.target.value)}><option value="a4">A4 · 210 × 297 mm</option><option value="short">Short bond / Letter · 8.5 × 11 in</option><option value="long">Long bond · 8.5 × 13 in</option><option value="legal">US Legal · 8.5 × 14 in</option><option value="a5">A5 · 148 × 210 mm</option><option value="fourR">4R · 4 × 6 in</option><option value="fiveR">5R · 5 × 7 in</option></select></div><div className="field"><label htmlFor="orientation">Orientation</label><select id="orientation" value={orientation} onChange={event => setOrientation(event.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div></div>
      <div className="two-fields"><div className="field"><label htmlFor="spacing">Spacing (mm)</label><input id="spacing" type="number" min="0" max="30" value={gap} onChange={event => setGap(clamp(Number(event.target.value) || 0, 0, 30))}/></div><div className="field"><label htmlFor="margin">Margins (mm)</label><input id="margin" type="number" min="0" max="50" value={margin} onChange={event => setMargin(clamp(Number(event.target.value) || 0, 0, 50))}/></div></div>
      <div className="layout-summary"><strong>{total} photos total</strong><span>{layout.pages.length} {layout.pages.length === 1 ? 'page' : 'pages'}</span></div>
      <div className="export-controls"><button className="primary-button wide" onClick={exportPdf}><Icon name="download"/> Download PDF</button><div className="two-actions"><button className="outline-button" onClick={exportImages}><Icon name="download"/> {format.toUpperCase()} sheet</button><select aria-label="Sheet image format" value={format} onChange={event => setFormat(event.target.value)}><option value="png">PNG</option><option value="jpg">JPG</option></select></div><button className="outline-button wide" onClick={print}><Icon name="print"/> Print sheet</button></div>
      <p className="print-reminder">Print using <strong>Actual Size or 100% Scale</strong>. Avoid Fit to Page to prevent resizing.</p>
    </div><div className="card sheet-preview"><div className="sheet-preview-head"><div><strong>Sheet preview</strong><span>{papers[paperId].name} · {orientation} · {layout.width} × {layout.height} mm</span></div><small>Actual proportions</small></div><div className="sheet-scroll">{layout.error ? <p className="sheet-error">{layout.error}</p> : layout.pages.length ? layout.pages.map((page, index) => <SheetPage key={index} layout={layout} page={page} imageUrls={imageUrls} index={index}/>) : <p className="sheet-error">Choose a size and set its copy count to preview a sheet.</p>}</div></div></div>
  </section>
}
export default function App() {
  const [image, setImage] = useState(null), [fileName, setFileName] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [adjustment, setAdjustment] = useState(initial), [selected, setSelected] = useState(['1x1']), [active, setActive] = useState('1x1'), [custom, setCustom] = useState({ width: '35', height: '45', unit: 'mm' }), [format, setFormat] = useState('jpg')
  const urlRef = useRef(null)
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) }, [notice])
  const cw = +custom.width * (custom.unit === 'in' ? 25.4 : 1), ch = +custom.height * (custom.unit === 'in' ? 25.4 : 1), validCustom = cw > 0 && ch > 0 && cw <= 300 && ch <= 300
  const sizes = useMemo(() => [...presets, { id: 'custom', name: 'Custom size', short: 'Custom', w: validCustom ? cw : 35, h: validCustom ? ch : 45 }], [cw, ch, validCustom])
  function onFile(file) { if (!file) return; setError(''); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Please choose a JPG, PNG, or WebP image.'); return } if (file.size > 25 * 1024 * 1024) { setError('Choose an image smaller than 25 MB.'); return } const url = URL.createObjectURL(file), next = new Image(); next.onload = () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = url; setImage(next); setFileName(file.name); setAdjustment(initial) }; next.onerror = () => { URL.revokeObjectURL(url); setError('This image could not be opened. Please try another file.') }; next.src = url }
  function remove() { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; setImage(null); setFileName(''); setAdjustment(initial); setError('') }
  async function download(size) { if (!image) return; if (size.id === 'custom' && !validCustom) { setNotice('Enter valid custom dimensions first.'); return } try { save(await blobOf(crop(image, size, adjustment), format), `IDFrame_${size.id}.${format}`) } catch { setNotice('Could not export this photo. Try a smaller size.') } }
  return <><header className="topbar"><a href="#top" className="brand"><span className="brand-mark"><span/></span>IDFrame</a><nav><a href="#editor">Editor</a><a href="#sizes">Photo sizes</a><a href="#print">Print sheet</a></nav></header><main id="top"><div className="workspace"><aside><Upload image={image} fileName={fileName} onFile={onFile} onRemove={remove} error={error}/><Sizes sizes={sizes} selected={selected} setSelected={setSelected} active={active} setActive={setActive} custom={custom} setCustom={setCustom}/></aside><div className="main-column"><Editor image={image} size={sizes.find(s => s.id === active) || sizes[0]} adjustment={adjustment} setAdjustment={setAdjustment}/><Previews image={image} sizes={sizes} selected={selected} adjustment={adjustment} format={format} setFormat={setFormat} download={download}/></div></div><PrintSheet image={image} sizes={sizes} selected={selected} adjustment={adjustment} notify={setNotice}/><footer><span><Icon name="lock" size={14}/> Your photos stay yours.</span></footer></main>{notice && <div className="toast" role="status">{notice}</div>}</>
}
