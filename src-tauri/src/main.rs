#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {info}\n");
        let _ = std::fs::write("C:\\Users\\Osman\\OneDrive\\Desktop\\projelerim\\apps\\web-shooter\\panic.log", &msg);
        let _ = std::fs::write(std::env::temp_dir().join("jagwey_panic.log"), &msg);
    }));
    jagwey_lib::run();
}
