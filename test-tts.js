// Simple test script to verify say package works on Windows
const say = require('say')

console.log('Testing say package...')
console.log('Platform:', process.platform)

// Test basic speech
say.speak('Hello, this is a test', null, 1.0, (error) => {
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Speech completed successfully!')
  }

  // Exit after 5 seconds
  setTimeout(() => {
    process.exit(error ? 1 : 0)
  }, 5000)
})

console.log('Speech initiated...')
