const fs = require('fs');
const path = require('path');
const https = require('https');

// Create a simple purple gradient icon using Canvas
async function createIcon() {
  try {
    // Try to use node-canvas if available
    const { createCanvas } = require('canvas');

    const sizes = [256, 128, 64, 48, 32, 16];
    const pngFiles = [];

    for (const size of sizes) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');

      // Create purple gradient background
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#9b59b6');
      gradient.addColorStop(0.5, '#8e44ad');
      gradient.addColorStop(1, '#6c3483');

      // Draw circle background
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2);
      ctx.fill();

      // Draw chat bubble
      const bubbleWidth = size * 0.5;
      const bubbleHeight = size * 0.35;
      const bubbleX = size * 0.25;
      const bubbleY = size * 0.27;
      const cornerRadius = size * 0.08;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.moveTo(bubbleX + cornerRadius, bubbleY);
      ctx.lineTo(bubbleX + bubbleWidth - cornerRadius, bubbleY);
      ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + cornerRadius);
      ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - cornerRadius);
      ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - cornerRadius, bubbleY + bubbleHeight);
      ctx.lineTo(bubbleX + cornerRadius, bubbleY + bubbleHeight);
      ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - cornerRadius);
      ctx.lineTo(bubbleX, bubbleY + cornerRadius);
      ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + cornerRadius, bubbleY);
      ctx.fill();

      // Draw three dots
      const dotRadius = size * 0.03;
      const dotY = bubbleY + bubbleHeight / 2;
      ctx.fillStyle = '#8e44ad';
      [0.35, 0.5, 0.65].forEach(pos => {
        ctx.beginPath();
        ctx.arc(size * pos, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw P2P connection at bottom
      if (size >= 64) {
        const p2pRadius = size * 0.07;
        const p2pY = size * 0.78;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

        // Left circle
        ctx.beginPath();
        ctx.arc(size * 0.33, p2pY, p2pRadius, 0, Math.PI * 2);
        ctx.fill();

        // Right circle
        ctx.beginPath();
        ctx.arc(size * 0.67, p2pY, p2pRadius, 0, Math.PI * 2);
        ctx.fill();

        // Connection line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = size * 0.023;
        ctx.beginPath();
        ctx.moveTo(size * 0.33 + p2pRadius, p2pY);
        ctx.lineTo(size * 0.67 - p2pRadius, p2pY);
        ctx.stroke();
      }

      // Save PNG
      const buffer = canvas.toBuffer('image/png');
      const filename = path.join(__dirname, `icon-${size}.png`);
      fs.writeFileSync(filename, buffer);
      pngFiles.push(filename);
      console.log(`Created ${filename}`);
    }

    console.log('\nPNG files created successfully!');
    console.log('\nTo create icon.ico:');
    console.log('1. Install ImageMagick: https://imagemagick.org/script/download.php');
    console.log('2. Run: magick icon-256.png icon-128.png icon-64.png icon-48.png icon-32.png icon-16.png icon.ico');
    console.log('\nOr use icon-256.png as a fallback for now.');

  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log('canvas module not found. Installing...');
      console.log('Please run: npm install --save-dev canvas');
      console.log('\nAlternatively, you can:');
      console.log('1. Use the SVG file: build/icons/icon.svg');
      console.log('2. Convert it online at: https://convertio.co/svg-ico/');
      console.log('3. Save as: build/icons/icon.ico');
    } else {
      console.error('Error creating icon:', err);
    }
  }
}

createIcon();
