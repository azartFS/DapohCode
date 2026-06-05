//! Shell command execution for the agent. Runs a command inside the project
//! directory and captures stdout + stderr. Has a hard timeout to prevent
//! runaway processes. This is intentionally simple (no PTY, no streaming) —
//! the agent gets the full output once the command finishes.

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;

/// Hard limit on command runtime (seconds).
const DEFAULT_TIMEOUT_SECS: u64 = 120;
/// Hard cap on combined output size (bytes).
const MAX_OUTPUT_BYTES: usize = 200_000;

#[derive(Deserialize)]
pub struct RunCommandRequest {
    pub command: String,
    pub cwd: String,
    pub timeout_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct RunCommandResult {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

fn clamp(s: String, max: usize) -> String {
    if s.len() <= max {
        s
    } else {
        let mut out = s[..max].to_string();
        out.push_str("\n…[обрезано]");
        out
    }
}

/// Execute a shell command inside `cwd` with a timeout. Returns combined
/// output. On Windows uses `cmd /C`, on Unix uses `sh -c`.
#[tauri::command]
pub async fn run_command(req: RunCommandRequest) -> Result<RunCommandResult, String> {
    let timeout = Duration::from_secs(
        req.timeout_secs
            .unwrap_or(DEFAULT_TIMEOUT_SECS)
            .min(300),
    );

    let child = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &req.command])
            .current_dir(&req.cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    } else {
        Command::new("sh")
            .args(["-c", &req.command])
            .current_dir(&req.cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    };

    let mut child = child.map_err(|e| format!("Не удалось запустить команду: {e}"))?;

    // Wait with timeout using a background thread.
    let result = tokio::task::spawn_blocking(move || {
        // Use wait_timeout via a polling loop since std doesn't have wait_timeout.
        let start = std::time::Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut stdout_buf = Vec::new();
                    let mut stderr_buf = Vec::new();
                    if let Some(mut out) = child.stdout.take() {
                        use std::io::Read;
                        let _ = out.read_to_end(&mut stdout_buf);
                    }
                    if let Some(mut err) = child.stderr.take() {
                        use std::io::Read;
                        let _ = err.read_to_end(&mut stderr_buf);
                    }
                    return RunCommandResult {
                        exit_code: status.code(),
                        stdout: clamp(
                            String::from_utf8_lossy(&stdout_buf).to_string(),
                            MAX_OUTPUT_BYTES,
                        ),
                        stderr: clamp(
                            String::from_utf8_lossy(&stderr_buf).to_string(),
                            MAX_OUTPUT_BYTES,
                        ),
                        timed_out: false,
                    };
                }
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return RunCommandResult {
                            exit_code: None,
                            stdout: String::new(),
                            stderr: format!(
                                "Таймаут: команда не завершилась за {} сек.",
                                timeout.as_secs()
                            ),
                            timed_out: true,
                        };
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    return RunCommandResult {
                        exit_code: None,
                        stdout: String::new(),
                        stderr: format!("Ошибка ожидания: {e}"),
                        timed_out: false,
                    };
                }
            }
        }
    })
    .await
    .map_err(|e| format!("Ошибка выполнения: {e}"))?;

    Ok(result)
}
