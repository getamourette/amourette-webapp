// Run on macOS: swift scripts/generate-heic-fixtures.swift <output-directory>
// Synthetic gradients only; no camera photos or personal metadata.
import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
let width = 128, height = 96
var pixels = [UInt16](repeating: 0, count: width * height * 4)
for y in 0..<height { for x in 0..<width {
    let i = (y * width + x) * 4
    pixels[i] = UInt16(x * 65535 / (width - 1))
    pixels[i + 1] = UInt16(y * 65535 / (height - 1))
    pixels[i + 2] = UInt16((x + y) * 65535 / (width + height - 2))
    pixels[i + 3] = 65535
}}
let p3 = CGColorSpace(name: CGColorSpace.displayP3)!
let image = CIImage(bitmapData: pixels.withUnsafeBytes { Data($0) }, bytesPerRow: width * 8,
    size: CGSize(width: width, height: height), format: .RGBA16, colorSpace: p3)
let context = CIContext(options: [.useSoftwareRenderer: true])
let options = [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 1.0]
for (name, space) in [("p3-10", p3), ("pq-10", CGColorSpace(name: CGColorSpace.itur_2100_PQ)!),
                       ("hlg-10", CGColorSpace(name: CGColorSpace.itur_2100_HLG)!)] {
    try context.writeHEIF10Representation(of: image, to: directory.appendingPathComponent(name + ".heic"),
        colorSpace: space, options: options)
}
let cg = context.createCGImage(image, from: image.extent, format: .RGBA8, colorSpace: p3)!
for orientation in 1...8 {
    let url = directory.appendingPathComponent("p3-orientation-\(orientation).heic")
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.heic.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, cg, [kCGImagePropertyOrientation: orientation,
        kCGImageDestinationLossyCompressionQuality: 1.0,
        kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFArtist: "private-test-marker"]] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { fatalError("HEIC fixture generation failed") }
}
print("Generated synthetic P3, orientation and HDR-refusal HEIC fixtures")
