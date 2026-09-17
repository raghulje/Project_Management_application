/// <reference types="vite/client" />

interface Window {
  __pmNavigate?: (path: string, extra?: { from?: string }) => void
}

declare module '*.jsx' {
  import type { ComponentType } from 'react'
  const Component: ComponentType<any>
  export default Component
}

declare module '*.js' {
  const value: any
  export default value
}
