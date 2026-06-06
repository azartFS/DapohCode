//! Web tools: fetch pages and search the internet via DuckDuckGo.

use regex::Regex;
use serde::{Deserialize, Serialize};

// ── Requests ──

#[derive(Deserialize)]
pub struct WebFetchRequest {
    pub url: String,
    pub max_chars: Option<usize>,
}

#[derive(Deserialize)]
pub struct WebSearchRequest {
    pub query: String,
    pub max_results: Option<usize>,
}

// ── Responses ──

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

// ── HTML → text ──

fn strip_html(html: &str) -> String {
    let mut text = html.to_string();

    // Remove <script>…</script> and <style>…</style>
    let script_re = Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    text = script_re.replace_all(&text, " ").to_string();
    let style_re = Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    text = style_re.replace_all(&text, " ").to_string();

    // Block elements → newline
    let block_re = Regex::new(r"(?i)</?(p|div|br|h[1-6]|li|tr|blockquote|hr|pre)[^>]*>").unwrap();
    text = block_re.replace_all(&text, "\n").to_string();

    // Strip all remaining tags
    let tag_re = Regex::new(r"<[^>]+>").unwrap();
    text = tag_re.replace_all(&text, "").to_string();

    // Decode common entities
    text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
        .replace("&nbsp;", " ");

    // Collapse whitespace, preserve single newlines
    let ws_re = Regex::new(r"[^\S\n]+").unwrap();
    text = ws_re.replace_all(&text, " ").to_string();
    let nl_re = Regex::new(r"\n{3,}").unwrap();
    text = nl_re.replace_all(&text, "\n\n").to_string();

    text.trim().to_string()
}

fn build_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/131.0.0.0 Safari/537.36",
        )
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())
}

// ── Commands ──

#[tauri::command]
pub async fn web_fetch(req: WebFetchRequest) -> Result<String, String> {
    let max = req.max_chars.unwrap_or(30_000);
    let client = build_client(30)?;

    let resp = client
        .get(&req.url)
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }

    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = resp.text().await.map_err(|e| format!("Read error: {e}"))?;

    let text = if ct.contains("html") {
        strip_html(&body)
    } else {
        body
    };

    if text.len() > max {
        Ok(format!(
            "{}…\n[truncated to {} chars]",
            &text[..max],
            max
        ))
    } else {
        Ok(text)
    }
}

#[tauri::command]
pub async fn web_search(req: WebSearchRequest) -> Result<Vec<SearchResult>, String> {
    let max = req.max_results.unwrap_or(8).min(15);
    let client = build_client(15)?;

    // DuckDuckGo HTML search
    let resp = client
        .get("https://html.duckduckgo.com/html/")
        .query(&[("q", &req.query)])
        .send()
        .await
        .map_err(|e| format!("Search failed: {e}"))?;

    let html = resp.text().await.map_err(|e| e.to_string())?;

    // Parse results: <a class="result__a" href="URL">TITLE</a>
    // Snippet:  <a class="result__snippet" …>SNIPPET</a>
    let link_re =
        Regex::new(r#"<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>(.*?)</a>"#).unwrap();
    let snip_re =
        Regex::new(r#"<a[^>]+class="result__snippet"[^>]*>(.*?)</a>"#).unwrap();

    let links: Vec<_> = link_re.captures_iter(&html).collect();
    let snips: Vec<_> = snip_re.captures_iter(&html).collect();

    let tag_re = Regex::new(r"<[^>]+>").unwrap();

    let mut results = Vec::new();
    for (i, cap) in links.iter().enumerate() {
        if results.len() >= max {
            break;
        }
        let raw_url = cap[1].to_string();
        let title = tag_re.replace_all(&cap[2], "").trim().to_string();
        let snippet = if i < snips.len() {
            tag_re
                .replace_all(&snips[i][1], "")
                .trim()
                .to_string()
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&nbsp;", " ")
        } else {
            String::new()
        };

        // DuckDuckGo wraps URLs in a redirect — extract the real URL
        let url = if raw_url.contains("uddg=") {
            // Extract from //duckduckgo.com/l/?uddg=ENCODED_URL&...
            if let Some(start) = raw_url.find("uddg=") {
                let rest = &raw_url[start + 5..];
                let end = rest.find('&').unwrap_or(rest.len());
                urldecode(&rest[..end])
            } else {
                raw_url
            }
        } else {
            raw_url
        };

        if title.is_empty() || url.is_empty() {
            continue;
        }

        results.push(SearchResult {
            title: title
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'"),
            url,
            snippet,
        });
    }

    if results.is_empty() {
        // Fallback: try DuckDuckGo instant answer API
        let api_resp = client
            .get("https://api.duckduckgo.com/")
            .query(&[
                ("q", req.query.as_str()),
                ("format", "json"),
                ("no_html", "1"),
                ("skip_disambig", "1"),
            ])
            .send()
            .await
            .ok();

        if let Some(resp) = api_resp {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(abstract_text) = json["AbstractText"].as_str() {
                    if !abstract_text.is_empty() {
                        results.push(SearchResult {
                            title: json["Heading"]
                                .as_str()
                                .unwrap_or("Result")
                                .to_string(),
                            url: json["AbstractURL"]
                                .as_str()
                                .unwrap_or("")
                                .to_string(),
                            snippet: abstract_text.to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}

/// Simple percent-decoding (no external crate).
fn urldecode(s: &str) -> String {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                &String::from_utf8_lossy(&bytes[i + 1..i + 3]),
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}
