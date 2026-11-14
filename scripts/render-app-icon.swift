import AppKit
import Foundation

// Run from the repository root: swift scripts/render-app-icon.swift
// The editable SVG is the single source; the PNG is a generated packaging asset.
let source = URL(fileURLWithPath: "assets/app-icon.svg")
let destination = URL(fileURLWithPath: "assets/app-icon.png")
guard let image = NSImage(contentsOf: source) else {
    fatalError("Cannot read assets/app-icon.svg")
}
let size = 1024
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: size * 4, bitsPerPixel: 32
), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Cannot create icon render context")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size),
           from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Cannot encode the icon")
}
try data.write(to: destination)
print("Rendered assets/app-icon.png (1024 × 1024)")
