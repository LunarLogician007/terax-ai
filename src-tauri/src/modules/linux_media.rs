//! Linux only (TOSS Terminal): WebKitGTK has no permission prompt and refuses
//! getUserMedia unless the app answers, so dictation's microphone would always
//! be denied. Turn media streams on for the main webview and grant requests
//! for the microphone alone; anything asking for a camera is refused. The web
//! preview's iframes can't ask at all: their `allow` list has no microphone.

use tauri::WebviewWindow;
use webkit2gtk::{
    glib::prelude::*, PermissionRequestExt, SettingsExt, UserMediaPermissionRequest,
    UserMediaPermissionRequestExt, WebViewExt,
};

pub fn allow_microphone(window: &WebviewWindow) {
    let _ = window.with_webview(|webview| {
        let view = webview.inner();
        if let Some(settings) = view.settings() {
            settings.set_enable_media_stream(true);
        }
        view.connect_permission_request(|_, request| {
            let Some(media) = request.downcast_ref::<UserMediaPermissionRequest>() else {
                // Not a media request: leave it to WebKit's default.
                return false;
            };
            if media.is_for_audio_device() && !media.is_for_video_device() {
                request.allow();
            } else {
                request.deny();
            }
            true
        });
    });
}
