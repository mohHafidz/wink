use std::sync::atomic::{AtomicI32, Ordering};
use std::thread;
use std::time::Duration;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};

static CURRENT_VOLUME: AtomicI32 = AtomicI32::new(50);
static VOLUME_CHANGED_FLAG: AtomicI32 = AtomicI32::new(0);

pub fn get_master_volume_percent() -> i32 {
    CURRENT_VOLUME.load(Ordering::Relaxed)
}

pub fn has_volume_changed() -> bool {
    let flag = VOLUME_CHANGED_FLAG.swap(0, Ordering::Relaxed);
    flag == 1
}

pub fn start_volume_listener() {
    thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        let mut last_vol = -1;
        let mut cached_endpoint: Option<IAudioEndpointVolume> = None;
        let mut enumerator: Option<IMMDeviceEnumerator> = None;

        loop {
            thread::sleep(Duration::from_millis(100));

            unsafe {
                if enumerator.is_none() {
                    enumerator = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL).ok();
                }

                if cached_endpoint.is_none() {
                    if let Some(enum_ref) = enumerator.as_ref() {
                        if let Ok(default_device) = enum_ref.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                            cached_endpoint = default_device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok();
                        }
                    }
                }

                let mut read_success = false;
                if let Some(endpoint) = cached_endpoint.as_ref() {
                    if let Ok(vol_scalar) = endpoint.GetMasterVolumeLevelScalar() {
                        read_success = true;
                        let vol_pct = (vol_scalar * 100.0).round() as i32;

                        if last_vol != -1 && last_vol != vol_pct {
                            // Volume level has changed from physical keys or system slider!
                            CURRENT_VOLUME.store(vol_pct, Ordering::Relaxed);
                            VOLUME_CHANGED_FLAG.store(1, Ordering::Relaxed);
                        } else if last_vol == -1 {
                            CURRENT_VOLUME.store(vol_pct, Ordering::Relaxed);
                        }

                        last_vol = vol_pct;
                    }
                }

                // If reading failed (e.g. device switched/disconnected), invalidate cache to re-acquire next tick
                if !read_success {
                    cached_endpoint = None;
                    thread::sleep(Duration::from_millis(250));
                }
            }
        }
    });
}
