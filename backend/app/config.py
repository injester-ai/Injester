import os
from dotenv import load_dotenv

load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
NEBIUS_API_KEY = os.getenv("NEBIUS_API_KEY")
NEBIUS_BASE_URL = os.getenv("NEBIUS_BASE_URL", "https://api.studio.nebius.ai/v1/")
NEBIUS_MODEL = os.getenv("NEBIUS_MODEL", "meta-llama/Meta-Llama-3.1-70B-Instruct")
# Fast model for agent selector tasks (doesn't need large model for CSS selectors)
NEBIUS_AGENT_MODEL = os.getenv("NEBIUS_AGENT_MODEL", NEBIUS_MODEL)

# Public base URL for self-referential links to generated/served HTML.
# Local dev default works with `uvicorn ... --port 8000`; production must set
# PUBLIC_BASE_URL to the externally reachable origin (e.g. https://demo.injester.com).
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

# Proxy sites — use env vars if Vishal's proxies are running, else real URLs
PROXY_UNITED_URL = os.getenv("PROXY_UNITED_URL", "https://www.united.com/en/us")
PROXY_AIRBNB_URL = os.getenv("PROXY_AIRBNB_URL", "https://www.airbnb.com/rooms/5769778")

# Demo benchmark questions
# These must be answerable from the EXTRACTED content (not live search results).
# Focus on page structure and information that exists on the page itself.
BENCHMARK_QUESTIONS = {
    "united": [
        "What types of trips can be booked (one-way, round trip, multi-city)?",
        "What travel classes or cabin types are available?",
        "What information fields are needed to search for flights (origin, destination, dates)?",
        "What loyalty or rewards program does the airline offer?",
        "What other services are available besides flight booking (hotels, cars, packages)?",
    ],
    "airbnb": [
        "What is the nightly price for this listing?",
        "What is the maximum number of guests this listing accommodates?",
        "What are the key amenities (wifi, parking, kitchen, etc.)?",
        "What type of property is this (entire home, private room, etc.)?",
        "Where is this listing located (city, neighborhood)?",
    ],
}

# Demo preset URLs (Vishal's proxy sites)
DEMO_URLS = {
    "united": PROXY_UNITED_URL,
    "airbnb": PROXY_AIRBNB_URL,
}
