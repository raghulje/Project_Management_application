import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './tracker/index.css'
import './styles/shell.css'
import './styles/workspace.css'
import 'aos/dist/aos.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
