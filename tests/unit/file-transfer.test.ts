import * as fs from 'fs';
import * as path from 'path';
import { FileTransferManager, FileTransferState } from '../../src/main/network/file-transfer-manager';
import { FileOffer, FileChunk } from '../../src/main/network/protocol';

describe('File Transfer Manager', () => {
  let manager: FileTransferManager;
  const testDir = path.join(__dirname, '../fixtures/file-transfer');
  const testFile = path.join(testDir, 'test-file.txt');
  const receivedFile = path.join(testDir, 'received-file.txt');

  beforeAll(async () => {
    // Create test directory and file
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.writeFile(testFile, 'This is a test file for file transfer tests.\n'.repeat(100));
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    manager = new FileTransferManager();
  });

  afterEach(async () => {
    // Clean up any transfers
    await manager.cleanup(0);
  });

  describe('Creating Send Transfer', () => {
    it('should create a file offer for sending', async () => {
      const offer = await manager.createSendTransfer(testFile);

      expect(offer.transferId).toBeDefined();
      expect(offer.fileName).toBe('test-file.txt');
      expect(offer.fileSize).toBeGreaterThan(0);
      expect(offer.fileType).toBe('.txt');
      expect(offer.chunkSize).toBe(32 * 1024);
      expect(offer.totalChunks).toBeGreaterThan(0);
    });

    it('should emit transfer-created event', async () => {
      const eventPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-created', (state) => {
          resolve(state);
        });
      });

      const offer = await manager.createSendTransfer(testFile);
      const state = await eventPromise;

      expect(state.transferId).toBe(offer.transferId);
      expect(state.direction).toBe('send');
      expect(state.status).toBe('pending');
      expect(state.chunksTransferred).toBe(0);
    });

    it('should calculate total chunks correctly', async () => {
      const stats = await fs.promises.stat(testFile);
      const expectedChunks = Math.ceil(stats.size / (32 * 1024));

      const offer = await manager.createSendTransfer(testFile);

      expect(offer.totalChunks).toBe(expectedChunks);
    });

    it('should reject non-existent file', async () => {
      await expect(manager.createSendTransfer('/non/existent/file.txt'))
        .rejects
        .toThrow();
    });
  });

  describe('Accepting File Transfer', () => {
    it('should accept an incoming file transfer', async () => {
      const offer: FileOffer = {
        transferId: 'test-transfer-123',
        fileName: 'received-test.txt',
        fileSize: 1024,
        fileType: '.txt',
        chunkSize: 32 * 1024,
        totalChunks: 1,
        timestamp: Date.now()
      };

      const eventPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-accepted', (state) => {
          resolve(state);
        });
      });

      await manager.acceptFileTransfer(offer, receivedFile);
      const state = await eventPromise;

      expect(state.transferId).toBe(offer.transferId);
      expect(state.direction).toBe('receive');
      expect(state.status).toBe('active');
      expect(state.fileName).toBe('received-test.txt');
      expect(state.filePath).toBe(receivedFile);
    });
  });

  describe('Sending File Chunks', () => {
    it('should get next chunk for sending', async () => {
      const offer = await manager.createSendTransfer(testFile);
      const chunk = await manager.getNextChunk(offer.transferId);

      expect(chunk).not.toBeNull();
      expect(chunk?.transferId).toBe(offer.transferId);
      expect(chunk?.chunkIndex).toBe(0);
      expect(chunk?.data).toBeDefined();
      expect(chunk?.data.length).toBeGreaterThan(0);
    });

    it('should increment chunks transferred', async () => {
      const offer = await manager.createSendTransfer(testFile);

      await manager.getNextChunk(offer.transferId);
      const state = manager.getTransferState(offer.transferId);

      expect(state?.chunksTransferred).toBe(1);
      expect(state?.status).toBe('active');
    });

    it('should emit transfer-progress event', async () => {
      const offer = await manager.createSendTransfer(testFile);

      const progressPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-progress', (state) => {
          resolve(state);
        });
      });

      await manager.getNextChunk(offer.transferId);
      const state = await progressPromise;

      expect(state.chunksTransferred).toBe(1);
      expect(state.bytesTransferred).toBeGreaterThan(0);
    });

    it('should return null when all chunks sent', async () => {
      const offer = await manager.createSendTransfer(testFile);

      // Send all chunks
      for (let i = 0; i < offer.totalChunks; i++) {
        await manager.getNextChunk(offer.transferId);
      }

      // Next chunk should be null
      const nextChunk = await manager.getNextChunk(offer.transferId);
      expect(nextChunk).toBeNull();
    });

    it('should encode chunk data in base64', async () => {
      const offer = await manager.createSendTransfer(testFile);
      const chunk = await manager.getNextChunk(offer.transferId);

      expect(chunk?.data).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe('Receiving File Chunks', () => {
    it('should process received chunk', async () => {
      const offer: FileOffer = {
        transferId: 'test-receive-123',
        fileName: 'received.txt',
        fileSize: 100,
        fileType: '.txt',
        chunkSize: 32 * 1024,
        totalChunks: 1,
        timestamp: Date.now()
      };

      await manager.acceptFileTransfer(offer, receivedFile);

      const chunk: FileChunk = {
        transferId: 'test-receive-123',
        chunkIndex: 0,
        totalChunks: 1,
        data: Buffer.from('Test content').toString('base64'),
        timestamp: Date.now()
      };

      const progressPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-progress', (state) => {
          resolve(state);
        });
      });

      await manager.processChunk(chunk);
      const state = await progressPromise;

      expect(state.chunksTransferred).toBe(1);
    });

    it('should complete transfer when all chunks received', async () => {
      const testContent = 'Complete file transfer test';
      const offer: FileOffer = {
        transferId: 'test-complete-123',
        fileName: 'complete.txt',
        fileSize: testContent.length,
        fileType: '.txt',
        chunkSize: 32 * 1024,
        totalChunks: 1,
        timestamp: Date.now()
      };

      await manager.acceptFileTransfer(offer, receivedFile);

      const completePromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-completed', (state) => {
          resolve(state);
        });
      });

      const chunk: FileChunk = {
        transferId: 'test-complete-123',
        chunkIndex: 0,
        totalChunks: 1,
        data: Buffer.from(testContent).toString('base64'),
        timestamp: Date.now()
      };

      await manager.processChunk(chunk);
      const state = await completePromise;

      expect(state.status).toBe('completed');

      // Verify file was written
      const fileContent = await fs.promises.readFile(receivedFile, 'utf8');
      expect(fileContent).toBe(testContent);
    });

    it('should handle multiple chunks in order', async () => {
      const chunks = ['First chunk ', 'Second chunk ', 'Third chunk'];
      const totalSize = chunks.join('').length;

      const offer: FileOffer = {
        transferId: 'test-multi-123',
        fileName: 'multi-chunk.txt',
        fileSize: totalSize,
        fileType: '.txt',
        chunkSize: 32 * 1024,
        totalChunks: chunks.length,
        timestamp: Date.now()
      };

      await manager.acceptFileTransfer(offer, receivedFile);

      const completePromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-completed', (state) => {
          resolve(state);
        });
      });

      // Send chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk: FileChunk = {
          transferId: 'test-multi-123',
          chunkIndex: i,
          totalChunks: chunks.length,
          data: Buffer.from(chunks[i]).toString('base64'),
          timestamp: Date.now()
        };
        await manager.processChunk(chunk);
      }

      await completePromise;

      // Verify file was assembled correctly
      const fileContent = await fs.promises.readFile(receivedFile, 'utf8');
      expect(fileContent).toBe(chunks.join(''));
    });
  });

  describe('Transfer State Management', () => {
    it('should get transfer state', async () => {
      const offer = await manager.createSendTransfer(testFile);
      const state = manager.getTransferState(offer.transferId);

      expect(state).toBeDefined();
      expect(state?.transferId).toBe(offer.transferId);
      expect(state?.fileName).toBe('test-file.txt');
    });

    it('should return undefined for non-existent transfer', () => {
      const state = manager.getTransferState('non-existent-id');
      expect(state).toBeUndefined();
    });

    it('should get active transfers', async () => {
      const offer1 = await manager.createSendTransfer(testFile);
      const offer2 = await manager.createSendTransfer(testFile);

      const activeTransfers = manager.getActiveTransfers();

      expect(activeTransfers.length).toBe(2);
      expect(activeTransfers.some(t => t.transferId === offer1.transferId)).toBe(true);
      expect(activeTransfers.some(t => t.transferId === offer2.transferId)).toBe(true);
    });
  });

  describe('Transfer Cancellation', () => {
    it('should cancel a transfer', async () => {
      const offer = await manager.createSendTransfer(testFile);

      const cancelPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-cancelled', (state) => {
          resolve(state);
        });
      });

      await manager.cancelTransfer(offer.transferId);
      const state = await cancelPromise;

      expect(state.status).toBe('cancelled');
      expect(state.transferId).toBe(offer.transferId);
    });
  });

  describe('Transfer Metrics', () => {
    it('should calculate transfer speed', async () => {
      const offer = await manager.createSendTransfer(testFile);

      await manager.getNextChunk(offer.transferId);

      // Wait a bit for time to pass
      await new Promise(resolve => setTimeout(resolve, 10));

      const speed = manager.getTransferSpeed(offer.transferId);
      expect(speed).toBeGreaterThan(0);
    });

    it('should calculate ETA', async () => {
      const offer = await manager.createSendTransfer(testFile);

      await manager.getNextChunk(offer.transferId);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const eta = manager.getETA(offer.transferId);
      expect(eta).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 speed for transfer with no bytes', async () => {
      const offer = await manager.createSendTransfer(testFile);
      const speed = manager.getTransferSpeed(offer.transferId);
      expect(speed).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('should format bytes correctly', () => {
      expect(FileTransferManager.formatBytes(0)).toBe('0 Bytes');
      expect(FileTransferManager.formatBytes(1024)).toBe('1 KB');
      expect(FileTransferManager.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(FileTransferManager.formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format speed correctly', () => {
      const speed = FileTransferManager.formatSpeed(1024 * 1024);
      expect(speed).toContain('MB/s');
    });

    it('should format time correctly', () => {
      expect(FileTransferManager.formatTime(30)).toBe('30s');
      expect(FileTransferManager.formatTime(90)).toBe('1m 30s');
      expect(FileTransferManager.formatTime(3660)).toBe('1h 1m');
    });
  });

  describe('Error Handling', () => {
    it('should emit transfer-failed on chunk processing error', async () => {
      const offer: FileOffer = {
        transferId: 'test-error-123',
        fileName: 'error.txt',
        fileSize: 100,
        fileType: '.txt',
        chunkSize: 32 * 1024,
        totalChunks: 1,
        timestamp: Date.now()
      };

      // Don't accept the transfer to cause an error
      const failPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-failed', (state) => {
          resolve(state);
        });
      });

      const chunk: FileChunk = {
        transferId: 'test-error-123',
        chunkIndex: 0,
        totalChunks: 1,
        data: 'invalid',
        timestamp: Date.now()
      };

      await expect(manager.processChunk(chunk)).rejects.toThrow();
    });

    it('should mark transfer as failed', async () => {
      const offer = await manager.createSendTransfer(testFile);

      const failPromise = new Promise<FileTransferState>((resolve) => {
        manager.once('transfer-failed', (state) => {
          resolve(state);
        });
      });

      await manager.failTransfer(offer.transferId, 'Test error');
      const state = await failPromise;

      expect(state.status).toBe('failed');
      expect(state.error).toBe('Test error');
    });
  });
});
