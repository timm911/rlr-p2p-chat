# How to Test RLR P2P Chat

Quick reference guide for testing the application.

## Quick Start

```bash
# Run all automated tests
npm test

# Run tests and generate coverage report
npm run test:coverage
```

## Automated Testing

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
# Then open: coverage/lcov-report/index.html
```

### Run Specific Test Suites
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration
```

### Development Mode
```bash
# Watch mode - auto-rerun on file changes
npm run test:watch
```

### Verbose Output
```bash
# See detailed test output
npm run test:verbose
```

### Run Specific Tests
```bash
# Run a single test file
npm test -- tests/unit/protocol.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="connection"

# Run tests for a specific describe block
npm test -- --testNamePattern="TCP Connection"
```

## Manual Testing

### Full Manual Test Suite
See `TEST_CHECKLIST.md` for comprehensive manual testing procedures covering:
- Connection establishment
- Messaging and reactions
- File transfers
- Voice features (TTS/STT)
- UI testing
- Performance testing
- Error scenarios

### Quick Smoke Test (5 minutes)
Located at the bottom of `TEST_CHECKLIST.md`:
1. Launch both instances (RLRJupiter and Ripster)
2. Establish connection
3. Send messages in both directions
4. Change status
5. Add a reaction
6. Send and accept small file
7. Test TTS (if enabled)
8. Disconnect and reconnect
9. Close both applications

## Test Documentation

- **TESTING_SUMMARY.md**: Overview of all testing done, frameworks used, results
- **tests/README.md**: Detailed documentation for developers
- **TEST_CHECKLIST.md**: Step-by-step manual testing procedures

## Test Results Interpretation

### Success
```
Test Suites: X passed, X total
Tests:       X passed, X total
```

### Failures
If tests fail, check:
1. Are all dependencies installed? (`npm install`)
2. Is the code compiled? (`npm run build`)
3. Are there port conflicts? (close other instances)
4. Network/timing issues? (try running again)

### Common Issues

**Port already in use**:
```bash
# Solution: Close any running instances or use different port in tests
```

**Timeout errors**:
```bash
# Solution: Increase timeout (already set to 10s in config)
```

**File system errors**:
```bash
# Solution: Check write permissions in tests/fixtures directory
```

## Before Committing Code

```bash
# 1. Run all tests
npm test

# 2. Check for errors
# If failures, fix issues and re-run

# 3. Optional: Check coverage
npm run test:coverage
```

## Before Releasing

1. Run automated tests: `npm test`
2. Complete manual test checklist: `TEST_CHECKLIST.md`
3. Document any issues found
4. Verify all critical paths work

## Continuous Integration (Future)

When CI is set up, tests will run automatically on:
- Every push to repository
- Every pull request
- Before deployment

## Need Help?

- Check `tests/README.md` for detailed testing guide
- Review `TESTING_SUMMARY.md` for test coverage info
- See `TEST_CHECKLIST.md` for manual test procedures

## Test Commands Reference

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Watch mode (re-run on changes) |
| `npm run test:coverage` | Run with coverage report |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only |
| `npm run test:verbose` | Detailed output |

---

**Quick Tip**: Run `npm test` frequently during development to catch issues early!
