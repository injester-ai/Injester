"""API routes for injester.lol."""

import asyncio
import json
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.agent import run_agent
from app.auto_tasks import generate_agent_tasks, generate_questions
from app.benchmark import score_content
from app.screenshot import capture_screenshot
from app.config import BENCHMARK_QUESTIONS, DEMO_URLS, PUBLIC_BASE_URL
from app.extractor import extract_url
from app.html_generator import generate_optimized_html
from app.karpathy_loop import run_loop
from app.optimizer import optimize_content
from app.ws import agent_event_callback, broadcast_sync

router = APIRouter()


class IngestRequest(BaseModel):
    url: str
    questions: Optional[List[str]] = None
    site_type: Optional[str] = None
    use_tavily: Optional[bool] = None


class LoopRequest(BaseModel):
    url: str
    questions: Optional[List[str]] = None
    site_type: Optional[str] = None
    max_iterations: int = 3
    use_tavily: Optional[bool] = None
    trip_details: Optional[dict] = None
    objective: Optional[str] = None


class GenerateRequest(BaseModel):
    url: str
    site_type: Optional[str] = None
    use_tavily: Optional[bool] = None


class AgentRequest(BaseModel):
    url: str
    site_type: str = "united"
    custom_tasks: Optional[list] = None
    trip_details: Optional[dict] = None


class DemoRequest(BaseModel):
    site_type: str = "united"
    max_iterations: int = 3
    trip_details: Optional[dict] = None


def _get_questions(
    req_questions: Optional[List[str]],
    site_type: Optional[str],
    content: Optional[str] = None,
    objective: Optional[str] = None,
) -> List[str]:
    if req_questions:
        return req_questions
    # If user specified an objective, generate questions targeted at that objective
    if objective and content:
        return generate_questions(content, objective=objective)
    if site_type and site_type in BENCHMARK_QUESTIONS:
        return BENCHMARK_QUESTIONS[site_type]
    # Auto-generate questions from page content for unknown site types
    if content:
        return generate_questions(content)
    return BENCHMARK_QUESTIONS["airbnb"]


def _should_use_tavily(url: str, override: Optional[bool]) -> bool:
    if override is not None:
        return override
    if "localhost" in url or "127.0.0.1" in url or url.startswith("http://192.168"):
        return False
    return True


def _do_extract(url: str, use_tavily: Optional[bool]):
    tavily = _should_use_tavily(url, use_tavily)
    result = extract_url(url, use_tavily=tavily)
    if not result["raw_content"]:
        raise HTTPException(
            status_code=422,
            detail=result.get("error", "Could not extract content from URL"),
        )
    return result


# --- Existing endpoints ---


@router.post("/extract")
def api_extract(req: IngestRequest):
    """Step 1: Extract clean content from URL."""
    return _do_extract(req.url, req.use_tavily)


@router.post("/optimize")
def api_optimize(req: IngestRequest):
    """Step 2: Extract + optimize via Nebius."""
    extracted = _do_extract(req.url, req.use_tavily)
    optimized = optimize_content(extracted["raw_content"])
    return {
        "extracted": extracted,
        "optimized": optimized,
    }


@router.post("/benchmark")
def api_benchmark(req: IngestRequest):
    """Step 3: Extract + optimize + benchmark raw vs. optimized."""
    questions = _get_questions(req.questions, req.site_type)
    extracted = _do_extract(req.url, req.use_tavily)
    optimized = optimize_content(extracted["raw_content"])

    raw_score = score_content(extracted["raw_content"], questions)
    opt_text = json.dumps(optimized["optimized"])
    opt_score = score_content(opt_text, questions)

    return {
        "url": req.url,
        "raw_benchmark": raw_score,
        "optimized_benchmark": opt_score,
        "improvement": {
            "raw_score": f"{raw_score['score']}/{raw_score['total']}",
            "optimized_score": f"{opt_score['score']}/{opt_score['total']}",
            "token_reduction": f"{raw_score['tokens_used']} → {opt_score['tokens_used']}",
        },
    }


@router.post("/loop")
def api_loop(req: LoopRequest):
    """Step 4: Full Karpathy AutoResearch loop."""
    questions = _get_questions(req.questions, req.site_type)
    extracted = _do_extract(req.url, req.use_tavily)

    raw_score = score_content(extracted["raw_content"], questions)

    loop_result = run_loop(
        extracted["raw_content"],
        questions,
        max_iterations=req.max_iterations,
    )

    return {
        "url": req.url,
        "raw_benchmark": raw_score,
        "loop": loop_result,
        "summary": {
            "raw_score": f"{raw_score['score']}/{raw_score['total']}",
            "optimized_score": f"{loop_result['best_score']}/{loop_result['best_total']}",
            "iterations": loop_result["iterations"],
        },
    }


# --- New endpoints ---


@router.post("/generate")
def api_generate(req: LoopRequest):
    """Full pipeline: extract → optimize → Karpathy loop → generate HTML.

    Returns the URL of the generated AI-optimized HTML page.
    For unknown site types, auto-generates benchmark questions and agent tasks.
    """
    extracted = _do_extract(req.url, req.use_tavily)
    raw_content = extracted["raw_content"]

    # Auto-generate questions if site type is unknown or objective is specified
    questions = _get_questions(req.questions, req.site_type, content=raw_content, objective=req.objective)

    # Auto-generate agent tasks for unknown site types
    agent_tasks = None
    if req.site_type not in ("united", "airbnb"):
        agent_tasks = generate_agent_tasks(raw_content)

    # Emit extracting phase
    broadcast_sync({"type": "demo_phase", "phase": "optimizing"})

    # Run Karpathy loop to get best optimization
    def _on_iteration(entry):
        broadcast_sync({"type": "demo_phase", "phase": "loop_entry", "loop_entry": entry})

    loop_result = run_loop(
        raw_content,
        questions,
        max_iterations=req.max_iterations,
        on_iteration=_on_iteration,
    )

    # Generate browsable HTML from the best optimization
    page_type = req.site_type or "general"
    html_result = generate_optimized_html(
        loop_result["best_result"]["optimized"],
        req.url,
        page_type=f"{page_type}_booking",
    )

    raw_chars = len(raw_content)
    opt_chars = html_result["html_length"]
    # Content reduction: compare optimized JSON (not HTML) to raw content
    best_json_chars = len(json.dumps(loop_result["best_result"]["optimized"]))
    reduction_pct = round((1 - best_json_chars / max(raw_chars, 1)) * 100)

    return {
        "url": req.url,
        "generated_url": html_result["served_url"],
        "html_length": html_result["html_length"],
        "karpathy_iterations": loop_result["iterations"],
        "best_score": f"{loop_result['best_score']}/{loop_result['best_total']}",
        "loop_log": loop_result["log"],
        "agent_tasks": agent_tasks,
        "stats": {
            "raw_content_chars": raw_chars,
            "optimized_json_chars": best_json_chars,
            "optimized_html_chars": opt_chars,
            "content_reduction_pct": reduction_pct,
            "questions_used": questions,
            "extraction_method": extracted.get("method", "unknown"),
        },
    }


@router.post("/ingest")
def api_ingest(req: LoopRequest):
    """Full demo endpoint: extract → benchmark raw → Karpathy loop → benchmark optimized → generate HTML.

    Returns everything needed for the 3-panel demo in one call.
    """
    questions = _get_questions(req.questions, req.site_type)
    extracted = _do_extract(req.url, req.use_tavily)

    # Benchmark raw content
    raw_score = score_content(extracted["raw_content"], questions)

    # Karpathy loop
    loop_result = run_loop(
        extracted["raw_content"],
        questions,
        max_iterations=req.max_iterations,
    )

    # Benchmark optimized content
    opt_text = json.dumps(loop_result["best_result"]["optimized"])
    opt_score = score_content(opt_text, questions)

    # Generate HTML page
    page_type = req.site_type or "general"
    html_result = generate_optimized_html(
        loop_result["best_result"]["optimized"],
        req.url,
        page_type=f"{page_type}_optimized",
    )

    raw_chars = len(extracted["raw_content"])
    opt_chars = len(opt_text)

    return {
        "url": req.url,
        "extraction": {
            "raw_content_length": raw_chars,
            "method": "tavily" if _should_use_tavily(req.url, req.use_tavily) else "direct",
        },
        "raw_benchmark": raw_score,
        "optimized_benchmark": opt_score,
        "karpathy_loop": {
            "iterations": loop_result["iterations"],
            "log": loop_result["log"],
            "best_score": loop_result["best_score"],
            "best_total": loop_result["best_total"],
        },
        "optimized_data": loop_result["best_result"]["optimized"],
        "generated_page": {
            "url": html_result["served_url"],
            "full_url": f"{PUBLIC_BASE_URL}{html_result['served_url']}",
            "html_length": html_result["html_length"],
        },
        "comparison": {
            "raw_score": f"{raw_score['score']}/{raw_score['total']}",
            "optimized_score": f"{opt_score['score']}/{opt_score['total']}",
            "raw_tokens": raw_score["tokens_used"],
            "optimized_tokens": opt_score["tokens_used"],
            "token_reduction_pct": round((1 - opt_score["tokens_used"] / max(raw_score["tokens_used"], 1)) * 100),
            "content_reduction_pct": round((1 - opt_chars / max(raw_chars, 1)) * 100),
        },
    }


class ScreenshotRequest(BaseModel):
    url: str


@router.post("/screenshot")
async def api_screenshot(req: ScreenshotRequest):
    """Capture a screenshot of a URL using Playwright.

    Returns base64-encoded PNG image data.
    """
    try:
        data = await capture_screenshot(req.url)
        return {"screenshot": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-agent")
async def api_run_agent(req: AgentRequest):
    """Run the Playwright booking agent on a URL.

    Streams events via WebSocket at /ws/agent.
    Returns the final score when complete.
    """
    result = await run_agent(
        url=req.url,
        site_type=req.site_type,
        headless=True,
        on_event=agent_event_callback,
        custom_tasks=req.custom_tasks,
        trip_details=req.trip_details,
    )
    return result


@router.post("/demo")
async def api_demo(req: DemoRequest):
    """One-click demo: extract, optimize, generate HTML, run agent on both, compare.

    This is the full demo flow for the hackathon pitch.
    Streams agent events via WebSocket at /ws/agent.
    Emits granular demo_phase events for the frontend phased reveal.
    """
    proxy_url = DEMO_URLS.get(req.site_type, DEMO_URLS["united"])
    questions = _get_questions(None, req.site_type)

    # Phase: extracting
    await agent_event_callback({"type": "demo_phase", "phase": "extracting"})
    extracted = _do_extract(proxy_url, use_tavily=False)

    # Phase: optimizing (Karpathy loop — streams each iteration live)
    await agent_event_callback({"type": "demo_phase", "phase": "optimizing"})

    def _on_demo_iteration(entry):
        broadcast_sync({"type": "demo_phase", "phase": "loop_entry", "loop_entry": entry})

    loop_result = run_loop(
        extracted["raw_content"],
        questions,
        max_iterations=req.max_iterations,
        on_iteration=_on_demo_iteration,
    )

    # Phase: generation_complete
    html_result = generate_optimized_html(
        loop_result["best_result"]["optimized"],
        proxy_url,
        page_type=f"{req.site_type}_booking",
    )
    generated_url = html_result["served_url"]
    await agent_event_callback({
        "type": "demo_phase",
        "phase": "generation_complete",
        "generated_url": generated_url,
        "proxy_url": proxy_url,
    })

    # Phase: run both agents concurrently
    optimized_url = f"{PUBLIC_BASE_URL}{generated_url}"
    await agent_event_callback({"type": "demo_phase", "phase": "agent_running_raw", "url": proxy_url})

    raw_agent, optimized_agent = await asyncio.gather(
        run_agent(
            url=proxy_url,
            site_type=req.site_type,
            headless=True,
            on_event=agent_event_callback,
        ),
        run_agent(
            url=optimized_url,
            site_type=req.site_type,
            headless=True,
            on_event=agent_event_callback,
        ),
    )

    # Phase: complete
    await agent_event_callback({
        "type": "demo_phase",
        "phase": "complete",
        "raw_score": raw_agent["tasks_completed"],
        "optimized_score": optimized_agent["tasks_completed"],
    })

    return {
        "site_type": req.site_type,
        "proxy_url": proxy_url,
        "generated_url": generated_url,
        "karpathy": {
            "iterations": loop_result["iterations"],
            "best_score": f"{loop_result['best_score']}/{loop_result['best_total']}",
            "log": loop_result["log"],
        },
        "raw_agent": {
            "score": raw_agent["score"],
            "tasks_completed": raw_agent["tasks_completed"],
            "total_tasks": raw_agent["total_tasks"],
            "task_results": raw_agent.get("task_results", []),
        },
        "optimized_agent": {
            "score": optimized_agent["score"],
            "tasks_completed": optimized_agent["tasks_completed"],
            "total_tasks": optimized_agent["total_tasks"],
            "task_results": optimized_agent.get("task_results", []),
        },
        "comparison": {
            "raw": raw_agent["score"],
            "optimized": optimized_agent["score"],
            "improvement": f"{raw_agent['tasks_completed']} → {optimized_agent['tasks_completed']} tasks completed",
        },
    }
