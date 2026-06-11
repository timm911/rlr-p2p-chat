const fs = require('fs');
const path = require('path');

// Create a simple ICO file with a basic purple gradient design
// This is a 256x256 ICO file with a purple chat bubble design

const createSimpleICO = () => {
  const { exec } = require('child_process');
  const iconDir = __dirname;

  // Try to use ImageMagick if available
  exec('magick --version', (error) => {
    if (!error) {
      console.log('ImageMagick found, converting SVG to ICO...');
      exec(`magick "${path.join(iconDir, 'icon.svg')}" -define icon:auto-resize=256,128,64,48,32,16 "${path.join(iconDir, 'icon.ico')}"`, (err, stdout, stderr) => {
        if (err) {
          console.error('Error converting with ImageMagick:', err);
          console.log('Please install ImageMagick or manually create icon.ico');
          createFallbackICO();
        } else {
          console.log('Successfully created icon.ico');
        }
      });
    } else {
      console.log('ImageMagick not found. Creating fallback icon...');
      createFallbackICO();
    }
  });
};

// Create a minimal fallback ICO if ImageMagick is not available
const createFallbackICO = () => {
  console.log('\nTo create icon.ico, please:');
  console.log('1. Install ImageMagick: https://imagemagick.org/script/download.php');
  console.log('2. Run: magick build/icons/icon.svg -define icon:auto-resize=256,128,64,48,32,16 build/icons/icon.ico');
  console.log('\nOr use an online converter:');
  console.log('- https://convertio.co/svg-ico/');
  console.log('- https://cloudconvert.com/svg-to-ico');
  console.log('\nFor now, creating a placeholder PNG...');

  // Check if sharp is available
  try {
    const sharp = require('sharp');
    const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'));

    // Create PNG versions
    Promise.all([
      sharp(svg).resize(256, 256).toFile(path.join(__dirname, 'icon-256.png')),
      sharp(svg).resize(128, 128).toFile(path.join(__dirname, 'icon-128.png')),
      sharp(svg).resize(64, 64).toFile(path.join(__dirname, 'icon-64.png')),
      sharp(svg).resize(32, 32).toFile(path.join(__dirname, 'icon-32.png')),
      sharp(svg).resize(16, 16).toFile(path.join(__dirname, 'icon-16.png'))
    ]).then(() => {
      console.log('Created PNG versions. You can use icon-256.png temporarily.');
    }).catch(err => {
      console.error('Error creating PNGs:', err);
    });
  } catch (e) {
    console.log('Sharp not available. Please manually convert icon.svg to icon.ico');
  }
};

createSimpleICO();
