import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { BroadcastView } from './components/BroadcastView'
import { getBroadcastConfig } from './app/broadcastConfig'
import { installExportBridge } from './app/exportBridge'

const broadcastConfig = getBroadcastConfig();
installExportBridge(broadcastConfig.exportMode);

// Broadcast / MP4-export mode bypasses the normal App tree entirely.
// The capture pipeline only needs the BroadcastView + tournament store
// + commentary queue — none of the tabs, ApiKey input, TechDiff
// overlay, or fullscreen handling apply. Routing here (vs. inside
// App.tsx) keeps App's hook order stable for the normal SPA case.
const Root = broadcastConfig.exportMode ? BroadcastView : App;

// StrictMode is wrapped only for the normal SPA. In broadcast mode it
// double-mounts CommentaryPanel, which throws away the AudioNarrationQueue
// instance our MediaRecorder is attached to and silently produces an
// empty audio track in the final MP4.
createRoot(document.getElementById('root')!).render(
  broadcastConfig.exportMode ? <Root /> : <StrictMode><Root /></StrictMode>,
)
