import { deflateRawSync, crc32 } from 'node:zlib'

/**
 * A minimal ZIP writer, which is all an .xlsx file needs.
 *
 * The alternative was pulling in a spreadsheet library. The leading one drags
 * roughly sixty transitive packages behind it — several unmaintained, one with
 * a live advisory — into a system that decides an election. Node already ships
 * DEFLATE and CRC-32, so the ~80 lines below replace all of it.
 *
 * Emits ZIP with no data descriptors and no ZIP64, which is correct for the
 * handful of small XML parts in a workbook.
 */

function dosDateTime(date) {
    // ZIP stores MS-DOS timestamps: 2-second resolution, epoch 1980.
    const year = Math.max(1980, date.getUTCFullYear())
    const time =
        (date.getUTCHours() << 11) |
        (date.getUTCMinutes() << 5) |
        (Math.floor(date.getUTCSeconds() / 2) & 0x1f)
    const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
    return { time: time & 0xffff, date: day & 0xffff }
}

/**
 * @param {Array<{ name: string, data: string | Buffer }>} entries
 * @returns {Buffer}
 */
export function createZip(entries, now = new Date()) {
    const { time, date } = dosDateTime(now)
    const localParts = []
    const centralParts = []
    let offset = 0

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8')
        const content = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
        const compressed = deflateRawSync(content, { level: 9 })
        const crc = crc32(content) >>> 0

        // Bit 11 marks the filename as UTF-8.
        const flags = 0x0800
        const method = 8 // deflate

        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4) // version needed
        local.writeUInt16LE(flags, 6)
        local.writeUInt16LE(method, 8)
        local.writeUInt16LE(time, 10)
        local.writeUInt16LE(date, 12)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(compressed.length, 18)
        local.writeUInt32LE(content.length, 22)
        local.writeUInt16LE(nameBuf.length, 26)
        local.writeUInt16LE(0, 28) // extra field length

        localParts.push(local, nameBuf, compressed)

        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(20, 4) // version made by
        central.writeUInt16LE(20, 6) // version needed
        central.writeUInt16LE(flags, 8)
        central.writeUInt16LE(method, 10)
        central.writeUInt16LE(time, 12)
        central.writeUInt16LE(date, 14)
        central.writeUInt32LE(crc, 16)
        central.writeUInt32LE(compressed.length, 20)
        central.writeUInt32LE(content.length, 24)
        central.writeUInt16LE(nameBuf.length, 28)
        central.writeUInt16LE(0, 30) // extra
        central.writeUInt16LE(0, 32) // comment
        central.writeUInt16LE(0, 34) // disk number start
        central.writeUInt16LE(0, 36) // internal attributes
        central.writeUInt32LE(0, 38) // external attributes
        central.writeUInt32LE(offset, 42)

        centralParts.push(central, nameBuf)

        offset += local.length + nameBuf.length + compressed.length
    }

    const centralDirectory = Buffer.concat(centralParts)

    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4) // this disk
    end.writeUInt16LE(0, 6) // disk with central directory
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralDirectory.length, 12)
    end.writeUInt32LE(offset, 16)
    end.writeUInt16LE(0, 20) // comment length

    return Buffer.concat([...localParts, centralDirectory, end])
}
