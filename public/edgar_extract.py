#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
edgar_extract.py — the definitive SEC EDGAR extractor.
================================================================================

Zero dependencies (Python 3.9+ stdlib only). Optional: `pandas` for parquet.

Extracts EVERYTHING the SEC publishes for a registrant, straight from the
official endpoints, with a compliant User-Agent, a token-bucket rate limiter
(SEC fair-access = 10 req/s), exponential backoff, on-disk HTTP caching and a
resumable SQLite warehouse.

COVERAGE
--------
  universe      company_tickers_exchange.json  -> every ticker/CIK/exchange
  submissions   data.sec.gov/submissions/      -> entity profile + full filing
                                                  history (incl. paginated
                                                  historical archive shards)
  facts         api/xbrl/companyfacts/         -> every XBRL fact ever tagged
  concept       api/xbrl/companyconcept/       -> single tag time series
  frames        api/xbrl/frames/               -> one tag across ALL filers
  documents     www.sec.gov/Archives/          -> raw primary docs, R-files,
                                                  FilingSummary, exhibits
  insiders      Form 3/4/5 ownership XML       -> parsed transaction ledger
  holdings      13F-HR information tables      -> parsed position ledger
  fulltext      efts.sec.gov/LATEST/search-index -> 2001+ full-text search
  tape          browse-edgar?action=getcurrent -> real-time acceptance feed

OUTPUTS
-------
  ./edgar_out/edgar.db            SQLite warehouse (all tables, idempotent)
  ./edgar_out/<TICKER>/*.json     Raw + normalized JSON bundles
  ./edgar_out/<TICKER>/*.csv      Flat CSV per dataset
  ./edgar_out/_cache/             HTTP cache (delete to force refresh)

USAGE
-----
  # Everything for one or more companies
  python edgar_extract.py company AAPL MSFT NVDA --all

  # Pick datasets
  python edgar_extract.py company TSLA --facts --filings --insiders --docs 10-K

  # Cross-sectional: one XBRL tag for every filer in a period
  python edgar_extract.py frames us-gaap Assets USD CY2024Q4I

  # Full-text search across all EDGAR primary documents
  python edgar_extract.py search "material weakness in internal control" --forms 10-K

  # Live acceptance tape (Ctrl-C to stop)
  python edgar_extract.py tape --watch --form 8-K

  # Download the entire ticker universe
  python edgar_extract.py universe

  # Institutional 13F holdings
  python edgar_extract.py company 0001067983 --holdings     # Berkshire

REQUIRED
--------
  Set a real contact string. The SEC blocks generic agents.
    export SEC_USER_AGENT="Your Name your@email.com"

LICENSE / ETHICS
----------------
  SEC data is U.S. public domain. This tool self-throttles below the published
  fair-access threshold. Do not remove the rate limiter.
================================================================================
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------

UA = os.environ.get("SEC_USER_AGENT", "").strip()
OUT = Path(os.environ.get("EDGAR_OUT", "./edgar_out")).resolve()
CACHE = OUT / "_cache"
DB_PATH = OUT / "edgar.db"

RATE_PER_SEC = float(os.environ.get("SEC_RATE", "7"))   # stay under the 10/s cap
MAX_RETRIES = 5
TIMEOUT = 45
WORKERS = int(os.environ.get("SEC_WORKERS", "4"))
CACHE_TTL = int(os.environ.get("SEC_CACHE_TTL", "3600"))  # seconds; 0 = forever

BASE_WWW = "https://www.sec.gov"
BASE_DATA = "https://data.sec.gov"
BASE_EFTS = "https://efts.sec.gov/LATEST"

C = {
    "dim": "\033[2m", "red": "\033[31m", "grn": "\033[32m", "yel": "\033[33m",
    "blu": "\033[34m", "cyn": "\033[36m", "bold": "\033[1m", "off": "\033[0m",
}
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    C = {k: "" for k in C}


def log(msg: str, kind: str = "info") -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    tint = {"info": C["cyn"], "ok": C["grn"], "warn": C["yel"], "err": C["red"]}.get(kind, "")
    print(f"{C['dim']}{stamp}{C['off']} {tint}{msg}{C['off']}", flush=True)


def die(msg: str, code: int = 1) -> None:
    log(msg, "err")
    sys.exit(code)


# ------------------------------------------------------------------------------
# Rate limiting + HTTP with cache, retries and backoff
# ------------------------------------------------------------------------------


class TokenBucket:
    """Thread-safe token bucket. Guarantees <= rate requests/second globally."""

    def __init__(self, rate: float, burst: Optional[float] = None):
        self.rate = rate
        self.capacity = burst if burst is not None else max(1.0, rate)
        self.tokens = self.capacity
        self.stamp = time.monotonic()
        self.lock = threading.Lock()

    def take(self, n: float = 1.0) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.stamp) * self.rate)
                self.stamp = now
                if self.tokens >= n:
                    self.tokens -= n
                    return
                wait = (n - self.tokens) / self.rate
            time.sleep(wait)


BUCKET = TokenBucket(RATE_PER_SEC)


@dataclass
class Stats:
    requests: int = 0
    cached: int = 0
    bytes: int = 0
    errors: int = 0
    started: float = field(default_factory=time.monotonic)

    def summary(self) -> str:
        el = time.monotonic() - self.started
        return (f"{self.requests} req ({self.cached} cached) · "
                f"{self.bytes / 1e6:.2f} MB · {self.errors} errors · {el:.1f}s")


STATS = Stats()


def _cache_path(url: str) -> Path:
    h = hashlib.sha256(url.encode()).hexdigest()[:24]
    return CACHE / h[:2] / f"{h}.bin"


def http_get(url: str, *, binary: bool = False, use_cache: bool = True) -> bytes:
    """Fetch a URL as bytes, honoring the rate limit, cache and retry policy."""
    cp = _cache_path(url)
    if use_cache and cp.exists():
        fresh = CACHE_TTL == 0 or (time.time() - cp.stat().st_mtime) < CACHE_TTL
        if fresh:
            STATS.cached += 1
            return cp.read_bytes()

    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        BUCKET.take()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip, deflate",
                "Accept": "*/*" if binary else "application/json, text/html;q=0.9, */*;q=0.8",
                "Host": urllib.parse.urlparse(url).netloc,
                "Connection": "keep-alive",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                STATS.requests += 1
                STATS.bytes += len(raw)
                if use_cache:
                    cp.parent.mkdir(parents=True, exist_ok=True)
                    cp.write_bytes(raw)
                return raw
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 404:
                raise FileNotFoundError(url) from e
            if e.code in (403, 429, 500, 502, 503, 504):
                back = min(2 ** attempt + 0.4 * attempt, 30)
                log(f"HTTP {e.code} · backoff {back:.1f}s · {url[:96]}", "warn")
                time.sleep(back)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            time.sleep(min(2 ** attempt, 20))

    STATS.errors += 1
    raise RuntimeError(f"exhausted retries for {url}: {last_err}")


def get_json(url: str) -> Any:
    return json.loads(http_get(url).decode("utf-8", "replace"))


def get_text(url: str, use_cache: bool = True) -> str:
    return http_get(url, use_cache=use_cache).decode("utf-8", "replace")


# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

pad_cik = lambda c: re.sub(r"\D", "", str(c)).zfill(10)
bare_cik = lambda c: str(int(re.sub(r"\D", "", str(c)) or 0))
slug = lambda s: re.sub(r"[^A-Za-z0-9._-]+", "_", str(s)).strip("_")[:64] or "unknown"
now_iso = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json(path: Path, obj: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    return path


def write_csv(path: Path, rows: Sequence[Dict[str, Any]], columns: Optional[List[str]] = None) -> Optional[Path]:
    if not rows:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = columns or sorted({k for r in rows for k in r})
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return path


# ------------------------------------------------------------------------------
# SQLite warehouse
# ------------------------------------------------------------------------------

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS entity (
  cik TEXT PRIMARY KEY, name TEXT, tickers TEXT, exchanges TEXT, sic TEXT,
  sic_desc TEXT, entity_type TEXT, ein TEXT, fye TEXT, state_inc TEXT,
  phone TEXT, website TEXT, address TEXT, former_names TEXT, updated TEXT
);

CREATE TABLE IF NOT EXISTS filing (
  cik TEXT, accession TEXT, form TEXT, filed TEXT, report_date TEXT,
  acceptance TEXT, act TEXT, file_number TEXT, film_number TEXT, items TEXT,
  size INTEGER, is_xbrl INTEGER, is_inline_xbrl INTEGER,
  primary_doc TEXT, primary_doc_desc TEXT, doc_url TEXT, index_url TEXT,
  PRIMARY KEY (cik, accession, primary_doc)
);
CREATE INDEX IF NOT EXISTS ix_filing_form ON filing(form, filed);

CREATE TABLE IF NOT EXISTS fact (
  cik TEXT, taxonomy TEXT, tag TEXT, label TEXT, unit TEXT,
  period_start TEXT, period_end TEXT, val REAL, accession TEXT,
  fy INTEGER, fp TEXT, form TEXT, filed TEXT, frame TEXT,
  PRIMARY KEY (cik, taxonomy, tag, unit, period_start, period_end, accession)
);
CREATE INDEX IF NOT EXISTS ix_fact_tag ON fact(tag, period_end);

CREATE TABLE IF NOT EXISTS insider_txn (
  accession TEXT, issuer_cik TEXT, issuer_name TEXT, owner_cik TEXT,
  owner_name TEXT, is_director INTEGER, is_officer INTEGER, is_ten_pct INTEGER,
  officer_title TEXT, security TEXT, txn_date TEXT, txn_code TEXT,
  shares REAL, price REAL, acquired_disposed TEXT, shares_owned_after REAL,
  direct_indirect TEXT, footnote TEXT,
  PRIMARY KEY (accession, owner_cik, security, txn_date, txn_code, shares, price)
);

CREATE TABLE IF NOT EXISTS holding (
  accession TEXT, filer_cik TEXT, period TEXT, issuer TEXT, cusip TEXT,
  cls TEXT, value REAL, shares REAL, share_type TEXT, put_call TEXT,
  discretion TEXT, sole_voting REAL, shared_voting REAL, none_voting REAL,
  PRIMARY KEY (accession, cusip, cls, put_call, shares, value)
);

CREATE TABLE IF NOT EXISTS universe (
  cik TEXT, ticker TEXT, name TEXT, exchange TEXT, updated TEXT,
  PRIMARY KEY (cik, ticker)
);

CREATE TABLE IF NOT EXISTS frame_point (
  taxonomy TEXT, tag TEXT, unit TEXT, period TEXT, cik TEXT,
  entity TEXT, val REAL, PRIMARY KEY (taxonomy, tag, unit, period, cik)
);

CREATE TABLE IF NOT EXISTS run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, command TEXT, detail TEXT
);
"""


class Warehouse:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.con.executescript(SCHEMA)
        self.con.commit()

    def upsert(self, table: str, rows: Iterable[Dict[str, Any]]) -> int:
        rows = list(rows)
        if not rows:
            return 0
        cols = list(rows[0].keys())
        sql = (f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) "
               f"VALUES ({','.join('?' for _ in cols)})")
        with self.lock:
            self.con.executemany(sql, [[r.get(c) for c in cols] for r in rows])
            self.con.commit()
        return len(rows)

    def log_run(self, command: str, detail: str) -> None:
        self.upsert("run_log", [{"ts": now_iso(), "command": command, "detail": detail}])

    def close(self) -> None:
        with self.lock:
            self.con.execute("PRAGMA optimize")
            self.con.commit()
            self.con.close()


# ------------------------------------------------------------------------------
# 1. Universe: every ticker -> CIK mapping
# ------------------------------------------------------------------------------


def fetch_universe() -> List[Dict[str, str]]:
    j = get_json(f"{BASE_WWW}/files/company_tickers_exchange.json")
    fields = j["fields"]
    ix = {f: fields.index(f) for f in fields}
    rows = []
    for r in j["data"]:
        rows.append({
            "cik": pad_cik(r[ix["cik"]]),
            "ticker": str(r[ix["ticker"]] or ""),
            "name": str(r[ix["name"]] or ""),
            "exchange": str(r[ix.get("exchange", 0)] or "") if "exchange" in ix else "",
            "updated": now_iso(),
        })
    return rows


_UNIVERSE: Optional[List[Dict[str, str]]] = None


def resolve(identifier: str) -> Tuple[str, str]:
    """Accept a ticker, a company name fragment, or a CIK. Return (cik, ticker)."""
    global _UNIVERSE
    ident = identifier.strip()
    if re.fullmatch(r"\d{4,10}", re.sub(r"\D", "", ident)) and not ident.isalpha():
        return pad_cik(ident), ""
    if _UNIVERSE is None:
        log("loading ticker universe…")
        _UNIVERSE = fetch_universe()
    up = ident.upper()
    for r in _UNIVERSE:
        if r["ticker"].upper() == up:
            return r["cik"], r["ticker"]
    for r in _UNIVERSE:
        if up in r["name"].upper():
            log(f"resolved '{identifier}' -> {r['name']} ({r['ticker'] or r['cik']})", "warn")
            return r["cik"], r["ticker"]
    die(f"could not resolve '{identifier}' to a CIK")
    return "", ""


# ------------------------------------------------------------------------------
# 2. Submissions: profile + complete filing history (with archive pagination)
# ------------------------------------------------------------------------------


def fetch_submissions(cik: str, full_history: bool = True) -> Dict[str, Any]:
    sub = get_json(f"{BASE_DATA}/submissions/CIK{pad_cik(cik)}.json")
    if full_history:
        for shard in sub.get("filings", {}).get("files", []):
            try:
                extra = get_json(f"{BASE_DATA}/submissions/{shard['name']}")
            except Exception as e:  # noqa: BLE001
                log(f"archive shard {shard['name']} failed: {e}", "warn")
                continue
            recent = sub["filings"]["recent"]
            for k, v in extra.items():
                if isinstance(v, list):
                    recent.setdefault(k, []).extend(v)
    return sub


def normalize_filings(cik: str, recent: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
    n = len(recent.get("accessionNumber", []))
    bare = bare_cik(cik)
    col = lambda k, i, d="": (recent.get(k) or [d] * n)[i] if i < len(recent.get(k) or []) else d
    rows = []
    for i in range(n):
        acc = str(col("accessionNumber", i))
        nodash = acc.replace("-", "")
        doc = str(col("primaryDocument", i))
        rows.append({
            "cik": pad_cik(cik),
            "accession": acc,
            "form": str(col("form", i)),
            "filed": str(col("filingDate", i)),
            "report_date": str(col("reportDate", i)),
            "acceptance": str(col("acceptanceDateTime", i)),
            "act": str(col("act", i)),
            "file_number": str(col("fileNumber", i)),
            "film_number": str(col("filmNumber", i)),
            "items": str(col("items", i)),
            "size": int(col("size", i, 0) or 0),
            "is_xbrl": int(col("isXBRL", i, 0) or 0),
            "is_inline_xbrl": int(col("isInlineXBRL", i, 0) or 0),
            "primary_doc": doc,
            "primary_doc_desc": str(col("primaryDocDescription", i)),
            "doc_url": f"{BASE_WWW}/Archives/edgar/data/{bare}/{nodash}/{doc}",
            "index_url": f"{BASE_WWW}/Archives/edgar/data/{bare}/{nodash}/{acc}-index.htm",
        })
    return rows


def entity_row(sub: Dict[str, Any]) -> Dict[str, Any]:
    biz = (sub.get("addresses") or {}).get("business") or {}
    addr = ", ".join(str(biz.get(k)) for k in
                     ("street1", "street2", "city", "stateOrCountry", "zipCode") if biz.get(k))
    return {
        "cik": pad_cik(sub.get("cik", "")),
        "name": sub.get("name", ""),
        "tickers": ",".join(sub.get("tickers") or []),
        "exchanges": ",".join(sub.get("exchanges") or []),
        "sic": sub.get("sic", ""),
        "sic_desc": sub.get("sicDescription", ""),
        "entity_type": sub.get("entityType", ""),
        "ein": sub.get("ein", ""),
        "fye": sub.get("fiscalYearEnd", ""),
        "state_inc": sub.get("stateOfIncorporation", ""),
        "phone": sub.get("phone", ""),
        "website": sub.get("website", ""),
        "address": addr,
        "former_names": json.dumps(sub.get("formerNames") or []),
        "updated": now_iso(),
    }


# ------------------------------------------------------------------------------
# 3. XBRL: companyfacts (every fact), companyconcept, frames
# ------------------------------------------------------------------------------


def flatten_facts(cik: str, facts_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for taxonomy, tags in (facts_doc.get("facts") or {}).items():
        for tag, node in tags.items():
            label = node.get("label") or ""
            for unit, points in (node.get("units") or {}).items():
                for p in points:
                    out.append({
                        "cik": pad_cik(cik), "taxonomy": taxonomy, "tag": tag,
                        "label": label, "unit": unit,
                        "period_start": p.get("start", ""), "period_end": p.get("end", ""),
                        "val": p.get("val"), "accession": p.get("accn", ""),
                        "fy": p.get("fy"), "fp": p.get("fp", ""), "form": p.get("form", ""),
                        "filed": p.get("filed", ""), "frame": p.get("frame", ""),
                    })
    return out


def annual_pivot(facts: List[Dict[str, Any]], tags: Optional[Sequence[str]] = None) -> List[Dict[str, Any]]:
    """Fiscal-year pivot: one row per tag, one column per FY. Latest filing wins."""
    keep = set(tags) if tags else None
    grid: Dict[Tuple[str, str], Dict[str, Tuple[str, float]]] = defaultdict(dict)
    for f in facts:
        if keep and f["tag"] not in keep:
            continue
        if f["form"] not in ("10-K", "20-F", "40-F", "10-K/A"):
            continue
        if f["fp"] != "FY" or f["val"] is None:
            continue
        if f["period_start"]:
            try:
                span = (datetime.fromisoformat(f["period_end"]) -
                        datetime.fromisoformat(f["period_start"])).days
                if not 300 <= span <= 400:
                    continue
            except ValueError:
                continue
        year = str(f["period_end"])[:4]
        cell = grid[(f["tag"], f["unit"])].get(year)
        if cell is None or str(f["filed"]) >= cell[0]:
            grid[(f["tag"], f["unit"])][year] = (str(f["filed"]), float(f["val"]))
    years = sorted({y for cells in grid.values() for y in cells})
    rows = []
    for (tag, unit), cells in sorted(grid.items()):
        row: Dict[str, Any] = {"tag": tag, "unit": unit}
        for y in years:
            row[y] = cells.get(y, (None, None))[1]
        rows.append(row)
    return rows


def fetch_concept(cik: str, taxonomy: str, tag: str) -> Dict[str, Any]:
    return get_json(f"{BASE_DATA}/api/xbrl/companyconcept/CIK{pad_cik(cik)}/{taxonomy}/{tag}.json")


def fetch_frame(taxonomy: str, tag: str, unit: str, period: str) -> Dict[str, Any]:
    return get_json(f"{BASE_DATA}/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json")


# ------------------------------------------------------------------------------
# 4. Documents: primary docs, filing manifests, R-files, exhibits
# ------------------------------------------------------------------------------


def download_documents(cik: str, filings: List[Dict[str, Any]], forms: Sequence[str],
                       limit: int, dest: Path, manifests: bool = True) -> List[Dict[str, Any]]:
    wanted = [f for f in filings if not forms or f["form"] in forms]
    wanted = wanted[:limit]
    got: List[Dict[str, Any]] = []
    dest.mkdir(parents=True, exist_ok=True)

    def one(f: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not f["primary_doc"]:
            return None
        try:
            raw = http_get(f["doc_url"], binary=True)
        except Exception as e:  # noqa: BLE001
            log(f"doc {f['accession']} failed: {e}", "warn")
            return None
        ext = Path(f["primary_doc"]).suffix or ".htm"
        name = f"{f['filed']}_{slug(f['form'])}_{f['accession']}{ext}"
        (dest / name).write_bytes(raw)
        rec = {**f, "local_path": str((dest / name).relative_to(OUT)), "doc_bytes": len(raw)}
        if manifests:
            base = f["doc_url"].rsplit("/", 1)[0]
            try:
                rec["manifest"] = parse_filing_summary(get_text(f"{base}/FilingSummary.xml"))
            except Exception:  # noqa: BLE001
                rec["manifest"] = []
        return rec

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for fut in as_completed([pool.submit(one, f) for f in wanted]):
            r = fut.result()
            if r:
                got.append(r)
    got.sort(key=lambda r: r["filed"], reverse=True)
    return got


def parse_filing_summary(xml: str) -> List[Dict[str, str]]:
    """FilingSummary.xml lists every rendered statement (R1.htm, R2.htm, …)."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    out = []
    for rep in root.iter("Report"):
        out.append({
            "short_name": (rep.findtext("ShortName") or "").strip(),
            "long_name": (rep.findtext("LongName") or "").strip(),
            "role": (rep.findtext("Role") or "").strip(),
            "file": (rep.findtext("HtmlFileName") or rep.findtext("XmlFileName") or "").strip(),
        })
    return [r for r in out if r["file"]]


# ------------------------------------------------------------------------------
# 5. Insider ownership: Forms 3/4/5 XML -> transaction ledger
# ------------------------------------------------------------------------------

_NS = re.compile(r"\{[^}]*\}|\sxmlns(?::\w+)?=\"[^\"]*\"")


def _t(el: Optional[ET.Element], path: str, default: str = "") -> str:
    if el is None:
        return default
    node = el.find(path)
    if node is None:
        return default
    inner = node.find("value")
    txt = (inner if inner is not None else node).text
    return (txt or default).strip()


def parse_ownership(xml: str, accession: str) -> List[Dict[str, Any]]:
    try:
        root = ET.fromstring(_NS.sub("", xml))
    except ET.ParseError:
        return []
    issuer = root.find("issuer")
    rows: List[Dict[str, Any]] = []
    owners = root.findall("reportingOwner") or [None]  # type: ignore[list-item]
    for owner in owners:
        oid = owner.find("reportingOwnerId") if owner is not None else None
        rel = owner.find("reportingOwnerRelationship") if owner is not None else None
        base = {
            "accession": accession,
            "issuer_cik": pad_cik(_t(issuer, "issuerCik", "0")),
            "issuer_name": _t(issuer, "issuerName"),
            "owner_cik": pad_cik(_t(oid, "rptOwnerCik", "0")),
            "owner_name": _t(oid, "rptOwnerName"),
            "is_director": 1 if _t(rel, "isDirector") in ("1", "true") else 0,
            "is_officer": 1 if _t(rel, "isOfficer") in ("1", "true") else 0,
            "is_ten_pct": 1 if _t(rel, "isTenPercentOwner") in ("1", "true") else 0,
            "officer_title": _t(rel, "officerTitle"),
        }
        for kind in ("nonDerivativeTransaction", "derivativeTransaction"):
            for txn in root.iter(kind):
                amt = txn.find("transactionAmounts")
                post = txn.find("postTransactionAmounts")
                own = txn.find("ownershipNature")
                coding = txn.find("transactionCoding")

                def num(node: Optional[ET.Element], path: str) -> Optional[float]:
                    v = _t(node, path)
                    try:
                        return float(v.replace(",", "")) if v else None
                    except ValueError:
                        return None

                rows.append({
                    **base,
                    "security": _t(txn, "securityTitle"),
                    "txn_date": _t(txn, "transactionDate"),
                    "txn_code": _t(coding, "transactionCode"),
                    "shares": num(amt, "transactionShares"),
                    "price": num(amt, "transactionPricePerShare"),
                    "acquired_disposed": _t(amt, "transactionAcquiredDisposedCode"),
                    "shares_owned_after": num(post, "sharesOwnedFollowingTransaction"),
                    "direct_indirect": _t(own, "directOrIndirectOwnership"),
                    "footnote": _t(txn, "footnoteId"),
                })
    return [r for r in rows if r["txn_date"] or r["shares"] is not None]


def fetch_insider_ledger(cik: str, filings: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    forms4 = [f for f in filings if f["form"] in ("3", "4", "5", "3/A", "4/A", "5/A")][:limit]
    ledger: List[Dict[str, Any]] = []

    def one(f: Dict[str, Any]) -> List[Dict[str, Any]]:
        # The raw ownership XML always sits in the filing root folder. The
        # primary_doc may live in a rendered .xsl subfolder (no index.json
        # there), so anchor on the root instead of doc_url's parent.
        rel = f["doc_url"].split("/Archives/edgar/data/")[1]
        root = f"{BASE_WWW}/Archives/edgar/data/{rel.split('/')[0]}/{rel.split('/')[1]}"
        candidates = []
        try:
            idx = get_json(f"{root}/index.json")
            for item in idx.get("directory", {}).get("item", []):
                nm = item.get("name", "")
                if nm.endswith(".xml") and not nm.endswith(("_cal.xml", "_def.xml", "_lab.xml", "_pre.xml")):
                    candidates.append(f"{root}/{nm}")
        except Exception:  # noqa: BLE001
            pass
        for url in dict.fromkeys(candidates):
            try:
                rows = parse_ownership(get_text(url), f["accession"])
            except Exception:  # noqa: BLE001
                continue
            if rows:
                return rows
        return []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for fut in as_completed([pool.submit(one, f) for f in forms4]):
            ledger.extend(fut.result())
    ledger.sort(key=lambda r: (r.get("txn_date") or ""), reverse=True)
    return ledger


# ------------------------------------------------------------------------------
# 6. 13F-HR information tables -> position ledger
# ------------------------------------------------------------------------------


def parse_13f(xml: str, accession: str, filer_cik: str, period: str) -> List[Dict[str, Any]]:
    try:
        root = ET.fromstring(_NS.sub("", xml))
    except ET.ParseError:
        return []
    rows = []
    for it in root.iter("infoTable"):
        sh = it.find("shrsOrPrnAmt")
        vote = it.find("votingAuthority")

        def num(node: Optional[ET.Element], path: str) -> Optional[float]:
            v = _t(node, path)
            try:
                return float(v.replace(",", "")) if v else None
            except ValueError:
                return None

        value = num(it, "value")
        rows.append({
            "accession": accession, "filer_cik": pad_cik(filer_cik), "period": period,
            "issuer": _t(it, "nameOfIssuer"), "cusip": _t(it, "cusip"),
            "cls": _t(it, "titleOfClass"),
            # Pre-2023 filings report value in thousands; normalize to dollars.
            "value": value,
            "shares": num(sh, "sshPrnamt"), "share_type": _t(sh, "sshPrnamtType"),
            "put_call": _t(it, "putCall"), "discretion": _t(it, "investmentDiscretion"),
            "sole_voting": num(vote, "Sole"), "shared_voting": num(vote, "Shared"),
            "none_voting": num(vote, "None"),
        })
    return rows


def fetch_holdings(cik: str, filings: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    f13 = [f for f in filings if f["form"].startswith("13F-HR")][:limit]
    out: List[Dict[str, Any]] = []

    def one(f: Dict[str, Any]) -> List[Dict[str, Any]]:
        # Anchor on the filing root folder: the info-table XML is a raw file
        # there, while the primary_doc is a rendered copy in an .xsl subfolder.
        rel = f["doc_url"].split("/Archives/edgar/data/")[1]
        base = f"{BASE_WWW}/Archives/edgar/data/{rel.split('/')[0]}/{rel.split('/')[1]}"
        try:
            idx = get_json(f"{base}/index.json")
        except Exception:  # noqa: BLE001
            return []
        for item in idx.get("directory", {}).get("item", []):
            nm = item.get("name", "")
            if not nm.endswith(".xml"):
                continue
            try:
                rows = parse_13f(get_text(f"{base}/{nm}"), f["accession"], cik, f["report_date"])
            except Exception:  # noqa: BLE001
                continue
            if rows:
                return rows
        return []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for fut in as_completed([pool.submit(one, f) for f in f13]):
            out.extend(fut.result())
    out.sort(key=lambda r: -(r.get("value") or 0))
    return out


# ------------------------------------------------------------------------------
# 7. Full-text search (efts) + 8. live acceptance tape
# ------------------------------------------------------------------------------


def full_text_search(q: str, forms: str = "", start: str = "", end: str = "",
                     pages: int = 1) -> List[Dict[str, Any]]:
    hits: List[Dict[str, Any]] = []
    for page in range(pages):
        params = {"q": q, "from": str(page * 10)}
        if forms:
            params["forms"] = forms
        if start and end:
            params.update({"dateRange": "custom", "startdt": start, "enddt": end})
        j = get_json(f"{BASE_EFTS}/search-index?{urllib.parse.urlencode(params)}")
        batch = (j.get("hits") or {}).get("hits") or []
        if not batch:
            break
        for h in batch:
            s = h.get("_source", {})
            adsh, _, fname = h.get("_id", "").partition(":")
            cik = (s.get("ciks") or ["0"])[0]
            hits.append({
                "form": s.get("root_form") or s.get("file_type", ""),
                "company": (s.get("display_names") or ["—"])[0],
                "cik": pad_cik(cik), "filed": s.get("file_date", ""),
                "accession": adsh, "file": fname,
                "url": f"{BASE_WWW}/Archives/edgar/data/{bare_cik(cik)}/{adsh.replace('-', '')}/{fname}",
            })
        total = ((j.get("hits") or {}).get("total") or {}).get("value", 0)
        log(f"fts page {page + 1}: {len(batch)} hits (total {total})")
        if len(hits) >= total:
            break
    return hits


def fetch_tape(count: int = 40, form: str = "") -> List[Dict[str, Any]]:
    url = (f"{BASE_WWW}/cgi-bin/browse-edgar?action=getcurrent"
           f"&type={urllib.parse.quote(form)}&company=&dateb=&owner=include"
           f"&start=0&count={count}&output=atom")
    xml = get_text(url, use_cache=False)
    items = []
    for entry in re.findall(r"<entry>[\s\S]*?</entry>", xml):
        pull = lambda t: (re.search(rf"<{t}[^>]*>([\s\S]*?)</{t}>", entry) or [None, ""])[1]
        title = re.sub(r"<[^>]+>", " ", pull("title")).strip()
        summary = re.sub(r"<[^>]+>", " ", pull("summary"))
        href = (re.search(r'<link[^>]*href="([^"]+)"', entry) or [None, ""])[1]
        head, _, rest = title.partition(" - ")
        cik_m = re.search(r"\((\d{10})\)", rest)
        items.append({
            "form": head.strip(),
            "company": re.sub(r"\s*\(\d{10}\)\s*\(.*?\)\s*$", "", rest).strip() or rest.strip(),
            "cik": cik_m.group(1) if cik_m else "",
            "accepted": (re.search(r"AcceptanceDateTime:?\s*([\d\-T:.+]+)", summary) or [None, pull("updated")])[1],
            "filed": (re.search(r"Filed:?\s*([\d-]+)", summary) or [None, ""])[1],
            "url": href,
        })
    return items


# ------------------------------------------------------------------------------
# Orchestration
# ------------------------------------------------------------------------------


def extract_company(wh: Warehouse, identifier: str, args: argparse.Namespace) -> Dict[str, Any]:
    cik, ticker = resolve(identifier)
    log(f"{C['bold']}▸ {identifier} → CIK {cik}{C['off']}")

    sub = fetch_submissions(cik, full_history=not args.recent_only)
    ent = entity_row(sub)
    ticker = ticker or (ent["tickers"].split(",")[0] if ent["tickers"] else "")
    dest = OUT / slug(ticker or cik)
    wh.upsert("entity", [ent])
    write_json(dest / "entity.json", ent)
    log(f"  entity: {ent['name']} · {ent['sic_desc'] or ent['entity_type'] or 'n/a'}", "ok")

    report: Dict[str, Any] = {"cik": cik, "ticker": ticker, "name": ent["name"],
                              "extracted_at": now_iso(), "datasets": {}}

    filings = normalize_filings(cik, sub.get("filings", {}).get("recent", {}))
    if args.filings or args.all:
        wh.upsert("filing", filings)
        write_csv(dest / "filings.csv", filings)
        write_json(dest / "filings.json", filings)
        by_form = defaultdict(int)
        for f in filings:
            by_form[f["form"]] += 1
        report["datasets"]["filings"] = {
            "count": len(filings),
            "range": [filings[-1]["filed"], filings[0]["filed"]] if filings else [],
            "top_forms": sorted(by_form.items(), key=lambda kv: -kv[1])[:12],
        }
        log(f"  filings: {len(filings)} rows across {len(by_form)} form types", "ok")

    if args.facts or args.all:
        try:
            doc = get_json(f"{BASE_DATA}/api/xbrl/companyfacts/CIK{pad_cik(cik)}.json")
            facts = flatten_facts(cik, doc)
            wh.upsert("fact", facts)
            write_csv(dest / "facts.csv", facts)
            pivot = annual_pivot(facts)
            write_csv(dest / "annual_pivot.csv", pivot)
            write_json(dest / "companyfacts_raw.json", doc)
            tags = {f["tag"] for f in facts}
            report["datasets"]["facts"] = {"points": len(facts), "tags": len(tags),
                                           "taxonomies": sorted({f["taxonomy"] for f in facts})}
            log(f"  xbrl: {len(facts):,} fact points · {len(tags):,} unique tags", "ok")
        except FileNotFoundError:
            log("  xbrl: no companyfacts (non-XBRL filer)", "warn")
            report["datasets"]["facts"] = {"points": 0, "note": "no XBRL"}

    if args.concept:
        tax, _, tg = args.concept.partition(":")
        tax, tg = (tax, tg) if tg else ("us-gaap", tax)
        try:
            doc = fetch_concept(cik, tax, tg)
            write_json(dest / f"concept_{slug(tax)}_{slug(tg)}.json", doc)
            log(f"  concept {tax}/{tg}: {sum(len(v) for v in (doc.get('units') or {}).values())} points", "ok")
        except FileNotFoundError:
            log(f"  concept {tax}/{tg}: not reported", "warn")

    if args.insiders or args.all:
        ledger = fetch_insider_ledger(cik, filings, args.limit)
        wh.upsert("insider_txn", ledger)
        write_csv(dest / "insider_transactions.csv", ledger)
        report["datasets"]["insiders"] = {"transactions": len(ledger),
                                          "owners": len({r["owner_name"] for r in ledger})}
        log(f"  insiders: {len(ledger)} transactions", "ok")

    if args.holdings or args.all:
        pos = fetch_holdings(cik, filings, max(1, args.limit // 10))
        if pos:
            wh.upsert("holding", pos)
            write_csv(dest / "holdings_13f.csv", pos)
            report["datasets"]["holdings"] = {
                "positions": len(pos),
                "periods": sorted({r["period"] for r in pos})[-4:],
                "total_value": sum(r["value"] or 0 for r in pos),
            }
            log(f"  13F: {len(pos)} positions", "ok")

    if args.docs is not None or args.all:
        forms = [f.strip().upper() for f in (args.docs or "10-K,10-Q,8-K").split(",") if f.strip()]
        docs = download_documents(cik, filings, forms, args.limit, dest / "documents")
        write_json(dest / "documents_manifest.json", docs)
        report["datasets"]["documents"] = {"downloaded": len(docs), "forms": forms,
                                           "bytes": sum(d["doc_bytes"] for d in docs)}
        log(f"  documents: {len(docs)} files ({sum(d['doc_bytes'] for d in docs) / 1e6:.1f} MB)", "ok")

    write_json(dest / "_report.json", report)
    wh.log_run("company", json.dumps({"cik": cik, "ticker": ticker}))
    return report


# ------------------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="edgar_extract.py",
        description="The definitive SEC EDGAR extractor — real data, all endpoints, zero deps.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("USAGE\n-----")[1].split("REQUIRED")[0] if "USAGE" in __doc__ else None,
    )
    sub = p.add_subparsers(dest="command", required=True)

    c = sub.add_parser("company", help="extract everything for one or more registrants")
    c.add_argument("identifiers", nargs="+", help="tickers, CIKs or name fragments")
    c.add_argument("--all", action="store_true", help="filings + facts + insiders + holdings + docs")
    c.add_argument("--filings", action="store_true")
    c.add_argument("--facts", action="store_true", help="full XBRL companyfacts")
    c.add_argument("--insiders", action="store_true", help="parse Forms 3/4/5")
    c.add_argument("--holdings", action="store_true", help="parse 13F-HR tables")
    c.add_argument("--docs", nargs="?", const="10-K,10-Q,8-K", default=None,
                   metavar="FORMS", help="download primary docs, e.g. --docs 10-K,DEF 14A")
    c.add_argument("--concept", metavar="TAX:TAG", help="single concept, e.g. us-gaap:Revenues")
    c.add_argument("--limit", type=int, default=60, help="max filings per sub-dataset")
    c.add_argument("--recent-only", action="store_true", help="skip historical archive shards")

    f = sub.add_parser("frames", help="one XBRL tag across every filer for a period")
    f.add_argument("taxonomy"); f.add_argument("tag"); f.add_argument("unit"); f.add_argument("period")

    s = sub.add_parser("search", help="EDGAR full-text search (2001 → present)")
    s.add_argument("query")
    s.add_argument("--forms", default="")
    s.add_argument("--start", default=""); s.add_argument("--end", default="")
    s.add_argument("--pages", type=int, default=3)

    t = sub.add_parser("tape", help="live acceptance feed")
    t.add_argument("--form", default=""); t.add_argument("--count", type=int, default=40)
    t.add_argument("--watch", action="store_true"); t.add_argument("--interval", type=int, default=20)

    sub.add_parser("universe", help="download the full ticker/CIK universe")
    return p


def main(argv: Optional[List[str]] = None) -> int:
    # Windows consoles default to cp1252, which cannot encode the Unicode glyphs
    # used in log/help output; force UTF-8 (no-op elsewhere).
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)

    if not UA or "@" not in UA:
        die('Set a real contact User-Agent first:\n'
            '  export SEC_USER_AGENT="Your Name your@email.com"\n'
            'The SEC rejects requests without one (HTTP 403).')

    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    wh = Warehouse(DB_PATH)
    log(f"output → {OUT}  ·  rate {RATE_PER_SEC}/s  ·  UA {UA[:40]}")

    try:
        if args.command == "universe":
            rows = fetch_universe()
            wh.upsert("universe", rows)
            write_csv(OUT / "universe.csv", rows)
            log(f"universe: {len(rows):,} ticker rows · "
                f"{len({r['cik'] for r in rows}):,} unique CIKs", "ok")

        elif args.command == "company":
            if not any([args.all, args.filings, args.facts, args.insiders,
                        args.holdings, args.docs is not None, args.concept]):
                args.all = True
            reports = [extract_company(wh, ident, args) for ident in args.identifiers]
            write_json(OUT / "_run_report.json", {"at": now_iso(), "reports": reports})

        elif args.command == "frames":
            doc = fetch_frame(args.taxonomy, args.tag, args.unit, args.period)
            rows = [{"taxonomy": args.taxonomy, "tag": args.tag, "unit": args.unit,
                     "period": args.period, "cik": pad_cik(d.get("cik", 0)),
                     "entity": d.get("entityName", ""), "val": d.get("val")}
                    for d in doc.get("data", [])]
            wh.upsert("frame_point", rows)
            name = f"frame_{slug(args.tag)}_{slug(args.period)}"
            write_csv(OUT / f"{name}.csv", rows)
            log(f"frames: {len(rows):,} filers reported {args.tag} for {args.period}", "ok")

        elif args.command == "search":
            hits = full_text_search(args.query, args.forms, args.start, args.end, args.pages)
            write_csv(OUT / f"fts_{slug(args.query)[:40]}.csv", hits)
            write_json(OUT / f"fts_{slug(args.query)[:40]}.json", hits)
            for h in hits[:20]:
                print(f"  {C['yel']}{h['form']:<10}{C['off']} {h['filed']}  "
                      f"{h['company'][:44]:<44} {C['dim']}{h['url']}{C['off']}")
            log(f"full-text: {len(hits)} hits saved", "ok")

        elif args.command == "tape":
            seen: set = set()
            while True:
                for it in reversed(fetch_tape(args.count, args.form)):
                    key = it["url"] or f"{it['company']}{it['accepted']}"
                    if key in seen:
                        continue
                    seen.add(key)
                    print(f"  {C['grn']}{it['accepted'][:19]:<19}{C['off']} "
                          f"{C['yel']}{it['form']:<10}{C['off']} {it['company'][:52]}")
                if not args.watch:
                    break
                time.sleep(args.interval)

    except KeyboardInterrupt:
        log("interrupted", "warn")
    finally:
        wh.close()
        log(f"done · {STATS.summary()}", "ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())