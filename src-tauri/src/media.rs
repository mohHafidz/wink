use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaTrackInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub position: u64,
    pub is_playing: bool,
    pub cover: Option<String>,
}

pub enum MediaCommand {
    GetInfo(Sender<Result<Option<MediaTrackInfo>, String>>),
    TogglePlayPause(Sender<Result<(), String>>),
    SkipNext(Sender<Result<(), String>>),
    SkipPrevious(Sender<Result<(), String>>),
    Seek(u64, Sender<Result<(), String>>),
}

static COMMAND_SENDER: Mutex<Option<Sender<MediaCommand>>> = Mutex::new(None);

pub fn init_media_worker() {
    let (tx, rx) = channel::<MediaCommand>();
    {
        let mut sender_lock = COMMAND_SENDER.lock().unwrap();
        *sender_lock = Some(tx);
    }

    thread::spawn(move || {
        // Local single-threaded Tokio runtime to drive Windows async futures on this dedicated thread
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        while let Ok(cmd) = rx.recv() {
            match cmd {
                MediaCommand::GetInfo(reply) => {
                    let res = rt.block_on(fetch_media_track_internal());
                    let _ = reply.send(res);
                }
                MediaCommand::TogglePlayPause(reply) => {
                    let res = rt.block_on(toggle_play_pause_internal());
                    let _ = reply.send(res);
                }
                MediaCommand::SkipNext(reply) => {
                    let res = rt.block_on(skip_next_internal());
                    let _ = reply.send(res);
                }
                MediaCommand::SkipPrevious(reply) => {
                    let res = rt.block_on(skip_previous_internal());
                    let _ = reply.send(res);
                }
                MediaCommand::Seek(pos, reply) => {
                    let res = rt.block_on(seek_internal(pos));
                    let _ = reply.send(res);
                }
            }
        }
    });
}

async fn get_active_session() -> Result<Option<GlobalSystemMediaTransportControlsSession>, String> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| format!("Failed to request session manager: {:?}", e))?
        .await
        .map_err(|e| format!("Async get manager failed: {:?}", e))?;

    // 1. First priority: Check all available sessions to find one that is actively PLAYING.
    // This prevents background music (e.g. Spotify) from being overtaken by a paused YouTube tab in the foreground.
    if let Ok(sessions) = manager.GetSessions() {
        for s in sessions {
            if let Ok(info) = s.GetPlaybackInfo() {
                if let Ok(status) = info.PlaybackStatus() {
                    if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                        return Ok(Some(s));
                    }
                }
            }
        }
    }

    // 2. Second priority (Fallback): If no session is currently playing, return the system default current session
    let session = manager.GetCurrentSession().ok();
    Ok(session)
}

async fn fetch_media_track_internal() -> Result<Option<MediaTrackInfo>, String> {
    let session = match get_active_session().await? {
        Some(s) => s,
        None => return Ok(None),
    };

    let media_props = session
        .TryGetMediaPropertiesAsync()
        .map_err(|e| format!("Failed to get media props async: {:?}", e))?
        .await
        .map_err(|e| format!("Async get props failed: {:?}", e))?;

    let title = media_props.Title().map(|s| s.to_string()).unwrap_or_default();
    let artist = media_props.Artist().map(|s| s.to_string()).unwrap_or_default();
    let album = media_props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();

    let playback_info = session.GetPlaybackInfo().ok();
    let is_playing = playback_info
        .and_then(|info| info.PlaybackStatus().ok())
        .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);

    let timeline = session.GetTimelineProperties().ok();
    let position = timeline
        .as_ref()
        .and_then(|t| t.Position().ok())
        .map(|pos| (pos.Duration / 10_000_000) as u64)
        .unwrap_or(0);

    let duration = timeline
        .as_ref()
        .and_then(|t| t.EndTime().ok())
        .map(|end| (end.Duration / 10_000_000) as u64)
        .unwrap_or(0);

    let mut cover: Option<String> = None;
    if let Ok(thumbnail_ref) = media_props.Thumbnail() {
        if let Ok(async_op) = thumbnail_ref.OpenReadAsync() {
            if let Ok(stream) = async_op.await {
                if let Ok(size) = stream.Size() {
                    if size > 0 && size < 10_000_000 {
                        if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                            if let Ok(async_load) = reader.LoadAsync(size as u32) {
                                if async_load.await.is_ok() {
                                    let mut bytes = vec![0u8; size as usize];
                                    if reader.ReadBytes(&mut bytes).is_ok() {
                                        let b64 = STANDARD.encode(&bytes);
                                        cover = Some(format!("data:image/jpeg;base64,{}", b64));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(Some(MediaTrackInfo {
        title,
        artist,
        album,
        duration,
        position,
        is_playing,
        cover,
    }))
}

async fn toggle_play_pause_internal() -> Result<(), String> {
    if let Some(session) = get_active_session().await? {
        let op = session.TryTogglePlayPauseAsync().map_err(|e| format!("{:?}", e))?;
        let _ = op.await;
    }
    Ok(())
}

async fn skip_next_internal() -> Result<(), String> {
    if let Some(session) = get_active_session().await? {
        let op = session.TrySkipNextAsync().map_err(|e| format!("{:?}", e))?;
        let _ = op.await;
    }
    Ok(())
}

async fn skip_previous_internal() -> Result<(), String> {
    if let Some(session) = get_active_session().await? {
        let op = session.TrySkipPreviousAsync().map_err(|e| format!("{:?}", e))?;
        let _ = op.await;
    }
    Ok(())
}

async fn seek_internal(pos: u64) -> Result<(), String> {
    if let Some(session) = get_active_session().await? {
        let units = (pos as i64) * 10_000_000;
        let op = session
            .TryChangePlaybackPositionAsync(units)
            .map_err(|e| format!("{:?}", e))?;
        let _ = op.await;
    }
    Ok(())
}

// Public API called from Tauri commands (safe, Send + Sync)
pub fn fetch_media_track() -> Result<Option<MediaTrackInfo>, String> {
    let (tx, rx) = channel();
    let sender = COMMAND_SENDER
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Media worker not initialized".to_string())?;

    sender
        .send(MediaCommand::GetInfo(tx))
        .map_err(|e| format!("Failed to send to media worker: {:?}", e))?;

    rx.recv()
        .map_err(|e| format!("Failed to receive from media worker: {:?}", e))?
}

pub fn toggle_play_pause() -> Result<(), String> {
    let (tx, rx) = channel();
    let sender = COMMAND_SENDER
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Media worker not initialized".to_string())?;

    sender
        .send(MediaCommand::TogglePlayPause(tx))
        .map_err(|e| format!("{:?}", e))?;

    rx.recv().map_err(|e| format!("{:?}", e))?
}

pub fn skip_next() -> Result<(), String> {
    let (tx, rx) = channel();
    let sender = COMMAND_SENDER
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Media worker not initialized".to_string())?;

    sender
        .send(MediaCommand::SkipNext(tx))
        .map_err(|e| format!("{:?}", e))?;

    rx.recv().map_err(|e| format!("{:?}", e))?
}

pub fn skip_previous() -> Result<(), String> {
    let (tx, rx) = channel();
    let sender = COMMAND_SENDER
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Media worker not initialized".to_string())?;

    sender
        .send(MediaCommand::SkipPrevious(tx))
        .map_err(|e| format!("{:?}", e))?;

    rx.recv().map_err(|e| format!("{:?}", e))?
}

pub fn seek(position_seconds: u64) -> Result<(), String> {
    let (tx, rx) = channel();
    let sender = COMMAND_SENDER
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Media worker not initialized".to_string())?;

    sender
        .send(MediaCommand::Seek(position_seconds, tx))
        .map_err(|e| format!("{:?}", e))?;

    rx.recv().map_err(|e| format!("{:?}", e))?
}
