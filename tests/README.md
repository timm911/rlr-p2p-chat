# RLR P2P Chat - Testing Documentation

This directory contains the automated test suite for the RLR P2P Chat application. The test suite includes unit tests and integration tests to ensure the reliability and correctness of the application.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [Continuous Integration](#continuous-integration)
- [Manual Testing](#manual-testing)

---

## Overview

The RLR P2P Chat application uses **Jest** as the primary testing framework with **ts-jest** for TypeScript support. The test suite covers:

- **Unit Tests**: Individual components and functions in isolation
- **Integration Tests**: Multiple components working together (e.g., TCP client-server communication)
- **Manual Tests**: Features requiring human interaction (documented in TEST_CHECKLIST.md)

### Testing Stack

- **Jest**: JavaScript testing framework
- **ts-jest**: TypeScript preprocessor for Jest
- **@testing-library/react**: React component testing utilities
- **@testing-library/user-event**: User interaction simulation
- **@playwright/test**: End-to-end testing framework (for future Electron tests)

---

## Test Structure

```
tests/
├── README.md                    # This file
├── setup.ts                     # Test setup and global configuration
├── unit/                        # Unit tests
│   ├── protocol.test.ts        # Protocol message encoding/decoding tests
│   └── file-transfer.test.ts   # File transfer manager tests
├── integration/                 # Integration tests
│   └── tcp-connection.test.ts  # TCP client-server integration tests
└── fixtures/                    # Test data and fixtures
    └── file-transfer/          # Files for file transfer testing
```

### Test File Naming Convention

- Unit tests: `*.test.ts` in `tests/unit/`
- Integration tests: `*.test.ts` in `tests/integration/`
- Test files should match the name of the file being tested

---

## Running Tests

### Prerequisites

```bash
# Install dependencies (if not already installed)
npm install
```

### Basic Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (automatically re-run on file changes)
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests with verbose output
npm run test:verbose

# Run tests with coverage report
npm run test:coverage
```

### Running Specific Test Files

```bash
# Run a specific test file
npm test -- tests/unit/protocol.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="TCP Connection"

# Run tests in a specific directory
npm test -- tests/integration
```

### Debug Mode

To debug tests in VS Code:

1. Set breakpoints in your test file
2. Open the test file
3. Press F5 or use the Debug menu
4. Select "Jest: Current File" configuration

Alternatively, use the `--inspect` flag:

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## Test Coverage

### Viewing Coverage Reports

After running tests with coverage:

```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:

- **coverage/lcov-report/index.html**: HTML coverage report (open in browser)
- **coverage/lcov.info**: LCOV format for CI tools
- **coverage/coverage-final.json**: JSON format

### Coverage Goals

We aim for the following coverage targets:

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

Critical paths (networking, file transfer, message protocol) should have > 90% coverage.

---

## Writing Tests

### Best Practices

1. **Test Naming**: Use descriptive test names that explain the expected behavior
   ```typescript
   it('should encode a chat message correctly', () => { ... });
   ```

2. **Arrange-Act-Assert Pattern**:
   ```typescript
   it('should send message from client to server', async () => {
     // Arrange: Set up test conditions
     const message = { type: 'chat', payload: {...}, timestamp: Date.now() };

     // Act: Perform the action
     const sent = client.send(message);

     // Assert: Verify the outcome
     expect(sent).toBe(true);
   });
   ```

3. **Isolation**: Each test should be independent and not rely on other tests

4. **Cleanup**: Always clean up resources (connections, files, timers) in `afterEach` or `afterAll`

5. **Async Handling**: Use async/await for asynchronous operations
   ```typescript
   it('should connect to server', async () => {
     await server.start();
     expect(server.isConnected()).toBe(true);
   });
   ```

### Unit Test Example

```typescript
import { encodeMessage, decodeMessage } from '../../src/main/network/protocol';

describe('Protocol', () => {
  it('should encode and decode a message', () => {
    const original = {
      type: 'chat',
      payload: { content: 'Hello' },
      timestamp: Date.now()
    };

    const encoded = encodeMessage(original);
    const decoded = decodeMessage(encoded);

    expect(decoded?.type).toBe(original.type);
    expect(decoded?.payload.content).toBe(original.payload.content);
  });
});
```

### Integration Test Example

```typescript
import { TCPServer } from '../../src/main/network/tcp-server';
import { TCPClient } from '../../src/main/network/tcp-client';

describe('TCP Connection', () => {
  let server: TCPServer;
  let client: TCPClient;

  beforeEach(async () => {
    server = new TCPServer(54999);
    await server.start();

    client = new TCPClient('127.0.0.1', 54999);
  });

  afterEach(() => {
    client.disconnect();
    server.stop();
  });

  it('should establish connection', async () => {
    const connectionPromise = new Promise((resolve) => {
      server.once('connected', resolve);
    });

    client.connect();
    await connectionPromise;

    expect(server.isConnected()).toBe(true);
    expect(client.isConnected()).toBe(true);
  });
});
```

### Testing Asynchronous Code

Jest provides several ways to test async code:

```typescript
// Using async/await
it('should complete async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBe(expected);
});

// Using promises
it('should resolve promise', () => {
  return expect(somePromise()).resolves.toBe(expected);
});

// Using done callback
it('should call callback', (done) => {
  someFunction((result) => {
    expect(result).toBe(expected);
    done();
  });
});
```

### Mocking

Use Jest's mocking capabilities for external dependencies:

```typescript
// Mock a module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue('file content'),
    writeFile: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock a function
const mockCallback = jest.fn();
someFunction(mockCallback);
expect(mockCallback).toHaveBeenCalledWith(expectedArg);
```

---

## Test Scenarios Covered

### Unit Tests

#### Protocol Tests (`tests/unit/protocol.test.ts`)
- ✅ Message encoding (chat, status, reaction, typing, file-offer, ping/pong)
- ✅ Message decoding with valid and invalid input
- ✅ Round-trip encoding/decoding
- ✅ Special character handling
- ✅ Malformed message handling
- ✅ Empty message handling

#### File Transfer Tests (`tests/unit/file-transfer.test.ts`)
- ✅ Creating send transfers
- ✅ Accepting file transfers
- ✅ Sending file chunks
- ✅ Receiving file chunks
- ✅ Multi-chunk file assembly
- ✅ Transfer progress tracking
- ✅ Transfer speed and ETA calculation
- ✅ Transfer cancellation
- ✅ Error handling
- ✅ Utility functions (formatBytes, formatSpeed, formatTime)

### Integration Tests

#### TCP Connection Tests (`tests/integration/tcp-connection.test.ts`)
- ✅ Server startup and listening
- ✅ Client-server connection establishment
- ✅ Bidirectional messaging
- ✅ Connection error scenarios
- ✅ Reconnection handling
- ✅ Disconnection handling
- ✅ Ping/pong auto-response
- ✅ Status updates
- ✅ Reactions
- ✅ Typing indicators
- ✅ Multiple message handling
- ✅ Error handling when disconnected

---

## Known Limitations

### Tests Not Automated

The following features require manual testing (see TEST_CHECKLIST.md):

1. **Voice Features**:
   - Text-to-Speech (TTS) playback
   - Speech-to-Text (STT/Vosk) recording and transcription

2. **User Interface**:
   - Window controls and resizing
   - Settings menu interaction
   - Visual layout and styling

3. **Network Scenarios**:
   - Network interruption and recovery (requires actual network control)
   - Port forwarding and DDNS scenarios

4. **File Dialog Interactions**:
   - File picker dialog
   - Save file dialog

5. **Electron-specific Features**:
   - IPC communication between main and renderer processes
   - Native window frame behavior

### Future Improvements

- Add Playwright tests for Electron UI automation
- Add screenshot comparison tests for UI consistency
- Add performance benchmarking tests
- Add stress tests for high-volume messaging
- Mock network conditions for testing resilience

---

## Continuous Integration

### GitHub Actions (Example)

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Manual Testing

For comprehensive manual testing, refer to:

- **[TEST_CHECKLIST.md](../TEST_CHECKLIST.md)**: Complete manual testing checklist covering all features

The manual test checklist includes:

1. Connection establishment scenarios
2. Message sending and receiving
3. Status updates
4. Reactions
5. Typing indicators
6. File transfers (all sizes and types)
7. Voice features (TTS and STT)
8. User interface tests
9. Performance tests
10. Error handling
11. Platform-specific tests

---

## Troubleshooting

### Common Test Issues

**Issue**: Tests hang indefinitely
```
Solution: Ensure all async operations are properly awaited or resolved.
Check that connections are closed in afterEach hooks.
```

**Issue**: Port already in use errors
```
Solution: Use different port numbers for each test suite.
Ensure cleanup in afterEach properly closes connections.
Add delays between tests if necessary.
```

**Issue**: File system errors in file transfer tests
```
Solution: Ensure test fixture directory exists.
Check write permissions.
Verify cleanup is removing test files properly.
```

**Issue**: Random test failures
```
Solution: Add proper wait conditions for async operations.
Increase timeouts for slow operations.
Ensure tests are properly isolated.
```

### Debug Logging

Enable verbose logging in tests:

```typescript
// In setup.ts, uncomment console methods to see logs
global.console = {
  ...console,
  log: console.log,  // Uncomment to see logs
  debug: console.debug,
};
```

---

## Contributing

When adding new features to the application:

1. Write tests first (TDD approach) or immediately after implementation
2. Ensure tests pass before committing
3. Maintain or improve code coverage
4. Update this documentation if adding new test categories
5. Add manual test steps to TEST_CHECKLIST.md for UI features

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright for Electron](https://playwright.dev/docs/api/class-electron)
- [TypeScript with Jest](https://kulshekhar.github.io/ts-jest/)

---

## Support

For questions or issues with the test suite:

1. Check this documentation
2. Review existing test files for examples
3. Consult the main README.md
4. Open an issue on the project repository

---

**Last Updated**: 2025-10-30
**Test Framework Version**: Jest 30.2.0
**Application Version**: 1.0.0
