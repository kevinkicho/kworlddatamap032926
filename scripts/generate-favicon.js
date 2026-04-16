#!/usr/bin/env node
/**
 * Generate favicon.ico from favicon.svg
 * Creates a simple 16x16 and 32x32 ICO file
 */
const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'favicon.ico');

// Create a minimal ICO file (16x16 blue globe with green land)
// ICO format: ICONDIR + ICONDIRENTRY + PNG data
// For simplicity, we'll create a simple PNG-based ICO

// Minimal 16x16 PNG data for a globe icon (blue with green land masses)
// This is a very simplified globe representation
function createMinimalPNG() {
  // Create a simple 16x16 RGBA buffer
  const width = 16;
  const height = 16;
  const data = Buffer.alloc(width * height * 4 + 8); // RGBA + simple header

  // Fill with blue ocean
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Distance from center
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 7) {
        // Outside globe - transparent
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        // Inside globe - blue ocean with some green land
        // Simple land representation
        const isLand =
          (y >= 3 && y <= 6 && x >= 2 && x <= 6) ||  // North America
          (y >= 7 && y <= 9 && x >= 3 && x <= 5) ||  // Central America
          (y >= 9 && y <= 12 && x >= 4 && x <= 7) || // South America
          (y >= 3 && y <= 10 && x >= 8 && x <= 11) || // Europe/Africa
          (y >= 4 && y <= 11 && x >= 12 && x <= 14); // Asia

        if (isLand) {
          data[idx] = 72;     // R - green
          data[idx + 1] = 187; // G
          data[idx + 2] = 120; // B
          data[idx + 3] = 255; // A
        } else {
          data[idx] = 74;     // R - blue
          data[idx + 1] = 144; // G
          data[idx + 2] = 217; // B
          data[idx + 3] = 255; // A
        }
      }
    }
  }

  return { width, height, data };
}

// Create ICO file structure
function createICO(pngData, width, height) {
  // ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Type: 1 = ICO
  header.writeUInt16LE(1, 4);      // Number of images

  // ICO directory entry
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width, 0);      // Width
  entry.writeUInt8(height, 1);     // Height
  entry.writeUInt8(0, 2);          // Color palette
  entry.writeUInt8(0, 3);          // Reserved
  entry.writeUInt16LE(1, 4);       // Color planes
  entry.writeUInt16LE(32, 6);      // Bits per pixel

  // PNG data size (simplified - just use raw RGBA for BMP format within ICO)
  // For proper ICO, we need BMP format, not PNG

  // Actually, let's create a proper BMP-based ICO
  // BMP header for 16x16 32-bit
  const bmpInfoHeaderSize = 40;
  const bmpDataSize = width * height * 4;
  const maskSize = Math.ceil(width / 8) * height;
  const totalBmpSize = bmpInfoHeaderSize + bmpDataSize + maskSize;

  entry.writeUInt32LE(totalBmpSize, 8);  // Size of image data
  entry.writeUInt32LE(22, 12);           // Offset to image data (6 + 16 = 22)

  // BMP info header
  const bmpHeader = Buffer.alloc(bmpInfoHeaderSize);
  bmpHeader.writeUInt32LE(40, 0);        // Header size
  bmpHeader.writeInt32LE(width, 4);      // Width
  bmpHeader.writeInt32LE(height * 2, 8); // Height (doubled for AND mask)
  bmpHeader.writeUInt16LE(1, 12);        // Planes
  bmpHeader.writeUInt16LE(32, 14);       // Bits per pixel
  bmpHeader.writeUInt32LE(0, 16);        // Compression
  bmpHeader.writeUInt32LE(bmpDataSize, 20); // Image size

  // Create AND mask (all transparent = 0)
  const andMask = Buffer.alloc(maskSize);

  // Combine everything
  const ico = Buffer.concat([header, entry, bmpHeader, pngData, andMask]);
  return ico;
}

// Actually, let's use a simpler approach - just copy the SVG as favicon.ico
// Modern browsers will still work, and this prevents the 404

// Create a simple text-based approach - copy SVG to .ico extension
// This works because browsers check file extension for link rel, but
// for automatic favicon.ico requests, they expect binary ICO format.

// For proper ICO, let's create a minimal valid ICO using raw bytes
function createMinimalICO() {
  // The simplest valid ICO is one with a single 16x16 32-bit BMP image
  const width = 16;
  const height = 16;

  // Calculate sizes
  const headerSize = 6;
  const entrySize = 16;
  const bmpHeaderSize = 40;
  const pixelDataSize = width * height * 4;
  const maskRowSize = Math.ceil(width / 8);
  const maskSize = maskRowSize * height;
  const imageDataSize = bmpHeaderSize + pixelDataSize + maskSize;

  // Total ICO size
  const totalSize = headerSize + entrySize + imageDataSize;

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  // ICONDIR header
  buffer.writeUInt16LE(0, offset); offset += 2;     // Reserved
  buffer.writeUInt16LE(1, offset); offset += 2;     // Type: ICO
  buffer.writeUInt16LE(1, offset); offset += 2;     // Image count

  // ICONDIRENTRY
  buffer.writeUInt8(width, offset); offset += 1;    // Width
  buffer.writeUInt8(height, offset); offset += 1;  // Height
  buffer.writeUInt8(0, offset); offset += 1;         // Colors (0 = no palette)
  buffer.writeUInt8(0, offset); offset += 1;        // Reserved
  buffer.writeUInt16LE(1, offset); offset += 2;     // Color planes
  buffer.writeUInt16LE(32, offset); offset += 2;    // Bits per pixel
  buffer.writeUInt32LE(imageDataSize, offset); offset += 4; // Image data size
  buffer.writeUInt32LE(headerSize + entrySize, offset); offset += 4; // Offset to image

  // BITMAPINFOHEADER
  buffer.writeUInt32LE(40, offset); offset += 4;   // Header size
  buffer.writeInt32LE(width, offset); offset += 4; // Width
  buffer.writeInt32LE(height * 2, offset); offset += 4; // Height (x2 for AND mask)
  buffer.writeUInt16LE(1, offset); offset += 2;     // Planes
  buffer.writeUInt16LE(32, offset); offset += 2;    // Bits per pixel
  buffer.writeUInt32LE(0, offset); offset += 4;     // Compression
  buffer.writeUInt32LE(pixelDataSize, offset); offset += 4; // Image size
  buffer.writeUInt32LE(0, offset); offset += 4;     // X pixels per meter
  buffer.writeUInt32LE(0, offset); offset += 4;     // Y pixels per meter
  buffer.writeUInt32LE(0, offset); offset += 4;    // Colors used
  buffer.writeUInt32LE(0, offset); offset += 4;    // Important colors

  // Pixel data (BGRA, bottom-up)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 7.5) {
        // Transparent (outside circle)
        buffer.writeUInt8(0, offset); offset += 1;  // B
        buffer.writeUInt8(0, offset); offset += 1;  // G
        buffer.writeUInt8(0, offset); offset += 1;  // R
        buffer.writeUInt8(0, offset); offset += 1;  // A
      } else {
        // Land masses (simplified)
        const isLand =
          (y >= 2 && y <= 5 && x >= 1 && x <= 5) ||   // Americas
          (y >= 7 && y <= 10 && x >= 2 && x <= 5) ||
          (y >= 3 && y <= 8 && x >= 7 && x <= 9) ||   // Europe/Africa
          (y >= 10 && y <= 12 && x >= 7 && x <= 9) ||
          (y >= 3 && y <= 9 && x >= 10 && x <= 14);  // Asia

        if (isLand) {
          // Green land
          buffer.writeUInt8(120, offset); offset += 1;  // B
          buffer.writeUInt8(187, offset); offset += 1;  // G
          buffer.writeUInt8(72, offset); offset += 1;   // R
          buffer.writeUInt8(255, offset); offset += 1;  // A
        } else {
          // Blue ocean
          buffer.writeUInt8(217, offset); offset += 1; // B
          buffer.writeUInt8(144, offset); offset += 1; // G
          buffer.writeUInt8(74, offset); offset += 1;  // R
          buffer.writeUInt8(255, offset); offset += 1; // A
        }
      }
    }
  }

  // AND mask (all zeros = fully opaque where A > 0)
  for (let i = 0; i < maskSize; i++) {
    buffer.writeUInt8(0, offset); offset += 1;
  }

  return buffer;
}

// Generate and save
const ico = createMinimalICO();
atomicWrite(OUTPUT, ico);
console.log(`Created favicon.ico (${ico.length} bytes)`);