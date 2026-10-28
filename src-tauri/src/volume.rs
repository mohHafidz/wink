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

        loop {
            thread::sleep(Duration::from_millis(80));

            unsafe {
                if let Ok(device_enumerator) =
                    CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
                {
                    if let Ok(default_device) =
                        device_enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)
                    {
                        if let Ok(endpoint_volume) =
                            default_device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
                        {
                            if let Ok(vol_scalar) = endpoint_volume.GetMasterVolumeLevelScalar() {
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
                    }
                }
            }
        }
    });
}
