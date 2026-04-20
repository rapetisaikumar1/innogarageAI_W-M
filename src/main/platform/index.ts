import type { PlatformBehavior } from './types'
import win32 from './win32'
import darwin from './darwin'

export const platform: PlatformBehavior = process.platform === 'win32' ? win32 : darwin
export type { PlatformBehavior }
