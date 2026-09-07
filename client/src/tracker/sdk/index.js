import React from 'react'

export const KissflowSDKContext = React.createContext({
  kf: null,
  sdkReady: false,
})

export const kf = {
  api: async () => null,
  user: null,
  client: {
    showInfo: (msg) => {
      if (msg) console.info(msg)
    },
  },
}

export function SDKWrapper({ children }) {
  return children
}
