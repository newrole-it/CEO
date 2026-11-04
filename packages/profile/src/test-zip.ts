import { deflateRawSync } from "zlib"

/** Buffer.concat with the Node 18 types, where Buffer[] is not a Uint8Array[]. */
const cat = (list: Buffer[]) => Buffer.concat(list as unknown as Uint8Array[])

/** A minimal ZIP writer for fixtures: deflate unless `stored`, no CRC check on our side. */
export function zip(files: { name: string; content: string | Buffer; stored?: boolean }[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const raw = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8")
    const data = file.stored ? raw : deflateRawSync(raw)
    const name = Buffer.from(file.name, "utf8")
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(file.stored ? 0 : 8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(file.stored ? 0 : 8, 10)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += local.length + name.length + data.length
  }
  const dir = cat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return cat([...locals, dir, end])
}
