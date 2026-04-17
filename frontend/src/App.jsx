import { useState, useCallback, useRef } from 'react'
import { API_BASE, WS_BASE, authHeaders, wsUrlWithKey } from './config'
import HeroHeader from './components/HeroHeader'
import ProblemSection from './components/ProblemSection'
import ProcessTimeline from './components/ProcessTimeline'
import ComparisonSection from './components/ComparisonSection'
import AgentSection from './components/AgentSection'
import ScoreReveal from './components/ScoreReveal'

/**
 * Phase state machine:
 * idle → extracting → optimizing → generation_complete → [agent_running_raw → agent_running_optimized →] complete
 *
 * For "general" sites (no booking objective), agent phases are skipped.
 */

// Known booking site types that get the full agent flow
const AGENT_SITE_TYPES = new Set(['united', 'airbnb'])

function App() {
  const [phase, setPhase] = useState('idle')
  const [mode, setMode] = useState('full') // 'full' or 'optimize-only'
  const wsRef = useRef(null)

  // Data state
  const [rawUrl, setRawUrl] = useState(null)
  const [rawScreenshot, setRawScreenshot] = useState(null)
  const [optimizedUrl, setOptimizedUrl] = useState(null)
  const [loopLog, setLoopLog] = useState(null)
  const [rawAgentScore, setRawAgentScore] = useState(null)
  const [optimizedAgentScore, setOptimizedAgentScore] = useState(null)
  const [taskResults, setTaskResults] = useState(null)
  const [totalTasks, setTotalTasks] = useState(5)
  const [tokenReduction, setTokenReduction] = useState(null)
  const [iterationsUsed, setIterationsUsed] = useState(null)
  const [stats, setStats] = useState(null)

  const loading = phase !== 'idle' && phase !== 'complete'

  // Section visibility
  const showProblem = phase !== 'idle'
  const showTimeline = ['optimizing', 'generation_complete', 'agent_running_raw', 'agent_running_optimized', 'complete'].includes(phase) && loopLog?.length > 0
  const showComparison = ['generation_complete', 'agent_running_raw', 'agent_running_optimized', 'complete'].includes(phase)
  const showAgent = mode === 'full' && ['agent_running_raw', 'agent_running_optimized', 'complete'].includes(phase)
  const showScore = phase === 'complete'

  const resetState = useCallback(() => {
    setPhase('idle')
    setMode('full')
    setRawUrl(null)
    setRawScreenshot(null)
    setOptimizedUrl(null)
    setLoopLog(null)
    setRawAgentScore(null)
    setOptimizedAgentScore(null)
    setTaskResults(null)
    setTotalTasks(5)
    setTokenReduction(null)
    setIterationsUsed(null)
    setStats(null)
  }, [])

  const fetchScreenshot = useCallback(async (url) => {
    try {
      const res = await fetch(`${API_BASE}/api/screenshot`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (res.ok && data.screenshot) {
        setRawScreenshot(data.screenshot)
      }
    } catch (err) {
      console.warn('Screenshot capture failed:', err)
    }
  }, [])

  // Connect WebSocket for real-time phase updates
  const connectDemoWs = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(wsUrlWithKey("/ws/agent"))
    wsRef.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'demo_phase') {
        if (['extracting', 'optimizing', 'generation_complete', 'agent_running_raw', 'agent_running_optimized', 'complete'].includes(data.phase)) {
          setPhase(data.phase)
        }
        if (data.proxy_url) {
          setRawUrl(data.proxy_url)
          fetchScreenshot(data.proxy_url)
        }
        if (data.generated_url) setOptimizedUrl(data.generated_url)
        if (data.phase === 'loop_entry' && data.loop_entry) {
          setLoopLog(prev => [...(prev || []), data.loop_entry])
        }
      }
    }

    return ws
  }, [fetchScreenshot])

  const handleIngest = useCallback(async (url, siteType, tripDetails = {}, maxIterations = 3, objective = null) => {
    resetState()

    const isBookingSite = AGENT_SITE_TYPES.has(siteType)
    setMode(isBookingSite ? 'full' : 'optimize-only')
    setPhase('extracting')
    setRawUrl(url)

    fetchScreenshot(url)

    // Connect WebSocket to receive live loop progress
    const ws = connectDemoWs()

    try {
      // Step 1: Generate optimized HTML (includes Karpathy loop — streams via WS)
      setPhase('optimizing')
      const genRes = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url, site_type: siteType, trip_details: tripDetails, max_iterations: maxIterations, objective }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.detail || 'Generation failed')

      setOptimizedUrl(genData.generated_url)
      setLoopLog(genData.loop_log)
      setIterationsUsed(genData.karpathy_iterations)
      setStats(genData.stats || null)
      if (genData.stats?.content_reduction_pct != null) {
        setTokenReduction(genData.stats.content_reduction_pct)
      }
      setPhase('generation_complete')

      // For non-booking sites, skip agent — go straight to results
      if (!isBookingSite) {
        setPhase('complete')
        return
      }

      // Step 2: Run agent on raw site
      const customTasks = genData.agent_tasks || null

      setPhase('agent_running_raw')
      const rawAgentRes = await fetch(`${API_BASE}/api/run-agent`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url, site_type: siteType, custom_tasks: customTasks, trip_details: tripDetails }),
      })
      const rawAgentData = await rawAgentRes.json()
      setRawAgentScore(rawAgentData.tasks_completed ?? rawAgentData.score)
      setTotalTasks(rawAgentData.total_tasks || 5)

      // Step 3: Run agent on optimized site
      setPhase('agent_running_optimized')
      const optAgentRes = await fetch(`${API_BASE}/api/run-agent`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          url: `${window.location.origin}${genData.generated_url}`,
          site_type: siteType,
          custom_tasks: customTasks,
          trip_details: tripDetails,
        }),
      })
      const optAgentData = await optAgentRes.json()
      setOptimizedAgentScore(optAgentData.tasks_completed ?? optAgentData.score)
      setTaskResults(optAgentData.task_results)

      setPhase('complete')
    } catch (err) {
      console.error('Ingest error:', err)
      setPhase('complete')
    } finally {
      ws.close()
      wsRef.current = null
    }
  }, [fetchScreenshot, resetState, connectDemoWs])

  const handleDemo = useCallback(async (siteType, tripDetails = {}, maxIterations = 3) => {
    resetState()
    setMode('full') // Demo always runs full agent flow
    setPhase('extracting')

    const ws = connectDemoWs()

    try {
      const demoRes = await fetch(`${API_BASE}/api/demo`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ site_type: siteType, max_iterations: maxIterations, trip_details: tripDetails }),
      })
      const data = await demoRes.json()
      if (!demoRes.ok) throw new Error(data.detail || 'Demo failed')

      setRawUrl(data.proxy_url)
      setOptimizedUrl(data.generated_url)
      setLoopLog(data.karpathy?.log)
      setIterationsUsed(data.karpathy?.iterations)
      setRawAgentScore(data.raw_agent?.tasks_completed ?? data.raw_agent?.score)
      setOptimizedAgentScore(data.optimized_agent?.tasks_completed ?? data.optimized_agent?.score)
      setTotalTasks(data.optimized_agent?.total_tasks || 5)

      if (data.optimized_agent?.task_results) {
        setTaskResults(data.optimized_agent.task_results)
      }

      setPhase('complete')
    } catch (err) {
      console.error('Demo error:', err)
      setPhase('complete')
    } finally {
      ws.close()
      wsRef.current = null
    }
  }, [connectDemoWs, resetState])

  return (
    <div className="app">
      <HeroHeader
        phase={phase}
        onInjest={handleIngest}
        onDemo={handleDemo}
        onReset={resetState}
        loading={loading}
      />

      <div className="story-flow">
        <ProblemSection
          rawScreenshot={rawScreenshot}
          rawAgentScore={rawAgentScore}
          visible={showProblem}
          optimizeOnly={mode === 'optimize-only'}
        />

        <ProcessTimeline
          loopLog={loopLog}
          visible={showTimeline}
          running={phase === 'optimizing'}
        />

        <ComparisonSection
          rawScreenshot={rawScreenshot}
          optimizedUrl={optimizedUrl}
          visible={showComparison}
        />

        {showAgent && (
          <AgentSection
            visible={showAgent}
            active={phase === 'agent_running_raw' || phase === 'agent_running_optimized'}
            taskResults={taskResults}
          />
        )}

        <ScoreReveal
          rawScore={rawAgentScore}
          optimizedScore={optimizedAgentScore}
          totalTasks={totalTasks}
          tokenReduction={tokenReduction}
          iterationsUsed={iterationsUsed}
          loopLog={loopLog}
          stats={stats}
          visible={showScore}
          optimizeOnly={mode === 'optimize-only'}
        />

        {phase === 'idle' && (
          <div className="idle-hero">
            <h2>Make the web agent-ready</h2>
            <p>Enter a URL or click Demo to see the transformation</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
