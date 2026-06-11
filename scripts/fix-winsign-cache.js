const fs = require('fs');
const path = require('path');
const os = require('os');

// Fix the winCodeSign cache symlink issue
const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');

if (fs.existsSync(cacheDir)) {
  const dirs = fs.readdirSync(cacheDir);
  dirs.forEach(dir => {
    const libDir = path.join(cacheDir, dir, 'darwin', '10.12', 'lib');
    if (fs.existsSync(libDir)) {
      try {
        const cryptoSrc = path.join(libDir, 'libcrypto.1.0.0.dylib');
        const cryptoDst = path.join(libDir, 'libcrypto.dylib');
        const sslSrc = path.join(libDir, 'libssl.1.0.0.dylib');
        const sslDst = path.join(libDir, 'libssl.dylib');

        if (fs.existsSync(cryptoSrc) && (!fs.existsSync(cryptoDst) || fs.statSync(cryptoDst).size === 0)) {
          fs.copyFileSync(cryptoSrc, cryptoDst);
          console.log(`Fixed libcrypto.dylib in ${dir}`);
        }

        if (fs.existsSync(sslSrc) && (!fs.existsSync(sslDst) || fs.statSync(sslDst).size === 0)) {
          fs.copyFileSync(sslSrc, sslDst);
          console.log(`Fixed libssl.dylib in ${dir}`);
        }
      } catch (e) {
        console.error(`Error fixing ${dir}:`, e.message);
      }
    }
  });
}

console.log('WinSign cache fix completed');
