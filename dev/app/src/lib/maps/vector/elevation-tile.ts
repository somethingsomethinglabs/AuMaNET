const GRID = 257;
const SIZE = 512;
const MAX_LERC_BYTES = 512 * 1024;

export async function readElevationTile(response: Response): Promise<Blob> {
  if (!response.ok) throw Error('Offline elevation tile unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) throw Error('Oversized elevation tile');
  if (response.headers.get('Content-Type') !== 'image/lerc') return new Blob([bytes], {type:'image/webp'});
  const pixels = await vicmapTerrariumPixels(bytes);
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d');
  if (!context) throw Error('Offline elevation rendering unavailable');
  context.putImageData(new ImageData(pixels, SIZE, SIZE), 0, 0);
  return canvas.convertToBlob({type:'image/png'});
}

// The service supplies elevation posts on cell edges, including the shared last row and column.
export async function vicmapTerrariumPixels(bytes: ArrayBuffer): Promise<Uint8ClampedArray<ArrayBuffer>> {
  if (bytes.byteLength < 66 || bytes.byteLength > MAX_LERC_BYTES) throw Error('Invalid Victorian elevation tile');
  const header = new DataView(bytes);
  const text = new TextDecoder().decode(bytes.slice(0, 10));
  const rows = header.getInt32(50, true), columns = header.getInt32(54, true);
  const dataBytes = header.getInt32(58, true), trailing = bytes.byteLength - 66 - dataBytes;
  if (text !== 'CntZImage ' || header.getInt32(10, true) !== 11 || header.getInt32(14, true) !== 8
      || header.getInt32(18, true) !== GRID || header.getInt32(22, true) !== GRID
      || header.getInt32(34, true) || header.getInt32(38, true) || header.getInt32(42, true)
      || header.getFloat32(46, true) !== 1 || rows < 1 || rows > GRID || columns < 1 || columns > GRID
      || dataBytes < 0 || trailing < 0 || trailing > 3) throw Error('Invalid Victorian elevation grid');
  validateBlocks(header, rows, columns, dataBytes);
  const {default: lerc} = await import('lerc');
  const {width, height, pixels:[elevation], mask} = lerc.decode(bytes);
  if (width !== GRID || height !== GRID || mask || elevation.length !== GRID ** 2
      || elevation.some(height => !Number.isFinite(height) || height < -1000 || height > 9000)) throw Error('Invalid Victorian elevation samples');

  const rgba = new Uint8ClampedArray(SIZE ** 2 * 4);
  for (let y = 0; y < SIZE; y++) {
    const row = Math.floor(y / 2) * GRID;
    const ty = y % 2 ? .75 : .25;
    for (let x = 0; x < SIZE; x++) {
      const left = row + Math.floor(x / 2);
      const tx = x % 2 ? .75 : .25;
      const top = elevation[left] * (1 - tx) + elevation[left + 1] * tx;
      const bottom = elevation[left + GRID] * (1 - tx) + elevation[left + GRID + 1] * tx;
      const rgb = Math.round((32768 + top * (1 - ty) + bottom * ty) * 256);
      const index = (y * SIZE + x) * 4;
      rgba[index] = rgb >>> 16;
      rgba[index + 1] = (rgb >>> 8) & 255;
      rgba[index + 2] = rgb & 255;
      rgba[index + 3] = 255;
    }
  }
  return rgba;
}

function validateBlocks(header: DataView, rows: number, columns: number, dataBytes: number) {
  const blocks = (rows + Number(GRID % rows !== 0)) * (columns + Number(GRID % columns !== 0));
  const end = 66 + dataBytes;
  let position = 66;
  function take(length: number) {
    const start = position;
    position += length;
    if (position > end) throw Error('Truncated Victorian elevation block');
    return start;
  }
  const fieldBytes = [4, 2, 1];
  for (let i = 0; i < blocks; i++) {
    const tag = header.getUint8(take(1));
    const encoding = tag & 63;
    if (encoding === 2) continue;
    if (encoding === 0 && tag === 0 && blocks === 1 && dataBytes === GRID ** 2 * 4 + 1) {
      take(dataBytes - 1);
      continue;
    }
    if ((encoding !== 1 && encoding !== 3) || tag >>> 6 === 3) throw Error('Invalid Victorian elevation block');
    take(fieldBytes[tag >>> 6]);
    if (encoding === 3) continue;
    const packed = header.getUint8(take(1));
    const bits = packed & 63;
    const countWidth = fieldBytes[packed >>> 6];
    if (!countWidth || bits > 32) throw Error('Invalid Victorian elevation sample count');
    const countOffset = take(countWidth);
    const count = countWidth === 4 ? header.getUint32(countOffset, true)
      : countWidth === 2 ? header.getUint16(countOffset, true) : header.getUint8(countOffset);
    if (count > GRID ** 2) throw Error('Oversized Victorian elevation block');
    take(Math.ceil(count * bits / 8));
  }
  if (position !== end) throw Error('Unexpected Victorian elevation data');
}
