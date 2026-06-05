mod agent;
mod chat;
mod fs;

use agent::agent_complete;
use chat::{
    cancel_chat, chat_once, chat_stream, list_models, list_reasoning_models, CancelState,
};
use fs::{
    create_entry, delete_entry, read_dir, read_text_file, read_tree, rename_entry,
    search_text, write_text_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CancelState::default())
        .invoke_handler(tauri::generate_handler![
            chat_stream,
            chat_once,
            cancel_chat,
            list_models,
            list_reasoning_models,
            agent_complete,
            read_dir,
            read_text_file,
            write_text_file,
            create_entry,
            rename_entry,
            delete_entry,
            read_tree,
            search_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
