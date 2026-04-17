import { useEffect, useRef, useState } from 'react'
import { wsUrlWithKey } from '../config'

export default function AgentSection({ visible, active, taskResults }) {
  const [screenshot, setScreenshot] = useState(null)
  const [log, setLog] = useState([])
  const [connected, setConnected] = useState(false)
  const [tasks, setTasks] = useState([])
  const wsRef = useRef(null)
  const logEndRef = useRef(null)

  // Sync external task results
  useEffect(() => {
    if (taskResults && taskResults.length > 0) {
      setTasks(taskResults)
    }
  }, [taskResults])

  useEffect(() => {
    if (!active) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(wsUrlWithKey("/ws/agent"))
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'screenshot') {
        setScreenshot(data.data)
      }

      if (data.type === 'action') {
        setLog(prev => [...prev, {
          type: 'action',
          text: `${data.action?.type} → ${data.llm_decision?.selector || 'unknown'}`,
        }])
      }

      if (data.type === 'action_result') {
        setLog(prev => [...prev, {
          type: data.success ? 'success' : 'failure',
          text: data.success ? 'Action succeeded' : `Failed: ${data.error || 'unknown'}`,
        }])
      }

      if (data.type === 'task_start') {
        setLog(prev => [...prev, {
          type: 'info',
          text: `Starting: ${data.task_name}`,
        }])
      }

      if (data.type === 'task_complete') {
        setLog(prev => [...prev, {
          type: data.completed ? 'success' : 'failure',
          text: `${data.task_id}: ${data.completed ? 'COMPLETED' : 'FAILED'} — ${data.reasoning || ''}`,
        }])
        // Update task list from WS events
        setTasks(prev => {
          const updated = [...prev]
          const idx = updated.findIndex(t => t.task_id === data.task_id)
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], completed: data.completed }
          } else {
            updated.push({
              task_id: data.task_id,
              task_name: data.task_name || data.task_id,
              completed: data.completed,
            })
          }
          return updated
        })
      }

      if (data.type === 'demo_phase') {
        setLog(prev => [...prev, {
          type: 'info',
          text: `=== ${data.phase === 'raw_agent' ? 'Agent on RAW site' : data.phase === 'optimized_agent' ? 'Agent on OPTIMIZED site' : data.phase} ===`,
        }])
      }

      if (data.type === 'agent_complete') {
        setLog(prev => [...prev, {
          type: 'info',
          text: `Agent finished: ${data.summary?.score}`,
        }])
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [active])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  if (!visible) return null

  return (
    <section className={`story-section ${visible ? 'section-visible' : ''}`}>
      <div className="section-label">AGENT IN ACTION</div>

      <div className="agent-layout">
        <div className="agent-main">
          <div className="agent-status-bar">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span>{connected ? 'Agent connected' : 'Waiting for agent...'}</span>
          </div>

          {screenshot ? (
            <img
              className="agent-screenshot-large"
              src={`data:image/png;base64,${screenshot}`}
              alt="Agent browser view"
            />
          ) : (
            <div className="agent-screenshot-placeholder">
              <div className="spinner" />
              <p>Agent browser will appear here</p>
            </div>
          )}
        </div>

        <div className="agent-sidebar">
          {tasks.length > 0 && (
            <div className="agent-tasks">
              <h3>Task Checklist</h3>
              {tasks.map((task, i) => (
                <div
                  key={task.task_id || i}
                  className={`task-item ${
                    task.completed === true ? 'completed' :
                    task.completed === false ? 'failed' : 'pending'
                  }`}
                >
                  <span className="task-icon">
                    {task.completed === true ? '✓' :
                     task.completed === false ? '✗' : '○'}
                  </span>
                  <span>{task.task_name || task.name || `Task ${i + 1}`}</span>
                </div>
              ))}
            </div>
          )}

          <div className="agent-log">
            <h3>Action Log</h3>
            <div className="agent-log-scroll">
              {log.map((entry, i) => (
                <div key={i} className={`agent-log-entry ${entry.type}`}>
                  <span className="icon">
                    {entry.type === 'success' ? '+' :
                     entry.type === 'failure' ? '✗' :
                     entry.type === 'action' ? '>' : '—'}
                  </span>
                  <span>{entry.text}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
