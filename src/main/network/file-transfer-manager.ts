import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import { FileOffer, FileChunk } from './protocol'

const CHUNK_SIZE = 32 * 1024 // 32KB chunks

export interface FileTransferState {
  transferId: string
  fileName: string
  filePath: string
  fileSize: number
  fileType: string
  direction: 'send' | 'receive'
  chunksTransferred: number
  totalChunks: number
  bytesTransferred: number
  startTime: number
  lastChunkTime: number
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
  error?: string
  receivedChunks?: Map<number, Buffer>
  paused?: boolean
}

export class FileTransferManager extends EventEmitter {
  private transfers: Map<string, FileTransferState> = new Map()
  private fileHandles: Map<string, fs.promises.FileHandle> = new Map()

  constructor() {
    super()
  }

  // Create a new file transfer for sending
  async createSendTransfer(filePath: string): Promise<FileOffer> {
    const transferId = this.generateTransferId()
    const stats = await fs.promises.stat(filePath)
    const fileName = path.basename(filePath)
    const fileSize = stats.size
    const fileType = path.extname(fileName).toLowerCase()
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)

    const state: FileTransferState = {
      transferId,
      fileName,
      filePath,
      fileSize,
      fileType,
      direction: 'send',
      chunksTransferred: 0,
      totalChunks,
      bytesTransferred: 0,
      startTime: Date.now(),
      lastChunkTime: Date.now(),
      status: 'pending'
    }

    this.transfers.set(transferId, state)

    this.emit('transfer-created', state)

    return {
      transferId,
      fileName,
      fileSize,
      fileType,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      timestamp: Date.now()
    }
  }

  // Accept an incoming file transfer
  async acceptFileTransfer(offer: FileOffer, savePath: string): Promise<void> {
    const state: FileTransferState = {
      transferId: offer.transferId,
      fileName: offer.fileName,
      filePath: savePath,
      fileSize: offer.fileSize,
      fileType: offer.fileType,
      direction: 'receive',
      chunksTransferred: 0,
      totalChunks: offer.totalChunks,
      bytesTransferred: 0,
      startTime: Date.now(),
      lastChunkTime: Date.now(),
      status: 'active',
      receivedChunks: new Map()
    }

    this.transfers.set(offer.transferId, state)
    this.emit('transfer-accepted', state)
  }

  // Read and send next chunk
  async getNextChunk(transferId: string): Promise<FileChunk | null> {
    const state = this.transfers.get(transferId)
    if (!state || state.direction !== 'send') {
      return null
    }

    if (state.paused || state.chunksTransferred >= state.totalChunks) {
      return null
    }

    try {
      // Open file handle if not already open
      if (!this.fileHandles.has(transferId)) {
        const handle = await fs.promises.open(state.filePath, 'r')
        this.fileHandles.set(transferId, handle)
      }

      const handle = this.fileHandles.get(transferId)!
      const buffer = Buffer.allocUnsafe(CHUNK_SIZE)
      const offset = state.chunksTransferred * CHUNK_SIZE

      const { bytesRead } = await handle.read(buffer, 0, CHUNK_SIZE, offset)

      const chunkData = buffer.slice(0, bytesRead).toString('base64')

      state.chunksTransferred++
      state.bytesTransferred += bytesRead
      state.lastChunkTime = Date.now()
      state.status = 'active'

      this.emit('transfer-progress', state)

      return {
        transferId,
        chunkIndex: state.chunksTransferred - 1,
        totalChunks: state.totalChunks,
        data: chunkData,
        timestamp: Date.now()
      }
    } catch (error: any) {
      state.status = 'failed'
      state.error = error.message
      this.emit('transfer-failed', state)
      await this.closeFileHandle(transferId)
      return null
    }
  }

  // Pause a transfer (sender stops sending chunks until resume)
  pauseTransfer(transferId: string): void {
    const state = this.transfers.get(transferId)
    if (!state || (state.status !== 'active' && state.status !== 'pending')) return
    state.paused = true
    this.emit('transfer-paused', state)
  }

  // Resume a transfer
  resumeTransfer(transferId: string): void {
    const state = this.transfers.get(transferId)
    if (!state) return
    state.paused = false
    this.emit('transfer-resumed', state)
  }

  // Process received chunk
  async processChunk(chunk: FileChunk): Promise<void> {
    const state = this.transfers.get(chunk.transferId)
    if (!state || state.direction !== 'receive') {
      throw new Error('Invalid transfer state')
    }
    if (state.paused) return // ignore chunks while paused (sender should not send when we're paused; if they do, we drop)

    try {
      const chunkBuffer = Buffer.from(chunk.data, 'base64')
      state.receivedChunks!.set(chunk.chunkIndex, chunkBuffer)

      state.chunksTransferred++
      state.bytesTransferred += chunkBuffer.length
      state.lastChunkTime = Date.now()

      this.emit('transfer-progress', state)

      // Check if all chunks received
      if (state.chunksTransferred >= state.totalChunks) {
        await this.assembleFile(state)
      }
    } catch (error: any) {
      state.status = 'failed'
      state.error = error.message
      this.emit('transfer-failed', state)
      throw error
    }
  }

  // Assemble complete file from chunks
  private async assembleFile(state: FileTransferState): Promise<void> {
    try {
      const chunks: Buffer[] = []

      // Sort chunks by index and concatenate
      for (let i = 0; i < state.totalChunks; i++) {
        const chunk = state.receivedChunks!.get(i)
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`)
        }
        chunks.push(chunk)
      }

      const completeFile = Buffer.concat(chunks)

      // Ensure directory exists
      const dir = path.dirname(state.filePath)
      await fs.promises.mkdir(dir, { recursive: true })

      // Write file
      await fs.promises.writeFile(state.filePath, completeFile)

      state.status = 'completed'
      state.receivedChunks!.clear()

      this.emit('transfer-completed', state)
    } catch (error: any) {
      state.status = 'failed'
      state.error = error.message
      this.emit('transfer-failed', state)
      throw error
    }
  }

  // Complete a send transfer
  async completeSendTransfer(transferId: string): Promise<void> {
    const state = this.transfers.get(transferId)
    if (!state) return

    state.status = 'completed'
    await this.closeFileHandle(transferId)
    this.emit('transfer-completed', state)
  }

  // Cancel a transfer
  async cancelTransfer(transferId: string): Promise<void> {
    const state = this.transfers.get(transferId)
    if (!state) return

    state.status = 'cancelled'
    await this.closeFileHandle(transferId)

    if (state.direction === 'receive' && state.receivedChunks) {
      state.receivedChunks.clear()
    }

    this.emit('transfer-cancelled', state)
  }

  // Mark transfer as failed
  async failTransfer(transferId: string, error: string): Promise<void> {
    const state = this.transfers.get(transferId)
    if (!state) return

    state.status = 'failed'
    state.error = error
    await this.closeFileHandle(transferId)
    this.emit('transfer-failed', state)
  }

  // Get transfer state
  getTransferState(transferId: string): FileTransferState | undefined {
    return this.transfers.get(transferId)
  }

  // Get all active transfers
  getActiveTransfers(): FileTransferState[] {
    return Array.from(this.transfers.values()).filter(
      t => t.status === 'active' || t.status === 'pending'
    )
  }

  // Calculate transfer speed (bytes per second)
  getTransferSpeed(transferId: string): number {
    const state = this.transfers.get(transferId)
    if (!state || state.bytesTransferred === 0) return 0

    const elapsedMs = Date.now() - state.startTime
    const elapsedSeconds = elapsedMs / 1000
    return state.bytesTransferred / elapsedSeconds
  }

  // Calculate ETA (estimated time of arrival) in seconds
  getETA(transferId: string): number {
    const state = this.transfers.get(transferId)
    if (!state) return 0

    const speed = this.getTransferSpeed(transferId)
    if (speed === 0) return 0

    const remainingBytes = state.fileSize - state.bytesTransferred
    return remainingBytes / speed
  }

  // Clean up old transfers
  async cleanup(olderThanMs: number = 3600000): Promise<void> {
    const now = Date.now()
    const toDelete: string[] = []

    for (const [transferId, state] of this.transfers.entries()) {
      if (
        (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') &&
        (now - state.lastChunkTime) > olderThanMs
      ) {
        toDelete.push(transferId)
      }
    }

    for (const transferId of toDelete) {
      await this.closeFileHandle(transferId)
      this.transfers.delete(transferId)
    }
  }

  // Close file handle
  private async closeFileHandle(transferId: string): Promise<void> {
    const handle = this.fileHandles.get(transferId)
    if (handle !== undefined) {
      try {
        await handle.close()
      } catch (error) {
        console.error('Error closing file handle:', error)
      }
      this.fileHandles.delete(transferId)
    }
  }

  // Generate unique transfer ID
  private generateTransferId(): string {
    return `transfer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  // Format bytes for display
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Format speed for display
  static formatSpeed(bytesPerSecond: number): string {
    return this.formatBytes(bytesPerSecond) + '/s'
  }

  // Format time for display
  static formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const secs = Math.round(seconds % 60)
      return `${minutes}m ${secs}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }
}
