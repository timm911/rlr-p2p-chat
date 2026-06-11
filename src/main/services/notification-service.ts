/**
 * Notification Service
 * Handles Windows native notifications using Electron's Notification API
 */

import { Notification, BrowserWindow } from 'electron'

export interface NotificationOptions {
  title: string
  body: string
  silent?: boolean
  icon?: string
}

class NotificationService {
  private window: BrowserWindow | null = null
  private enabled: boolean = true

  constructor() {
    // Load enabled state from storage if needed
  }

  public setWindow(window: BrowserWindow): void {
    this.window = window
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Show a Windows native notification
   * Only shows if window is not focused and notifications are enabled
   */
  public show(options: NotificationOptions): void {
    if (!this.enabled) {
      return
    }

    // Don't show notification if window is focused
    if (this.window && this.window.isFocused()) {
      return
    }

    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: options.silent || false,
        icon: options.icon
      })

      // When notification is clicked, focus the window
      notification.on('click', () => {
        if (this.window) {
          if (this.window.isMinimized()) {
            this.window.restore()
          }
          this.window.focus()
        }
      })

      notification.show()
    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }

  /**
   * Show a message notification
   */
  public showMessage(from: string, message: string): void {
    // Truncate long messages
    const truncatedMessage = message.length > 100 
      ? message.substring(0, 100) + '...' 
      : message

    this.show({
      title: `New message from ${from}`,
      body: truncatedMessage
    })
  }

  /**
   * Show a file transfer notification
   */
  public showFileTransfer(from: string, fileName: string): void {
    this.show({
      title: `File from ${from}`,
      body: `${from} wants to send you: ${fileName}`
    })
  }

  /**
   * Show a status change notification
   */
  public showStatusChange(from: string, status: string): void {
    this.show({
      title: `${from} changed status`,
      body: `Status: ${status}`,
      silent: true
    })
  }

  /**
   * Show a connection notification
   */
  public showConnection(message: string): void {
    this.show({
      title: 'Connection',
      body: message,
      silent: true
    })
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService()
  }
  return notificationServiceInstance
}

export default NotificationService

