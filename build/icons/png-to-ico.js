const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function convertToIco() {
  try {
    // png-to-ico exports as an ES module, use default or imagesToIco
    const convert = pngToIco.default || pngToIco.imagesToIco || pngToIco;
    
    // png-to-ico expects an array of file paths or buffers
    const iconPaths = [
      path.join(__dirname, 'icon-256.png'),
      path.join(__dirname, 'icon-128.png'),
      path.join(__dirname, 'icon-64.png'),
      path.join(__dirname, 'icon-48.png'),
      path.join(__dirname, 'icon-32.png'),
      path.join(__dirname, 'icon-16.png')
    ];

    console.log('Converting PNG files to ICO...');
    const buf = await convert(iconPaths);
    fs.writeFileSync(path.join(__dirname, 'icon.ico'), buf);
    console.log('Successfully created icon.ico!');
  } catch (err) {
    console.error('Error converting to ICO:', err);
    console.log('\nTrying single-file conversion...');
    try {
      // Try with just the largest icon
      const convert = pngToIco.default || pngToIco.imagesToIco || pngToIco;
      const iconPath = path.join(__dirname, 'icon-256.png');
      const buf = await convert([iconPath]);
      fs.writeFileSync(path.join(__dirname, 'icon.ico'), buf);
      console.log('Successfully created icon.ico from single PNG!');
    } catch (e) {
      console.error('Single-file conversion also failed:', e);
      throw e;
    }
  }
}

convertToIco();
