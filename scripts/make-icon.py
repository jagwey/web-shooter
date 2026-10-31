import struct
import zlib
from pathlib import Path


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png_bytes(size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            center = (size - 1) / 2
            nx = (x - center) / (size * 0.5)
            ny = (y - center) / (size * 0.5)
            radius = (nx * nx + ny * ny) ** 0.5
            outside = max(abs(nx), abs(ny)) > 0.9
            if outside:
                raw.extend((0, 0, 0, 0))
                continue
            spoke = abs(nx) < 0.035 or abs(ny) < 0.035 or abs(nx - ny) < 0.05 or abs(nx + ny) < 0.05
            ring = abs((radius * 5.5) % 1 - 0.08) < 0.07
            if radius < 0.78 and (spoke or ring):
                raw.extend((156, 240, 196, 255))
            else:
                raw.extend((13, 59, 46, 255))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def main():
    out = Path("src-tauri/icons")
    out.mkdir(parents=True, exist_ok=True)
    Path("public/app-icon.png").write_bytes(png_bytes(256))
    for size in (32, 128, 256):
        (out / f"{size}x{size}.png").write_bytes(png_bytes(size))


if __name__ == "__main__":
    main()
