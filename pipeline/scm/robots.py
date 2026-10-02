"""robots.txt compliance for hosts we fetch HTML, feeds or web services from.

One robots.txt fetch per host, cached for the process. An unreachable or non-200 robots.txt is
treated as "allowed" (the usual convention) and recorded so the manifest shows it. Crawl-delay
directives raise the snapshot's minimum interval.
"""
from __future__ import annotations

import urllib.robotparser
from urllib.parse import urlsplit, urlunsplit

import requests

from .http import USER_AGENT, make_session


class RobotsCache:
    def __init__(self, session: requests.Session | None = None, user_agent: str = USER_AGENT, timeout: int = 10) -> None:
        self.session = session or make_session(retries=1)
        self.user_agent = user_agent
        self.timeout = timeout
        self._parsers: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self.unreachable: list[str] = []

    def _parser(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        parts = urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host in self._parsers:
            return self._parsers[host]
        rp = urllib.robotparser.RobotFileParser()
        robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
        try:
            resp = self.session.get(robots_url, timeout=self.timeout, headers={"User-Agent": self.user_agent})
            if resp.status_code == 200 and resp.text.strip():
                rp.parse(resp.text.splitlines())
                self._parsers[host] = rp
            else:
                self.unreachable.append(f"{robots_url} -> {resp.status_code}")
                self._parsers[host] = None
        except requests.RequestException as e:
            self.unreachable.append(f"{robots_url}: {type(e).__name__}")
            self._parsers[host] = None
        return self._parsers[host]

    def allowed(self, url: str) -> bool:
        rp = self._parser(url)
        if rp is None:
            return True
        # the product token (first word of the UA) is what robots.txt rules are written against;
        # robotparser falls back to the "*" group when no group names our token
        return rp.can_fetch(self.user_agent.split("/")[0], url)

    def crawl_delay(self, url: str) -> float | None:
        rp = self._parser(url)
        if rp is None:
            return None
        token = self.user_agent.split("/")[0]
        d = rp.crawl_delay(token) or rp.crawl_delay("*")
        return float(d) if d else None
