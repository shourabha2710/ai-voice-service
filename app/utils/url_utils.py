from urllib.parse import urlparse, parse_qsl, urlunparse

SENSITIVE_PARAMS = {"token", "access_token", "auth", "signature", "sig", "session", "cookie", "jwt", "key"}


def sanitize_url_for_logging(raw_url: str, max_len: int = 200) -> str:
    """Redact sensitive query parameters and shorten long URLs for logging.

    Keeps hostname and path, removes or redacts known sensitive query params.
    """
    if not raw_url:
        return ""

    try:
        parsed = urlparse(raw_url)
        qs = dict(parse_qsl(parsed.query, keep_blank_values=True))
        sanitized_qs = []
        for k, v in qs.items():
            if k.lower() in SENSITIVE_PARAMS:
                sanitized_qs.append((k, "[REDACTED]"))
            else:
                sanitized_qs.append((k, v))

        new_query = "&".join([f"{k}={v}" for k, v in sanitized_qs])
        cleaned = parsed._replace(query=new_query)
        out = urlunparse(cleaned)
        if len(out) > max_len:
            out = out[: max_len - 3] + "..."
        return out
    except Exception:
        # Fallback: truncate
        return (raw_url[: max_len - 3] + "...") if len(raw_url) > max_len else raw_url
