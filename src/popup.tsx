import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type { PlaybackStatus, RecordingState } from './lib/recording/types'
import { MAX_EVENTS } from './lib/recording/utils'

const SPEED_OPTIONS = [1, 2, 4]

type Feedback = {
  type: 'success' | 'error'
  message: string
} | null

type MessagePayload = Record<string, any>

function sendRuntimeMessage<T = any>(payload: MessagePayload): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve(response as T)
    })
  })
}

const initialPlaybackStatus: PlaybackStatus = {
  active: false,
  paused: false,
  speed: 1,
  index: 0,
  total: 0,
}

const initialRecordingState: RecordingState = {
  active: false,
}

const formatPlaybackProgress = (status: PlaybackStatus) => {
  if (status.total === 0) {
    return 'No events'
  }
  return `${Math.min(status.index + (status.active && !status.paused ? 1 : 0), status.total)} / ${status.total}`
}

const PopupApp = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>(initialRecordingState)
  const [eventCount, setEventCount] = useState(0)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>(initialPlaybackStatus)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isLoading, setIsLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [speed, setSpeed] = useState(1)

  const isRecording = recordingState.active
  const isPlaying = playbackStatus.active && !playbackStatus.paused
  const canPlayback = eventCount > 0

  useEffect(() => {
    sendRuntimeMessage<{ state: RecordingState; eventCount: number; playback: PlaybackStatus }>({ request: 'recording:get-state' })
      .then(({ state, eventCount: count, playback }) => {
        setRecordingState(state ?? initialRecordingState)
        setEventCount(count ?? 0)
        setPlaybackStatus(playback ?? initialPlaybackStatus)
        if (playback?.speed) {
          setSpeed(playback.speed)
        }
      })
      .catch((error) => {
        console.error('Failed to load recorder state', error)
        setFeedback({ type: 'error', message: '无法加载录制状态，请稍后重试。' })
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    const listener = (message: any) => {
      if (message.request === 'recording:state') {
        setRecordingState(message.state)
      }
      if (message.request === 'recording:events-updated') {
        setEventCount(message.count ?? 0)
      }
      if (message.request === 'playback:status') {
        setPlaybackStatus(message.status ?? initialPlaybackStatus)
        if (message.status?.speed) {
          setSpeed(message.status.speed)
        }
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 4000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const toggleRecording = useCallback(async () => {
    try {
      if (isRecording) {
        await sendRuntimeMessage({ request: 'recording:stop' })
        setFeedback({ type: 'success', message: '已停止录制。' })
      } else {
        await sendRuntimeMessage({ request: 'recording:start' })
        setFeedback({ type: 'success', message: '开始录制当前浏览器操作。' })
      }
    } catch (error) {
      console.error('Failed to toggle recording', error)
      setFeedback({ type: 'error', message: '切换录制状态失败。' })
    }
  }, [isRecording])

  const clearEvents = useCallback(async () => {
    if (!window.confirm('确认要清除所有录制记录吗？该操作无法恢复。')) {
      return
    }
    try {
      await sendRuntimeMessage({ request: 'recording:clear' })
      setFeedback({ type: 'success', message: '已清除所有录制数据。' })
    } catch (error) {
      console.error('Failed to clear events', error)
      setFeedback({ type: 'error', message: '清除录制数据失败。' })
    }
  }, [])

  const exportEvents = useCallback(async () => {
    try {
      const { events } = await sendRuntimeMessage<{ events: any[] }>({ request: 'recording:export' })
      const blob = new Blob([JSON.stringify(events ?? [], null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `aipex-recording-${Date.now()}.json`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      setFeedback({ type: 'success', message: '录制数据已导出。' })
    } catch (error) {
      console.error('Failed to export events', error)
      setFeedback({ type: 'error', message: '导出录制数据失败。' })
    }
  }, [])

  const triggerImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const text = reader.result?.toString() || '[]'
        const parsed = JSON.parse(text)
        const response = await sendRuntimeMessage<{ success: boolean; count?: number; error?: string }>({
          request: 'recording:import',
          events: parsed,
        })
        if (response?.success) {
          setFeedback({ type: 'success', message: `导入成功，共 ${response.count ?? 0} 条事件。` })
        } else {
          throw new Error(response?.error || '导入失败')
        }
      } catch (error) {
        console.error('Failed to import recording', error)
        setFeedback({ type: 'error', message: '导入数据失败，请确认文件格式。' })
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    }

    reader.readAsText(file)
  }, [])

  const startPlayback = useCallback(async () => {
    if (!canPlayback) return
    try {
      const result = await sendRuntimeMessage<{ success: boolean; message?: string }>({
        request: 'playback:start',
        speed,
      })
      if (!result?.success) {
        throw new Error(result?.message || '无法开始回放')
      }
      setFeedback({ type: 'success', message: '开始回放录制的行为。' })
    } catch (error) {
      console.error('Failed to start playback', error)
      setFeedback({ type: 'error', message: '启动回放失败。' })
    }
  }, [canPlayback, speed])

  const pausePlayback = useCallback(async () => {
    try {
      await sendRuntimeMessage({ request: 'playback:pause' })
    } catch (error) {
      console.error('Failed to pause playback', error)
      setFeedback({ type: 'error', message: '暂停回放失败。' })
    }
  }, [])

  const resumePlayback = useCallback(async () => {
    try {
      await sendRuntimeMessage({ request: 'playback:resume' })
    } catch (error) {
      console.error('Failed to resume playback', error)
      setFeedback({ type: 'error', message: '继续回放失败。' })
    }
  }, [])

  const stopPlaybackAction = useCallback(async () => {
    try {
      await sendRuntimeMessage({ request: 'playback:stop' })
    } catch (error) {
      console.error('Failed to stop playback', error)
      setFeedback({ type: 'error', message: '停止回放失败。' })
    }
  }, [])

  const stepPlaybackAction = useCallback(async () => {
    try {
      await sendRuntimeMessage({ request: 'playback:step' })
    } catch (error) {
      console.error('Failed to step playback', error)
      setFeedback({ type: 'error', message: '步进执行失败。' })
    }
  }, [])

  const onSpeedChange = useCallback(async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSpeed = Number(event.target.value) || 1
    setSpeed(nextSpeed)
    try {
      await sendRuntimeMessage({ request: 'playback:update-speed', speed: nextSpeed })
    } catch (error) {
      console.error('Failed to update playback speed', error)
      setFeedback({ type: 'error', message: '调整回放速度失败。' })
    }
  }, [])

  const statusDescription = useMemo(() => {
    if (isRecording) {
      return '正在录制当前标签页的交互行为。'
    }
    return '点击下方按钮开始录制，或使用回放功能复现操作路径。'
  }, [isRecording])

  return (
    <div className="w-[360px] max-w-[360px] p-4 space-y-4 text-sm">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">录制状态</p>
            <p className="text-base font-semibold text-slate-50">{isRecording ? 'Recording' : 'Idle'}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${isRecording ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-slate-200'}`}>
            {isRecording ? 'REC' : 'STOP'}
          </span>
        </div>
        <p className="mt-2 text-slate-400">{statusDescription}</p>
        <p className="mt-2 text-xs text-slate-500">记录事件：{eventCount}</p>
        <button
          onClick={toggleRecording}
          className={`mt-3 w-full rounded-md px-3 py-2 text-sm font-medium transition ${isRecording ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'}`}
          disabled={isLoading}
        >
          {isRecording ? '停止录制' : '开始录制'}
        </button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">数据管理</h2>
          <span className="text-xs text-slate-500">最多 {MAX_EVENTS} 条</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={exportEvents}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:border-slate-500"
            disabled={eventCount === 0}
          >
            导出 JSON
          </button>
          <button
            onClick={triggerImport}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:border-slate-500"
          >
            导入 JSON
          </button>
          <button
            onClick={clearEvents}
            className="col-span-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20"
            disabled={eventCount === 0}
          >
            清除所有数据
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">回放控制</h2>
          <span className="text-xs text-slate-500">进度：{formatPlaybackProgress(playbackStatus)}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">速度</label>
          <select
            className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
            value={speed}
            onChange={onSpeedChange}
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}x</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={startPlayback}
            className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/40"
            disabled={!canPlayback || isPlaying}
          >
            开始回放
          </button>
          {isPlaying ? (
            <button
              onClick={pausePlayback}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:border-slate-500"
            >
              暂停
            </button>
          ) : (
            <button
              onClick={resumePlayback}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:border-slate-500"
              disabled={!playbackStatus.active}
            >
              继续
            </button>
          )}
          <button
            onClick={stepPlaybackAction}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!playbackStatus.active}
          >
            单步执行
          </button>
          <button
            onClick={stopPlaybackAction}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!playbackStatus.active}
          >
            停止回放
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-md px-3 py-2 text-xs ${feedback.type === 'error' ? 'bg-red-500/15 text-red-200 border border-red-500/30' : 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'}`}>
          {feedback.message}
        </div>
      )}
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>,
  )
}

