import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const brandSource = await readFile(new URL('../src/components/brand.tsx', import.meta.url), 'utf8')
const primary = brandSource.match(/primary:\s*'(#[0-9a-fA-F]{6})'/)?.[1]
if (!primary) throw new Error('Could not read BRAND_CONFIG.primary from src/components/brand.tsx')
const background = hexToRgb(primary)
const outDir = new URL('../public/icons/', import.meta.url)
await mkdir(outDir, { recursive: true })

function hexToRgb(hex) { return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) }
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}
function encodePng(width, height, pixels) {
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 4 + 1)
    rows[offset] = 0
    pixels.copy(rows, offset + 1, y * width * 4, (y + 1) * width * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
function line(pixels, side, x1, y1, x2, y2, thickness, color) {
  const dx = x2 - x1, dy = y2 - y1, length2 = dx * dx + dy * dy
  const radius = thickness / 2
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 1)), maxX = Math.min(side - 1, Math.ceil(Math.max(x1, x2) + radius + 1))
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 1)), maxY = Math.min(side - 1, Math.ceil(Math.max(y1, y2) + radius + 1))
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = length2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length2)) : 0
    const px = x1 + t * dx, py = y1 + t * dy
    if ((x - px) ** 2 + (y - py) ** 2 <= radius ** 2) {
      const i = (y * side + x) * 4
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255
    }
  }
}
function render(size, { maskable = false } = {}) {
  const ss = 3, side = size * ss, pixels = Buffer.alloc(side * side * 4)
  const radius = maskable ? 0 : size * 0.22 * ss
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const cx = x + .5, cy = y + .5
    const qx = Math.max(radius, Math.min(side - radius, cx)), qy = Math.max(radius, Math.min(side - radius, cy))
    if (maskable || (cx - qx) ** 2 + (cy - qy) ** 2 <= radius ** 2) {
      const i = (y * side + x) * 4
      pixels[i] = background[0]; pixels[i + 1] = background[1]; pixels[i + 2] = background[2]; pixels[i + 3] = 255
    }
  }
  const center = side / 2, glyphWidth = size * ss * (maskable ? .54 : .68)
  const scale = glyphWidth / 25, originY = center - 19 * scale, originX = center - 20 * scale
  const pt = (x, y) => [originX + x * scale, originY + y * scale]
  const stroke = 2.8 * scale, white = [255,255,255]
  const paths = [
    [[7.5,34],[7.5,10],[20,4],[32.5,10],[32.5,34],[7.5,34]],
    [[15,34],[15,20],[25,20],[25,34]],
    [[13.5,15.5],[17.6,19.6],[26.4,10.8]],
  ]
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const [x1,y1] = pt(...path[i - 1]), [x2,y2] = pt(...path[i])
    line(pixels, side, x1, y1, x2, y2, stroke, white)
  }
  const output = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r=0,g=0,b=0,a=0
    for (let sy=0;sy<ss;sy++) for (let sx=0;sx<ss;sx++) {
      const i=(((y*ss+sy)*side)+(x*ss+sx))*4, alpha=pixels[i+3]
      r+=pixels[i]*alpha/255;g+=pixels[i+1]*alpha/255;b+=pixels[i+2]*alpha/255;a+=alpha
    }
    const j=(y*size+x)*4;output[j+3]=Math.round(a/(ss*ss))
    if(a){output[j]=Math.round(r/(a/255));output[j+1]=Math.round(g/(a/255));output[j+2]=Math.round(b/(a/255))}
  }
  return encodePng(size,size,output)
}

const iconSizes = [48,72,96,144,192,256,384,512]
for (const size of iconSizes) await writeFile(new URL(`gatewise-${size}.png`, outDir), render(size))
for (const size of [192,512]) await writeFile(new URL(`gatewise-maskable-${size}.png`, outDir), render(size,{maskable:true}))
await writeFile(new URL('../public/apple-touch-icon.png', import.meta.url), render(180))
const png = render(32)
const header = Buffer.alloc(22)
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4)
header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18)
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header,png]))
console.log(`Generated ${iconSizes.length} app icons, 2 maskable icons, apple touch icon, and favicon using ${primary}.`)
