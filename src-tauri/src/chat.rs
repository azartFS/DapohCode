use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

/// Shared cancellation flag. A single in-flight chat is assumed for now (MVP);
/// `cancel_chat` flips the flag and the streaming loop stops at the next chunk.
#[derive(Default)]
pub struct CancelState(pub Arc<AtomicBool>);

#[derive(Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub request_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    /// OpenAI-style reasoning effort ("minimal"/"low"/"medium"/"high").
    /// None / empty = don't send the parameter.
    pub reasoning_effort: Option<String>,
}

#[derive(Serialize, Clone)]
struct DeltaEvent {
    request_id: String,
    content: String,
}

#[derive(Serialize, Clone)]
struct DoneEvent {
    request_id: String,
}

#[derive(Serialize, Clone)]
struct ErrorEvent {
    request_id: String,
    message: String,
}

fn emit_error(app: &AppHandle, request_id: &str, message: String) -> String {
    let _ = app.emit(
        "chat-error",
        ErrorEvent {
            request_id: request_id.to_string(),
            message: message.clone(),
        },
    );
    message
}

fn emit_done(app: &AppHandle, request_id: &str) {
    let _ = app.emit(
        "chat-done",
        DoneEvent {
            request_id: request_id.to_string(),
        },
    );
}

/// Stream a chat completion from any OpenAI-compatible `/chat/completions`
/// endpoint. Emits `chat-delta` for each token chunk, then `chat-done`, or
/// `chat-error` on failure. Cancellation is cooperative via `CancelState`.
#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    cancel: State<'_, CancelState>,
    req: ChatRequest,
) -> Result<(), String> {
    let flag = cancel.0.clone();
    flag.store(false, Ordering::SeqCst);

    let base = req.base_url.trim_end_matches('/');
    let url = format!("{base}/chat/completions");

    let messages: Vec<serde_json::Value> = req
        .messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "stream": true,
    });
    if let Some(t) = req.temperature {
        body["temperature"] = serde_json::json!(t);
    }
    if let Some(effort) = req.reasoning_effort.as_deref() {
        if !effort.trim().is_empty() {
            body["reasoning_effort"] = serde_json::json!(effort);
        }
    }

    let client = reqwest::Client::new();
    let resp = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", req.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return Err(emit_error(&app, &req.request_id, format!("Запрос не удался: {e}"))),
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(emit_error(
            &app,
            &req.request_id,
            format!("HTTP {status}: {text}"),
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if flag.load(Ordering::SeqCst) {
            emit_done(&app, &req.request_id);
            return Ok(());
        }

        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                return Err(emit_error(
                    &app,
                    &req.request_id,
                    format!("Ошибка потока: {e}"),
                ))
            }
        };
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // Drain complete lines; keep any partial trailing line in `buf`.
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
                emit_done(&app, &req.request_id);
                return Ok(());
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !content.is_empty() {
                        let _ = app.emit(
                            "chat-delta",
                            DeltaEvent {
                                request_id: req.request_id.clone(),
                                content: content.to_string(),
                            },
                        );
                    }
                }
            }
        }
    }

    emit_done(&app, &req.request_id);
    Ok(())
}

#[tauri::command]
pub fn cancel_chat(cancel: State<'_, CancelState>) {
    cancel.0.store(true, Ordering::SeqCst);
}

#[derive(Deserialize)]
pub struct ListModelsRequest {
    pub base_url: String,
    pub api_key: String,
}

/// List the models available from any OpenAI-compatible provider via `GET
/// /models`. Returns the model ids (sorted). Used to auto-populate the catalog
/// after the user enters their API key — same idea as opencode.
#[tauri::command]
pub async fn list_models(req: ListModelsRequest) -> Result<Vec<String>, String> {
    let base = req.base_url.trim_end_matches('/');
    let url = format!("{base}/models");

    let client = reqwest::Client::new();
    let mut request = client.get(&url).header("Content-Type", "application/json");
    if !req.api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", req.api_key));
    }

    let resp = request
        .send()
        .await
        .map_err(|e| format!("Запрос не удался: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора ответа: {e}"))?;

    let mut ids: Vec<String> = Vec::new();
    // OpenAI shape: { "data": [ { "id": "..." }, ... ] }
    if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
        for m in arr {
            if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                ids.push(id.to_string());
            }
        }
    } else if let Some(arr) = json.as_array() {
        // Some providers return a bare array.
        for m in arr {
            if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                ids.push(id.to_string());
            } else if let Some(id) = m.as_str() {
                ids.push(id.to_string());
            }
        }
    }

    // Drop obvious non-chat models (embeddings, rerankers, ASR/TTS, safety,
    // image/diffusion, retrieval, reward). These pollute the chat picker and
    // 404/error when used as chat completions.
    ids.retain(|id| is_chat_model(id));

    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// Heuristic: keep models that are plausibly chat/completion models.
fn is_chat_model(id: &str) -> bool {
    let n = id.to_lowercase();
    const JUNK: &[&str] = &[
        "embed",
        "embedding",
        "rerank",
        "retriev",
        "reward",
        "whisper",
        "tts",
        "text-to-speech",
        "speech",
        "-stt",
        "asr",
        "audio",
        "voice",
        "canary",
        "parakeet",
        "fastpitch",
        "riva",
        "moderation",
        "guard",
        "safety",
        "ocr",
        "diffusion",
        "sdxl",
        "stable-diffusion",
        "flux",
        "dall-e",
        "clip",
        "bge",
        "maxine",
    ];
    !JUNK.iter().any(|j| n.contains(j))
}

#[derive(Deserialize)]
pub struct ReasoningModelsRequest {
    /// Optional override; defaults to the public models.dev catalogue.
    pub url: Option<String>,
}

/// Fetch the set of model ids that support reasoning, using the models.dev
/// catalogue (same source opencode uses). Returns both the catalogue keys and
/// each model's `id` field, so callers can match either the full id or the
/// short name. Best-effort: returns an empty list on any failure.
#[tauri::command]
pub async fn list_reasoning_models(req: ReasoningModelsRequest) -> Result<Vec<String>, String> {
    let url = req
        .url
        .unwrap_or_else(|| "https://models.dev/api.json".to_string());

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Запрос не удался: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора ответа: {e}"))?;

    let mut out: Vec<String> = Vec::new();
    // Shape: { "<providerId>": { "models": { "<modelKey>": { "id": "...",
    //          "reasoning": true|false, ... } } }, ... }
    if let Some(providers) = json.as_object() {
        for (_pid, pval) in providers {
            let Some(models) = pval.get("models").and_then(|m| m.as_object()) else {
                continue;
            };
            for (mkey, mval) in models {
                let reasoning = mval
                    .get("reasoning")
                    .and_then(|r| r.as_bool())
                    .unwrap_or(false);
                if !reasoning {
                    continue;
                }
                out.push(mkey.clone());
                if let Some(id) = mval.get("id").and_then(|i| i.as_str()) {
                    out.push(id.to_string());
                }
            }
        }
    }

    out.sort();
    out.dedup();
    Ok(out)
}

#[derive(Deserialize)]
pub struct OnceRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
}

/// Non-streaming single completion. Used for short helper calls such as
/// auto-generating a chat title. Returns the assistant message content.
#[tauri::command]
pub async fn chat_once(req: OnceRequest) -> Result<String, String> {
    let base = req.base_url.trim_end_matches('/');
    let url = format!("{base}/chat/completions");

    let messages: Vec<serde_json::Value> = req
        .messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "stream": false,
    });
    if let Some(t) = req.temperature {
        body["temperature"] = serde_json::json!(t);
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

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора ответа: {e}"))?;

    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    Ok(content)
}
