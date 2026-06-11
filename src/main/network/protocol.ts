// Message protocol for P2P communication
import { createHash } from 'crypto'

export interface ProtocolMessage {
  type: 'chat' | 'chat-ack' | 'status' | 'reaction' | 'reaction-remove' | 'typing' | 'ping' | 'pong' | 'file-offer' | 'file-accept' | 'file-reject' | 'file-chunk' | 'file-complete' | 'file-cancel' | 'file-pause' | 'file-resume' | 'auth' | 'auth-success' | 'auth-failed' | 'hello'
  payload: any
  timestamp: number
}

export interface ChatMessage {
  id: string
  from: string
  content: string
  timestamp: number
  hasLink?: boolean
  linkPreview?: {
    url: string
    title: string
    description?: string
  }
}

export interface StatusUpdate {
  status: string
  timestamp: number
}

export interface ReactionUpdate {
  messageId: string
  emoji: string
  timestamp: number
}

export interface TypingIndicator {
  isTyping: boolean
  timestamp: number
}

export interface ChatAck {
  messageId: string
  timestamp: number
}

export interface AuthRequest {
  passwordHash: string
  timestamp: number
}

export interface FileOffer {
  transferId: string
  fileName: string
  fileSize: number
  fileType: string
  chunkSize: number
  totalChunks: number
  timestamp: number
}

export interface FileResponse {
  transferId: string
  accepted: boolean
  timestamp: number
}

export interface FileChunk {
  transferId: string
  chunkIndex: number
  totalChunks: number
  data: string // Base64 encoded chunk data
  timestamp: number
}

export interface FileComplete {
  transferId: string
  success: boolean
  timestamp: number
}

export interface FileCancel {
  transferId: string
  reason: string
  timestamp: number
}

export function encodeMessage(msg: ProtocolMessage): string {
  return JSON.stringify(msg) + '\n'
}

export function decodeMessage(data: string): ProtocolMessage | null {
  try {
    return JSON.parse(data.trim())
  } catch (err) {
    console.error('Failed to decode message:', err)
    return null
  }
}

/**
 * Hash password using SHA-256
 * Uses a fixed salt to ensure both peers generate the same hash
 */
export function hashPassword(password: string): string {
  const salt = 'rlrchat-2025' // Fixed salt so both peers generate same hash
  const hash = createHash('sha256')
  hash.update(salt + password)
  return hash.digest('hex')
}
