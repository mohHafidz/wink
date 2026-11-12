use serde::{Deserialize, Serialize};
use windows::core::{Interface, GUID, PCWSTR};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, DEVICE_STATE_ACTIVE, IMMDevice, IMMDeviceCollection,
    IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub short_name: String,
    #[serde(rename = "type")]
    pub device_type: String, // "headphone" | "speaker" | "display"
    pub is_default: bool,
}

// PKEY_Device_FriendlyName: {a45c254e-df1c-4efd-8020-67d146a850e0}, 14
const PKEY_DEVICE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 14,
};

#[repr(C)]
struct IPolicyConfigVistaVtbl {
    pub base: windows::core::IUnknown_Vtbl,
    pub get_mix_format: usize,
    pub get_device_format: usize,
    pub reset_device_format: usize,
    pub set_device_format: usize,
    pub get_processing_period: usize,
    pub set_processing_period: usize,
    pub get_share_mode: usize,
    pub set_share_mode: usize,
    pub get_property_value: usize,
    pub set_property_value: usize,
    pub set_default_endpoint: unsafe extern "system" fn(
        this: *mut std::ffi::c_void,
        wsz_device_id: PCWSTR,
        role: i32,
    ) -> windows::core::HRESULT,
    pub set_endpoint_visibility: usize,
}

const CLSID_POLICY_CONFIG: GUID = GUID::from_u128(0x2a07407e_9933_45dd_8803_287bb87b2642);

fn classify_device(name: &str) -> (&'static str, String) {
    let lower = name.to_lowercase();
    let dev_type = if lower.contains("headphone")
        || lower.contains("headset")
        || lower.contains("earphone")
        || lower.contains("earbuds")
        || lower.contains("buds")
        || lower.contains("airpod")
        || lower.contains("cloud")
        || lower.contains("wh-")
        || lower.contains("wf-")
    {
        "headphone"
    } else if lower.contains("display")
        || lower.contains("nvidia")
        || lower.contains("amd high")
        || lower.contains("hdmi")
        || lower.contains("monitor")
        || lower.contains("tv")
        || lower.contains("lg ")
        || lower.contains("dell ")
        || lower.contains("samsung ")
        || lower.contains("asus ")
    {
        "display"
    } else {
        "speaker"
    };

    // Make clean, compact readable name
    let short_name = if let Some(idx) = name.find('(') {
        let inside = &name[idx + 1..];
        if let Some(end) = inside.find(')') {
            inside[..end].trim().to_string()
        } else {
            name.trim().to_string()
        }
    } else {
        name.trim().to_string()
    };

    (dev_type, short_name)
}

pub fn get_audio_endpoints() -> Vec<AudioDeviceInfo> {
    let mut devices = Vec::new();

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator = match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
            Ok(e) => e,
            Err(_) => return devices,
        };

        // Determine current default device ID
        let default_id = if let Ok(default_device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
            if let Ok(pwstr) = default_device.GetId() {
                let id_str = pwstr.to_string().unwrap_or_default();
                CoTaskMemFree(Some(pwstr.as_ptr() as *const _));
                id_str
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        // Enumerate active render endpoints
        let collection: IMMDeviceCollection = match enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return devices,
        };

        let count = match collection.GetCount() {
            Ok(c) => c,
            Err(_) => return devices,
        };

        for i in 0..count {
            let device: IMMDevice = match collection.Item(i) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let id = match device.GetId() {
                Ok(pwstr) => {
                    let s = pwstr.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(pwstr.as_ptr() as *const _));
                    s
                }
                Err(_) => continue,
            };

            let is_default = !default_id.is_empty() && id == default_id;

            let mut friendly_name = String::new();
            if let Ok(store) = device.OpenPropertyStore(STGM_READ) {
                if let Ok(prop) = store.GetValue(&PKEY_DEVICE_FRIENDLY_NAME) {
                    if let Ok(pwstr) = PropVariantToStringAlloc(&prop) {
                        friendly_name = pwstr.to_string().unwrap_or_default();
                        CoTaskMemFree(Some(pwstr.as_ptr() as *const _));
                    }
                }
            }

            if friendly_name.is_empty() {
                friendly_name = format!("Audio Device {}", i + 1);
            }

            let (dev_type, short_name) = classify_device(&friendly_name);

            devices.push(AudioDeviceInfo {
                id,
                name: friendly_name,
                short_name,
                device_type: dev_type.to_string(),
                is_default,
            });
        }
    }

    // Sort: default device first
    devices.sort_by(|a, b| b.is_default.cmp(&a.is_default));

    devices
}

pub fn set_default_audio_endpoint(device_id: &str) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let unknown: windows::core::IUnknown = CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_ALL)
            .map_err(|e| format!("Failed to instantiate IPolicyConfig: {}", e))?;

        let policy_config = unknown.as_raw();
        if policy_config.is_null() {
            return Err("IPolicyConfig pointer is null".to_string());
        }

        let wide_id: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        let pcwstr = PCWSTR(wide_id.as_ptr());

        let vtbl = *(policy_config as *mut *mut IPolicyConfigVistaVtbl);

        // 0: eConsole, 1: eMultimedia, 2: eCommunications
        let hr1 = ((*vtbl).set_default_endpoint)(policy_config, pcwstr, 0);
        let hr2 = ((*vtbl).set_default_endpoint)(policy_config, pcwstr, 1);
        let hr3 = ((*vtbl).set_default_endpoint)(policy_config, pcwstr, 2);

        if hr1.is_err() && hr2.is_err() && hr3.is_err() {
            return Err("Failed to set default audio endpoint in Windows".to_string());
        }

        Ok(())
    }
}
