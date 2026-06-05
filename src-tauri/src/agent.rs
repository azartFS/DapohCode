//! Agentic (tool-calling) completion. One non-streaming round-trip to an
//! OpenAI-compatible `/chat/completions` endpoint with a `tools` array.
//! Returns the assistant's text (if any) plus any requested tool calls. The
//! agent loop itself lives in the frontend store, which executes tools and
//! calls this again until the model returns a final answer.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct AgentRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    /// Raw OpenAI-format messages (may include assistant.tool_calls and
    /// role:"tool" results), passed straight through.
    pub messages: Vec<serde_json::Value>,
    /// Raw OpenAI-format tools array.
    pub tools: serde_json::Value,
    pub reasoning_effort: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct AgentToolCall {
    pub id: String,
    pub name: String,
    /// Raw JSON-encoded arguments string from the model.
    pub arguments: String,
}

#[derive(Serialize)]
pub struct AgentResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<AgentToolCall>,
}

#[tauri::command]
pub async fn agent_complete(req: AgentRequest) -> Result<AgentResponse, String> {
    let base = req.base_url.trim_end_matches('/');
    let url = format!("{base}/chat/completions");

    // Sanitize messages: ensure assistant content is always a string (some APIs
    // reject `null` in tool-calling turns) and tool results are never null.
    let messages: Vec<serde_json::Value> = req
        .messages
        .into_iter()
        .map(|mut m| {
            if m.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                if m.get("content").map_or(true, |c| c.is_null()) {
                    m["content"] = serde_json::json!("");
                }
            }
            if m.get("role").and_then(|r| r.as_str()) == Some("tool") {
                if m.get("content").map_or(true, |c| c.is_null()) {
                    m["content"] = serde_json::json!("");
                }
            }
            m
        })
        .collect();

    let mut body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "tools": req.tools,
        "stream": false,
    });
    if let Some(effort) = req.reasoning_effort.as_deref() {
        if !effort.trim().is_empty() {
            body["reasoning_effort"] = serde_json::json!(effort);
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", req.api_key))
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

    Ok(AgentResponse {
        content,
        tool_calls,
    })
}
