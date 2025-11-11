import React from "react"
import ReactDOM from "react-dom/client"
import { I18nProvider } from "~/lib/i18n/context"
import ChatBot from "~/lib/components/chatbot"
import { RecordAndPlayback } from "~features/recordAndPlayback/interface"
// CSS is loaded directly in HTML for better HMR support
// import "~/tailwind.css"

const SidepanelApp = () => (
  <I18nProvider>
    <ChatBot />
    <RecordAndPlayback />
  </I18nProvider>
)

const root = document.getElementById("root")
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SidepanelApp />
    </React.StrictMode>
  )
} 