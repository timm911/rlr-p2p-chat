const { execSync } = require('child_process');
const path = require('path');

console.log('Starting Windows build...');

// Build the app first
console.log('\n1. Building app with electron-vite...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
} catch (e) {
  console.error('Build failed:', e.message);
  process.exit(1);
}

// Function to run electron-builder with automatic cache fixing
async function buildWithRetry(target) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      console.log(`\n2. Running electron-builder (attempt ${attempts + 1}/${maxAttempts})...`);

      // Try to fix cache before each attempt
      require('./fix-winsign-cache');

      // Run electron-builder
      process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
      execSync(`npx electron-builder --win ${target} --config electron-builder.yml`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
      });

      console.log('\nBuild completed successfully!');
      return;
    } catch (e) {
      attempts++;
      if (e.message.includes('symlink') || e.message.includes('libcrypto') || e.message.includes('libssl')) {
        console.log(`\nSymlink error detected, fixing cache and retrying...`);
        // Fix the cache
        require('./fix-winsign-cache');
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.error('\nBuild failed:', e.message);
        throw e;
      }
    }
  }

  console.error(`\nBuild failed after ${maxAttempts} attempts`);
  process.exit(1);
}

// Get target from command line args (nsis, portable, or both)
const target = process.argv[2] || '';
buildWithRetry(target);
