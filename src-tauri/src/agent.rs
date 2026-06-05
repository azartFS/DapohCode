//! Agentic (tool-calling) completion — streaming edition.
//! Streams text content token-by-token via Tauri events ("agent-delta"),
//! accumulates tool calls, and returns the complete AgentResponse when done.
//! Falls back to a non-streaming request if the provider returns an error
//! on the streaming attempt (some NVIDIA-proxied models don't support it).

use std::sync::atomic::Ordering;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::chat::CancelState;

#[derive(Deserialize)]
pub struct AgentRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<serde_json::Value>,
    pub tools: serde_json::Value,
    pub reasoning_effort: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct AgentToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize)]
pub struct AgentResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<AgentToolCall>,
}

#[derive(Serialize, Clone)]
struct AgentDeltaEvent {
    content: String,
}

/// Partial tool-call accumulator used during SSE parsing.
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

/// Sanitize messages so provider APIs don't choke on null content.
fn sanitize_messages(messages: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    messages
        .into_iter()
        .map(|mut m| {
            let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("");
            if (role == "assistant" || role == "tool")
                && m.get("content").map_or(true, |c| c.is_null())
            {
                m["content"] = serde_json::json!("");
            }
            m
        })
        .collect()
}

fn build_body_owned(
    model: &str,
    tools: &serde_json::Value,
    reasoning_effort: &Option<String>,
    messages: &[serde_json::Value],
    stream: bool,
) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "tools": tools,
        "stream": stream,
    });
    if let Some(effort) = reasoning_effort.as_deref() {
        if !effort.trim().is_empty() {
            body["reasoning_effort"] = serde_json::json!(effort);
        }
    }
    body
}

/// Non-streaming completion (kept as internal fallback).
async fn complete_sync(
    url: &str,
    api_key: &str,
    body: serde_json::Value,
) -> Result<AgentResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Запрос не удался: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {text}"));
    }

    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Некорректный ответ: {e}"))?;
    parse_complete_response(&v)
}

fn parse_complete_response(v: &serde_json::Value) -> Result<AgentResponse, String> {
    let msg = &v["choices"][0]["message"];
    let content = msg["content"].as_str().map(|s| s.to_string());
    let mut tool_calls = Vec::new();
    if let Some(arr) = msg["tool_calls"].as_array() {
        for tc in arr {
            let func = &tc["function"];
            tool_calls.push(AgentToolCall {
                id: tc["id"].as_str().unwrap_or_default().to_string(),
                name: func["name"].as_str().unwrap_or_default().to_string(),
                arguments: func["arguments"].as_str().unwrap_or_default().to_string(),
            });
        }
    }
    Ok(AgentResponse { content, tool_calls })
}

/// Streaming agent completion. Emits `agent-delta` events for each content
/// token so the UI can render text progressively. Tool-call deltas are
/// accumulated silently and returned in the final AgentResponse.
///
/// Uses the same CancelState as chat_stream — the stop button works for both.
#[tauri::command]
pub async fn agent_stream(
    app: AppHandle,
    cancel: State<'_, CancelState>,
    req: AgentRequest,
) -> Result<AgentResponse, String> {
    let flag = cancel.0.clone();
    // Don't reset flag here — stop() sets it externally.

    let base = req.base_url.trim_end_matches('/');
    let url = format!("{base}/chat/completions");
    let messages = sanitize_messages(req.messages);

    // Try streaming first.
    let stream_body = build_body_owned(&req.model, &req.tools, &req.reasoning_effort, &messages, true);
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", req.api_key))
        .header("Content-Type", "application/json")
        .json(&stream_body)
        .send()
        .await
        .map_err(|e| format!("Запрос не удался: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        // Some providers reject streaming with tools — fall back to sync.
        let sync_body = build_body_owned(&req.model, &req.tools, &req.reasoning_effort, &messages, false);
        return complete_sync(&url, &req.api_key, sync_body).await;
    }

    // ── Parse SSE stream ──
    let mut byte_stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut content = String::new();
    let mut tool_calls: Vec<PartialToolCall> = Vec::new();

    while let Some(chunk) = byte_stream.next().await {
        if flag.load(Ordering::SeqCst) {
            break;
        }
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => return Err(format!("Ошибка потока: {e}")),
        };
        buf.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf.drain(..=pos);
            if line.is_empty() {
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                // Stream finished.
                return Ok(build_response(content, tool_calls));
            }
            let Ok(json) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };

            let delta = &json["choices"][0]["delta"];

            // Content token
            if let Some(c) = delta.get("content").and_then(|c| c.as_str()) {
                if !c.is_empty() {
                    content.push_str(c);
                    let _ = app.emit(
                        "agent-delta",
                        AgentDeltaEvent {
                            content: c.to_string(),
                        },
                    );
                }
            }

            // Tool-call deltas (incremental accumulation)
            if let Some(tcs) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                for tc in tcs {
                    let idx = tc["index"].as_u64().unwrap_or(0) as usize;
                    while tool_calls.len() <= idx {
                        tool_calls.push(PartialToolCall {
                            id: String::new(),
                            name: String::new(),
                            arguments: String::new(),
                        });
                    }
                    if let Some(id) = tc.get("id").and_then(|i| i.as_str()) {
                        tool_calls[idx].id = id.to_string();
                    }
                    if let Some(name) = tc
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                    {
                        tool_calls[idx].name.push_str(name);
                    }
                    if let Some(args) = tc
                        .get("function")
                        .and_then(|f| f.get("arguments"))
                        .and_then(|a| a.as_str())
                    {
                        tool_calls[idx].arguments.push_str(args);
                    }
                }
            }
        }
    }

    Ok(build_response(content, tool_calls))
}

fn build_response(content: String, tool_calls: Vec<PartialToolCall>) -> AgentResponse {
    AgentResponse {
        content: if content.is_empty() {
            None
        } else {
            Some(content)
        },
        tool_calls: tool_calls
            .into_iter()
            .filter(|tc| !tc.name.is_empty())
            .map(|tc| AgentToolCall {
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
            })
            .collect(),
    }
}

/// Legacy non-streaming agent completion (kept for backward compat).
#[tauri::command]
pub async fn agent_complete(req: AgentRequest) -> Result<AgentResponse, String> {
    let base = req.base_url.trim_end_matches('/');
    let url = format!("{base}/chat/completions");
    let messages = sanitize_messages(req.messages);
    let body = build_body_owned(&req.model, &req.tools, &req.reasoning_effort, &messages, false);
    complete_sync(&url, &req.api_key, body).await
}
