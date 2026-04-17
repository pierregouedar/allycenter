/**
 * Ally Center - Decky Loader Plugin for ROG Ally
 * Copyright (c) 2024 Keith Baker / Pixel Addict Games
 * Licensed under MIT
 */

import {
  definePlugin,
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  SliderField,
  ToggleField,
  DropdownItem,
  staticClasses,
  Focusable,
  DialogButton,
  showModal,
  ModalRoot,
  ConfirmModal,
  Navigation,
} from "@decky/ui";
import { callable, toaster, routerHook } from "@decky/api";
const { useState, useEffect, useRef, useMemo } = window.SP_REACT;
type VFC<P = {}> = (props: P) => JSX.Element | null;
type FC<P = {}> = (props: P) => JSX.Element | null;

import { t, TranslationKey, DEFAULT_FAN_MODE_LABEL_KEY } from "./i18n";

// Simple event emitter for download mode state management
class DownloadModeState {
  private active: boolean = false;
  private callbacks: Set<(active: boolean) => void> = new Set();

  isActive(): boolean {
    return this.active;
  }

  setActive(value: boolean): void {
    this.active = value;
    this.callbacks.forEach((cb) => cb(value));
  }

  subscribe(callback: (active: boolean) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
}

// Global state for download mode overlay
const downloadModeState = new DownloadModeState();

// Full-screen black overlay for download mode
// Uses high z-index and fixed positioning to cover the entire screen
const BlackScreenOverlay: FC<{ stateManager: DownloadModeState }> = ({
  stateManager,
}) => {
  const [isVisible, setIsVisible] = useState(stateManager.isActive());

  useEffect(() => {
    return stateManager.subscribe(setIsVisible);
  }, [stateManager]);

  if (!isVisible) {
    return null;
  }

  // Render a full-screen black div with maximum z-index to cover everything
  // On OLED screens, pure black (#000000) means pixels are completely off
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "#000000",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    />
  );
};

const getDeviceInfo = callable<[], DeviceInfo>("get_device_info");
const getBatteryInfo = callable<[], BatteryInfo>("get_battery_info");
const setChargeLimit = callable<[number], boolean>("set_charge_limit");
const getRgbState = callable<[], RgbState>("get_rgb_state");
const setRgbColor = callable<[string], boolean>("set_rgb_color");
const setRgbBrightness = callable<[number], boolean>("set_rgb_brightness");
const setRgbEffect = callable<[string], boolean>("set_rgb_effect");
const setRgbSpeed = callable<[number], boolean>("set_rgb_speed");
const setRgbEnabled = callable<[boolean], boolean>("set_rgb_enabled");
const getPerformanceProfiles = callable<[], ProfilesData>(
  "get_performance_profiles"
);
const setPerformanceProfile = callable<[string], boolean>(
  "set_performance_profile"
);
const getCurrentTdp = callable<[], TdpInfo>("get_current_tdp");
const getScreenState = callable<[], ScreenState>("get_screen_state");
const setScreenState = callable<[boolean], boolean>("set_screen_state");
const toggleScreen = callable<[], boolean>("toggle_screen");
const getFanInfo = callable<[], FanInfo>("get_fan_info");
const setFanMode = callable<[string], boolean>("set_fan_mode");
const getTdpSettings = callable<[], TdpSettings>("get_tdp_settings");
const setTdp = callable<[number], boolean>("set_tdp");
const getChargeLimit = callable<[], ChargeLimitInfo>("get_charge_limit");
const setTdpOverride = callable<[boolean], boolean>("set_tdp_override");
const getCpuSettings = callable<[], CpuSettings>("get_cpu_settings");
const setSmtEnabled = callable<[boolean], boolean>("set_smt_enabled");
const setCpuBoostEnabled = callable<[boolean], boolean>(
  "set_cpu_boost_enabled"
);
const getFanDiagnostics = callable<[], FanDiagnostics>("get_fan_diagnostics");
const setUseExternalTdp = callable<[boolean], boolean>("set_use_external_tdp");

interface DeviceInfo {
  model: string;
  bios_version: string;
  serial: string;
  cpu: string;
  gpu: string;
  kernel: string;
  memory_total: string;
}

interface BatteryInfo {
  present: boolean;
  status: string;
  capacity: number;
  health: number;
  cycle_count: number;
  voltage: number;
  current: number;
  temperature: number;
  design_capacity: number;
  full_capacity: number;
  charge_limit: number;
}

interface RgbState {
  enabled: boolean;
  color: string;
  brightness: number;
  effect: string;
  speed: number;
  available: boolean;
}

interface PerformanceProfile {
  name: string;
  tdp: number;
  gpu_clock: number;
  fan_curve: string;
  description: string;
}

interface ProfilesData {
  profiles: Record<string, PerformanceProfile>;
  current: string;
}

interface TdpInfo {
  tdp: number;
  gpu_clock: number;
  cpu_temp: number;
  gpu_temp: number;
}

interface ScreenState {
  screen_off: boolean;
  brightness: number;
}

interface FanInfo {
  mode: string;
  speed: number;
  available: boolean;
  policy_path?: string;
  current_policy?: number;
}

interface FanDiagnostics {
  asus_wmi_exists: boolean;
  throttle_policy_path: string;
  throttle_policy_value: number;
  fan_boost_mode_path: string;
  fan_boost_mode_value: number;
  fan_curve_enable_path: string;
  available_files: string[];
}

interface TdpSettings {
  tdp: number;
  min: number;
  max: number;
  tdp_override: boolean;
  use_external_tdp: boolean;
  available: boolean;
}

interface ChargeLimitInfo {
  limit: number;
  available: boolean;
}

interface CpuSettings {
  smt_enabled: boolean;
  smt_available: boolean;
  boost_enabled: boolean;
  boost_available: boolean;
}

const COLOR_PRESETS: ReadonlyArray<{ labelKey: TranslationKey; color: string }> = [
  { labelKey: "rogRed", color: "#FF0000" },
  { labelKey: "cyan", color: "#00FFFF" },
  { labelKey: "purple", color: "#8B00FF" },
  { labelKey: "green", color: "#00FF00" },
  { labelKey: "orange", color: "#FF8000" },
  { labelKey: "pink", color: "#FF00FF" },
  { labelKey: "white", color: "#FFFFFF" },
  { labelKey: "blue", color: "#0000FF" },
];

const RGB_EFFECTS: ReadonlyArray<{ data: string; labelKey: TranslationKey }> = [
  { data: "static", labelKey: "static" },
  { data: "pulse", labelKey: "pulse" },
  { data: "spectrum", labelKey: "spectrum" },
  { data: "wave", labelKey: "wave" },
  { data: "flash", labelKey: "flash" },
  { data: "battery", labelKey: "batteryLevel" },
  { data: "off", labelKey: "off" },
];

const sectionStyle: React.CSSProperties = {
  marginBottom: "10px",
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "4px 0",
  fontSize: "12px",
};

const labelStyle: React.CSSProperties = {
  color: "#8b929a",
};

const valueStyle: React.CSSProperties = {
  color: "#ffffff",
  fontWeight: "bold",
};

const colorSwatchStyle = (
  color: string,
  selected: boolean
): React.CSSProperties => ({
  width: "28px",
  height: "28px",
  borderRadius: "4px",
  backgroundColor: color,
  border: selected ? "2px solid #1a9fff" : "2px solid transparent",
  cursor: "pointer",
  margin: "2px",
});

const colorGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
  padding: "8px 0",
};

const batteryBarStyle = (health: number): React.CSSProperties => ({
  width: "100%",
  height: "8px",
  backgroundColor: "#2a2a2a",
  borderRadius: "4px",
  overflow: "hidden",
  marginTop: "4px",
});

const batteryFillStyle = (
  value: number,
  color: string
): React.CSSProperties => ({
  width: `${value}%`,
  height: "100%",
  backgroundColor: color,
  borderRadius: "4px",
  transition: "width 0.3s ease",
});

const profileCardStyle = (selected: boolean): React.CSSProperties => ({
  padding: "12px",
  marginBottom: "8px",
  backgroundColor: selected ? "#1a3a5c" : "#1a1a1a",
  borderRadius: "8px",
  border: selected ? "1px solid #1a9fff" : "1px solid #333",
  cursor: "pointer",
});

const screenOffButtonStyle = (isOff: boolean): React.CSSProperties => ({
  backgroundColor: isOff ? "#ff4444" : "#1a9fff",
  padding: "16px",
  borderRadius: "8px",
  textAlign: "center",
  cursor: "pointer",
});

let cachedDeviceInfo: DeviceInfo | null = null;

const DeviceInfoModal: VFC<{
  closeModal: () => void;
  deviceInfo: DeviceInfo | null;
}> = ({ closeModal, deviceInfo }) => {
  return (
    <ConfirmModal
      onEscKeypress={closeModal}
      onOK={closeModal}
      strOKButtonText={t("close")}
      bHideCloseIcon={true}
      bAlertDialog={true}
    >
      <div style={{ textAlign: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "18px", fontWeight: "bold", color: "#fff" }}>
          {t("deviceInformation")}
        </div>
        <div style={{ fontSize: "12px", color: "#1a9fff" }}>
          {deviceInfo?.model || t("rogAlly")}
        </div>
      </div>
      <div>
        <div style={{ color: "#8b929a", fontSize: "11px", marginBottom: "4px" }}>
          {t("hardware")}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ color: "#8b929a", fontSize: "12px" }}>CPU</span>
          <span style={{ color: "#fff", fontSize: "11px" }}>
            {deviceInfo?.cpu || t("unknown")}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ color: "#8b929a", fontSize: "12px" }}>GPU</span>
          <span style={{ color: "#fff", fontSize: "12px" }}>
            {deviceInfo?.gpu || t("unknown")}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ color: "#8b929a", fontSize: "12px" }}>{t("memory")}</span>
          <span style={{ color: "#fff", fontSize: "12px" }}>
            {deviceInfo?.memory_total || t("unknown")}
          </span>
        </div>
        <div style={{ color: "#8b929a", fontSize: "11px", marginBottom: "4px" }}>
          {t("system")}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ color: "#8b929a", fontSize: "12px" }}>BIOS</span>
          <span style={{ color: "#fff", fontSize: "12px" }}>
            {deviceInfo?.bios_version || t("unknown")}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#8b929a", fontSize: "12px" }}>{t("kernel")}</span>
          <span style={{ color: "#fff", fontSize: "11px" }}>
            {deviceInfo?.kernel || t("unknown")}
          </span>
        </div>
      </div>
    </ConfirmModal>
  );
};

// ==================== Device Info Section ====================
const DeviceInfoSection: VFC = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(
    cachedDeviceInfo
  );
  const [loading, setLoading] = useState(!cachedDeviceInfo);

  useEffect(() => {
    if (cachedDeviceInfo) {
      setDeviceInfo(cachedDeviceInfo);
      setLoading(false);
      return;
    }
    const fetchInfo = async () => {
      try {
        const info = await getDeviceInfo();
        cachedDeviceInfo = info;
        setDeviceInfo(info);
      } catch (e) {
        console.error("Failed to get device info:", e);
      }
      setLoading(false);
    };
    fetchInfo();
  }, []);

  const showDeviceInfoModal = () => {
    showModal(
      <DeviceInfoModal closeModal={() => {}} deviceInfo={deviceInfo} />
    );
  };

  return (
    <PanelSection title={t("sectionDeviceInfo")}>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={showDeviceInfoModal}
          disabled={loading}
        >
          {loading ? t("loading") : t("showDeviceInfo")}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
};

const BatteryHealthSection: VFC = () => {
  const [batteryInfo, setBatteryInfo] = useState<BatteryInfo | null>(null);
  const [chargeLimit, setChargeLimitValue] = useState(100);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBattery = async () => {
    try {
      const info = await getBatteryInfo();
      setBatteryInfo(info);
      setChargeLimitValue(info.charge_limit);
    } catch (e) {
      console.error("Failed to get battery info:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBattery();
    const interval = setInterval(fetchBattery, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleChargeLimitChange = async (value: number) => {
    setChargeLimitValue(value);
    const success = await setChargeLimit(value);
    if (success) {
      toaster.toast({
        title: t("allyCenter"),
        body: t("chargeLimitToast", { value }),
      });
    }
  };

  const getHealthColor = (health: number): string => {
    if (health >= 80) return "#4caf50";
    if (health >= 60) return "#ff9800";
    return "#f44336";
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "Charging":
        return "#4caf50";
      case "Discharging":
        return "#ff9800";
      case "Full":
        return "#2196f3";
      default:
        return "#8b929a";
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case "Charging":
        return t("charging");
      case "Discharging":
        return t("discharging");
      case "Full":
        return t("full");
      default:
        return status;
    }
  };

  if (loading || !batteryInfo?.present) {
    return (
      <PanelSection title={t("sectionBattery")}>
        <PanelSectionRow>
          <div style={{ color: "#8b929a" }}>
            {loading ? t("loading") : t("batteryNotDetected")}
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={t("sectionBattery")}>
      <div style={sectionStyle}>
        <div style={infoRowStyle}>
          <span style={labelStyle}>{t("charge")}</span>
          <span
            style={{ ...valueStyle, color: getStatusColor(batteryInfo.status) }}
          >
            {batteryInfo.capacity}% ({getStatusLabel(batteryInfo.status)})
          </span>
        </div>
        <div style={batteryBarStyle(batteryInfo.capacity)}>
          <div style={batteryFillStyle(batteryInfo.capacity, "#1a9fff")} />
        </div>
        <div style={{ ...infoRowStyle, marginTop: "8px" }}>
          <span style={labelStyle}>{t("health")}</span>
          <span
            style={{ ...valueStyle, color: getHealthColor(batteryInfo.health) }}
          >
            {batteryInfo.health}%
          </span>
        </div>
      </div>

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => setExpanded(!expanded)}>
          {expanded ? t("hideDetails") : t("showDetails")}
        </ButtonItem>
      </PanelSectionRow>

      {expanded && (
        <div>
          <div style={sectionStyle}>
            <div style={infoRowStyle}>
              <span style={labelStyle}>{t("cycleCount")}</span>
              <span style={valueStyle}>{batteryInfo.cycle_count}</span>
            </div>
            <div style={infoRowStyle}>
              <span style={labelStyle}>{t("voltage")}</span>
              <span style={valueStyle}>{batteryInfo.voltage.toFixed(2)}V</span>
            </div>
            <div style={infoRowStyle}>
              <span style={labelStyle}>{t("designCapacity")}</span>
              <span style={valueStyle}>
                {batteryInfo.design_capacity.toFixed(1)} Wh
              </span>
            </div>
            <div style={infoRowStyle}>
              <span style={labelStyle}>{t("currentCapacity")}</span>
              <span style={valueStyle}>
                {batteryInfo.full_capacity.toFixed(1)} Wh
              </span>
            </div>
            {batteryInfo.temperature > 0 && (
              <div style={infoRowStyle}>
                <span style={labelStyle}>{t("temperature")}</span>
                <span style={valueStyle}>{batteryInfo.temperature}°C</span>
              </div>
            )}
          </div>

          <PanelSectionRow>
            <SliderField
               label={t("chargeLimitLabel", { value: chargeLimit })}
              value={chargeLimit}
              min={60}
              max={100}
              step={5}
              showValue={false}
              onChange={handleChargeLimitChange}
            />
          </PanelSectionRow>
        </div>
      )}
    </PanelSection>
  );
};

const hslToHex = (h: number): string => {
  const s = 100;
  const l = 50;
  const a = (s * Math.min(l, 100 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((255 * color) / 100)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};

const hexToHue = (hex: string): number => {
  const rgb = hex.replace("#", "");
  const r = parseInt(rgb.substring(0, 2), 16) / 255;
  const g = parseInt(rgb.substring(2, 4), 16) / 255;
  const b = parseInt(rgb.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return Math.round(h * 360);
};

const RgbLightingSection: VFC = () => {
  const [rgbState, setRgbState] = useState<RgbState | null>(null);
  const [hue, setHue] = useState(0);
  const [currentEffect, setCurrentEffect] = useState("static");
  const [loading, setLoading] = useState(true);

  const fetchRgb = async () => {
    try {
      const state = await getRgbState();
      setRgbState(state);
      // Convert saved color to hue for slider position
      if (state.color) {
        const savedHue = hexToHue(state.color);
        setHue(savedHue);
      }
      // Set effect state
      if (state.effect && state.effect !== "") {
        setCurrentEffect(state.effect);
      } else {
        setCurrentEffect("static");
        await setRgbEffect("static");
      }
    } catch (e) {
      console.error("Failed to get RGB state:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRgb();
  }, []);

  const handleToggle = async (enabled: boolean) => {
    const success = await setRgbEnabled(enabled);
    if (success) {
      setRgbState((prev: RgbState | null) =>
        prev ? { ...prev, enabled } : null
      );
    }
  };

  const handleHueChange = async (newHue: number) => {
    setHue(newHue);
    const color = hslToHex(newHue);
    const success = await setRgbColor(color);
    if (success) {
      setRgbState((prev: RgbState | null) =>
        prev ? { ...prev, color } : null
      );
    }
  };

  const handlePresetColor = async (color: string) => {
    const success = await setRgbColor(color);
    if (success) {
      setRgbState((prev: RgbState | null) =>
        prev ? { ...prev, color } : null
      );
      setHue(hexToHue(color));
    }
  };

  const handleBrightnessChange = async (brightness: number) => {
    const success = await setRgbBrightness(brightness);
    if (success) {
      setRgbState((prev: RgbState | null) =>
        prev ? { ...prev, brightness } : null
      );
    }
  };

  const handleEffectChange = async (effect: {
    data: string;
    labelKey: TranslationKey;
  }) => {
    setCurrentEffect(effect.data);
    const success = await setRgbEffect(effect.data);
    if (success) {
      setRgbState((prev: RgbState | null) =>
        prev
          ? { ...prev, effect: effect.data, enabled: effect.data !== "off" }
          : null
      );
    }
  };

  const handleSpeedChange = async (speed: number) => {
    const success = await setRgbSpeed(speed);
    if (success) {
      setRgbState((prev: RgbState | null) =>
        prev ? { ...prev, speed } : null
      );
    }
  };

  // Effects that support speed control
  const animatedEffects = ["pulse", "spectrum", "wave", "flash"];

  if (loading) {
    return (
      <PanelSection title={t("sectionRgbLighting")}>
        <PanelSectionRow>
          <div style={{ color: "#8b929a" }}>{t("loading")}</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  const currentColor = rgbState?.color || "#FF0000";
  const selectedEffect = useMemo(
    () => RGB_EFFECTS.find((e) => e.data === currentEffect),
    [currentEffect]
  );

  return (
    <PanelSection title={t("sectionRgbLighting")}>
      <PanelSectionRow>
        <ToggleField
          label={t("enableRgb")}
          checked={rgbState?.enabled ?? false}
          onChange={handleToggle}
        />
      </PanelSectionRow>

      {rgbState?.enabled && (
        <div>
          {/* Color Slider with hue gradient */}
          <PanelSectionRow>
            <SliderField
              label={t("color")}
              value={hue}
              min={0}
              max={360}
              step={5}
              onChange={handleHueChange}
              showValue={false}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <div
              style={{
                width: "100%",
                height: "12px",
                borderRadius: "6px",
                background:
                  "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                marginTop: "-8px",
              }}
            />
          </PanelSectionRow>

          {/* Brightness */}
          <PanelSectionRow>
            <SliderField
              label={t("brightness")}
              value={rgbState?.brightness ?? 100}
              min={0}
              max={100}
              step={10}
              onChange={handleBrightnessChange}
            />
          </PanelSectionRow>

          {/* Effect */}
          <PanelSectionRow>
            <DropdownItem
              label={t("effect")}
              strDefaultLabel={selectedEffect ? t(selectedEffect.labelKey) : t("static")}
              menuLabel={selectedEffect ? t(selectedEffect.labelKey) : t("static")}
              rgOptions={RGB_EFFECTS.map((effect) => ({
                ...effect,
                label: t(effect.labelKey),
              }))}
              selectedOption={
                RGB_EFFECTS.find((e) => e.data === currentEffect) ||
                RGB_EFFECTS[0]
              }
              onChange={handleEffectChange}
            />
          </PanelSectionRow>

          {/* Speed - only show for animated effects */}
          {animatedEffects.includes(currentEffect) && (
            <PanelSectionRow>
              <SliderField
                label={t("speed")}
                value={rgbState?.speed ?? 50}
                min={10}
                max={100}
                step={10}
                onChange={handleSpeedChange}
              />
            </PanelSectionRow>
          )}
        </div>
      )}
    </PanelSection>
  );
};

const FAN_MODES: ReadonlyArray<{ data: string; labelKey: TranslationKey }> = [
  { data: "auto", labelKey: "auto" },
  { data: "quiet", labelKey: "quiet" },
  { data: "balanced", labelKey: "balanced" },
  { data: "performance", labelKey: "performance" },
];

const PerformanceSection: VFC = () => {
  const [profilesData, setProfilesData] = useState<ProfilesData | null>(null);
  const [tdpInfo, setTdpInfo] = useState<TdpInfo | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTdp, setCurrentTdp] = useState(15);
  const [currentFanMode, setCurrentFanMode] = useState("auto");
  const [tdpOverride, setTdpOverrideState] = useState(false);
  const [useExternalTdp, setUseExternalTdpState] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profiles, tdp, fan, tdpSettings] = await Promise.all([
          getPerformanceProfiles(),
          getCurrentTdp(),
          getFanInfo(),
          getTdpSettings(),
        ]);
        setProfilesData(profiles);
        setTdpInfo(tdp);
        setCurrentFanMode(fan.mode);
        setCurrentTdp(tdpSettings.tdp);
        setTdpOverrideState(tdpSettings.tdp_override || false);
        setUseExternalTdpState(tdpSettings.use_external_tdp || false);
      } catch (e) {
        console.error("Failed to get performance data:", e);
      }
      setLoading(false);
    };
    fetchData();

    const interval = setInterval(async () => {
      try {
        const [profiles, tdp] = await Promise.all([
          getPerformanceProfiles(),
          getCurrentTdp(),
        ]);
        setProfilesData(profiles);
        setTdpInfo(tdp);
      } catch (e) {
        console.error("Failed to update performance data:", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleProfileSelect = async (profileId: string) => {
    const success = await setPerformanceProfile(profileId);
    if (success) {
      setProfilesData((prev: ProfilesData | null) =>
        prev ? { ...prev, current: profileId } : null
      );
      const profile = profilesData?.profiles[profileId];
      const profileName = profile?.name || profileId;
      // Update fan mode UI to match profile's fan_curve
      if (profile?.fan_curve) {
        setCurrentFanMode(profile.fan_curve);
      }
      toaster.toast({
        title: t("allyCenter"),
        body: t("presetToast", { value: profileName }),
      });
      // Disable TDP override when selecting a preset (backend already does this)
      setTdpOverrideState(false);
    }
  };

  const handleTdpChange = async (tdp: number) => {
    setCurrentTdp(tdp);
    await setTdp(tdp);
  };

  const handleFanModeChange = async (mode: {
    data: string;
    labelKey: TranslationKey;
  }) => {
    setCurrentFanMode(mode.data);
    await setFanMode(mode.data);
    toaster.toast({
      title: t("allyCenter"),
      body: t("fanToast", { value: t(mode.labelKey) }),
    });
  };

  const handleTdpOverrideToggle = async (enabled: boolean) => {
    setTdpOverrideState(enabled);
    await setTdpOverride(enabled);
    if (enabled) {
      toaster.toast({
        title: t("allyCenter"),
        body: t("tdpOverrideEnabledToast"),
      });
    } else {
      if (profilesData?.current) {
        await setPerformanceProfile(profilesData.current);
        const profileName =
          profilesData.profiles[profilesData.current]?.name || t("unknown");
        toaster.toast({
          title: t("allyCenter"),
          body: t("restoredPresetToast", { value: profileName }),
        });
      }
    }
  };

  const handleExternalTdpToggle = async (enabled: boolean) => {
    setUseExternalTdpState(enabled);
    await setUseExternalTdp(enabled);
    if (enabled) {
      toaster.toast({
        title: t("allyCenter"),
        body: t("tdpManagedByExternalToast"),
      });
    } else {
      toaster.toast({
        title: t("allyCenter"),
        body: t("tdpManagedByAllyToast"),
      });
    }
  };

  if (loading) {
    return (
      <PanelSection title={t("sectionPerformance")}>
        <PanelSectionRow>
          <div style={{ color: "#8b929a" }}>{t("loading")}</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={t("sectionPerformance")}>
      {tdpInfo && (
        <div style={sectionStyle}>
          <div style={infoRowStyle}>
            <span style={labelStyle}>{t("profile")}</span>
            <span
              style={{ ...valueStyle, color: useExternalTdp ? "#8b929a" : (tdpOverride ? "#ff9800" : "#fff") }}
            >
              {useExternalTdp
                ? t("external")
                : tdpOverride
                ? t("manual")
                : profilesData?.profiles[profilesData.current]?.name ||
                  t("unknown")}
            </span>
          </div>
          <div style={infoRowStyle}>
            <span style={labelStyle}>{t("temps")}</span>
            <span style={valueStyle}>
              {tdpInfo.cpu_temp.toFixed(0)}°C / {tdpInfo.gpu_temp.toFixed(0)}°C
            </span>
          </div>
        </div>
      )}

      <PanelSectionRow>
        <ToggleField
          label={t("useExternalTdp")}
          description={t("useExternalTdpDescription")}
          checked={useExternalTdp}
          onChange={handleExternalTdpToggle}
        />
      </PanelSectionRow>

      {!useExternalTdp && (
        <div>
          <PanelSectionRow>
            <ToggleField
              label={t("tdpOverride")}
              checked={tdpOverride}
              onChange={handleTdpOverrideToggle}
            />
          </PanelSectionRow>

          <PanelSectionRow>
            <SliderField
               label={t("tdpLabel", { value: currentTdp })}
              value={currentTdp}
              min={5}
              max={30}
              step={1}
              disabled={!tdpOverride}
              showValue={false}
              onChange={handleTdpChange}
            />
          </PanelSectionRow>

          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => setExpanded(!expanded)}>
              {expanded ? t("hidePerformancePresets") : t("showPerformancePresets")}
            </ButtonItem>
          </PanelSectionRow>

          {expanded && profilesData && (
            <div>
              {Object.entries(profilesData.profiles).map(([id, profile]) => (
                <PanelSectionRow key={id}>
                  <ButtonItem
                    layout="below"
                    onClick={() => handleProfileSelect(id)}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontWeight:
                              profilesData.current === id ? "bold" : "normal",
                            color: profilesData.current === id ? "#1a9fff" : "#fff",
                          }}
                        >
                          {profile.name}
                        </span>
                        {profilesData.current === id && (
                          <span style={{ color: "#1a9fff", marginLeft: "8px" }}>
                            ✓
                          </span>
                        )}
                      </div>
                      <span style={{ color: "#8b929a" }}>{profile.tdp}W</span>
                    </div>
                  </ButtonItem>
                </PanelSectionRow>
              ))}
            </div>
          )}
        </div>
      )}

      <PanelSectionRow>
        <DropdownItem
          label={t("fanMode")}
          strDefaultLabel={
            t(
              FAN_MODES.find((m) => m.data === currentFanMode)?.labelKey ||
                DEFAULT_FAN_MODE_LABEL_KEY
            )
          }
          menuLabel={
            t(
              FAN_MODES.find((m) => m.data === currentFanMode)?.labelKey ||
                DEFAULT_FAN_MODE_LABEL_KEY
            )
          }
          rgOptions={FAN_MODES.map((mode) => ({ ...mode, label: t(mode.labelKey) }))}
          selectedOption={
            FAN_MODES.find((m) => m.data === currentFanMode) || FAN_MODES[0]
          }
          onChange={handleFanModeChange}
        />
      </PanelSectionRow>
    </PanelSection>
  );
};

const CpuSettingsSection: VFC = () => {
  const [cpuSettings, setCpuSettings] = useState<CpuSettings | null>(null);
  const [smtEnabled, setSmtState] = useState(true);
  const [boostEnabled, setBoostState] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getCpuSettings();
        setCpuSettings(data);
        setSmtState(data.smt_enabled);
        setBoostState(data.boost_enabled);
      } catch (e) {
        console.error("Failed to get CPU settings:", e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSmtToggle = async (enabled: boolean) => {
    setSmtState(enabled);
    const success = await setSmtEnabled(enabled);
    if (success) {
      toaster.toast({
        title: t("allyCenter"),
        body: t("smtToast", { value: enabled ? t("enabled") : t("disabled") }),
      });
    } else {
      setSmtState(!enabled);
      toaster.toast({
        title: t("allyCenter"),
        body: t("smtFailToast"),
      });
    }
  };

  const handleBoostToggle = async (enabled: boolean) => {
    setBoostState(enabled);
    const success = await setCpuBoostEnabled(enabled);
    if (success) {
      toaster.toast({
        title: t("allyCenter"),
        body: t("cpuBoostToast", {
          value: enabled ? t("enabled") : t("disabled"),
        }),
      });
    } else {
      setBoostState(!enabled);
      toaster.toast({
        title: t("allyCenter"),
        body: t("cpuBoostFailToast"),
      });
    }
  };

  if (loading) {
    return (
      <PanelSection title={t("sectionCpuSettings")}>
        <PanelSectionRow>
          <div style={{ color: "#8b929a" }}>{t("loading")}</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={t("sectionCpuSettings")}>
      {cpuSettings?.smt_available && (
        <PanelSectionRow>
          <ToggleField
            label={t("smtLabel")}
            description={t("smtDescription")}
            checked={smtEnabled}
            onChange={handleSmtToggle}
          />
        </PanelSectionRow>
      )}

      {cpuSettings?.boost_available && (
        <PanelSectionRow>
          <ToggleField
            label={t("cpuBoost")}
            description={t("cpuBoostDescription")}
            checked={boostEnabled}
            onChange={handleBoostToggle}
          />
        </PanelSectionRow>
      )}

      {!cpuSettings?.smt_available && !cpuSettings?.boost_available && (
        <PanelSectionRow>
          <div style={{ color: "#8b929a" }}>{t("cpuControlsNotAvailable")}</div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};

let rgbWasEnabled = false;

const DownloadModeSection: VFC = () => {
  const [downloadMode, setDownloadMode] = useState(
    downloadModeState.isActive()
  );

  useEffect(() => {
    return downloadModeState.subscribe(setDownloadMode);
  }, []);

  const exitDownloadMode = async () => {
    const success = await setScreenState(true);
    if (success) {
      if (rgbWasEnabled) {
        await setRgbEnabled(true);
      }
      downloadModeState.setActive(false);
      toaster.toast({ title: t("allyCenter"), body: t("downloadModeDisabledToast") });
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      try {
        const rgbState = await getRgbState();
        rgbWasEnabled = rgbState.enabled;
      } catch (e) {
        rgbWasEnabled = false;
      }

      const success = await setScreenState(false);
      if (success) {
        await setRgbEnabled(false);
        downloadModeState.setActive(true);
        Navigation.CloseSideMenus();
        toaster.toast({
          title: t("allyCenter"),
          body: t("downloadModeEnabledToast"),
        });
      }
    } else {
      await exitDownloadMode();
    }
  };

  return (
    <PanelSection title={t("sectionDownloadMode")}>
      <PanelSectionRow>
        <ToggleField
          label={t("enable")}
          description={t("downloadModeDescription")}
          checked={downloadMode}
          onChange={handleToggle}
        />
      </PanelSectionRow>
    </PanelSection>
  );
};

const AboutModal: VFC<{ closeModal: () => void }> = ({ closeModal }) => {
  return (
    <ConfirmModal
      onEscKeypress={closeModal}
      onOK={closeModal}
      strOKButtonText={t("close")}
      bHideCloseIcon={true}
      bAlertDialog={true}
    >
      <div style={{ textAlign: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "18px", fontWeight: "bold", color: "#fff" }}>{t("allyCenter")}</div>
        <div style={{ fontSize: "12px", color: "#8b929a" }}>{t("versionLabel")}</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#8b929a", fontSize: "11px" }}>{t("createdBy")}</div>
        <div style={{ color: "#1a9fff", fontSize: "14px", fontWeight: "bold" }}>Keith Baker</div>
        <div style={{ color: "#8b929a", fontSize: "11px", marginBottom: "12px" }}>Pixel Addict Games</div>
        
        <div style={{ color: "#8b929a", fontSize: "11px", marginBottom: "4px", textAlign: "left" }}>{t("thanksTo")}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ color: "#fff", fontSize: "12px" }}>HueSync</span>
          <span style={{ color: "#8b929a", fontSize: "11px" }}>honjow</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ color: "#fff", fontSize: "12px" }}>Decky Loader</span>
          <span style={{ color: "#8b929a", fontSize: "11px" }}>decky.xyz</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ color: "#fff", fontSize: "12px" }}>ASUS Linux</span>
          <span style={{ color: "#8b929a", fontSize: "11px" }}>asus-linux.org</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontSize: "12px" }}>Valve</span>
          <span style={{ color: "#8b929a", fontSize: "11px" }}>SteamOS</span>
        </div>
      </div>
    </ConfirmModal>
  );
};

const AboutSection: VFC = () => {
  const showAboutModal = () => {
    showModal(<AboutModal closeModal={() => {}} />);
  };

  return (
    <PanelSection title={t("sectionAbout")}>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={showAboutModal}>
          {t("aboutAllyCenter")}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
};

const AllyCenterContent: VFC = () => {
  return (
    <div>
      <DownloadModeSection />
      <PerformanceSection />
      <CpuSettingsSection />
      <BatteryHealthSection />
      <RgbLightingSection />
      <DeviceInfoSection />
      <AboutSection />
    </div>
  );
};

const AllyCenterIcon: VFC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
);

export default definePlugin(() => {
  console.log("Ally Center plugin loaded!");

  // Register the global black overlay component for download mode
  routerHook.addGlobalComponent("AllyCenterBlackOverlay", () => (
    <BlackScreenOverlay stateManager={downloadModeState} />
  ));

  return {
    name: t("allyCenter"),
    title: <div className={staticClasses.Title}>{t("allyCenter")}</div>,
    content: <AllyCenterContent />,
    icon: <AllyCenterIcon />,
    onDismount() {
      console.log("Ally Center plugin unloaded!");
      // Remove the global overlay component when plugin is unloaded
      routerHook.removeGlobalComponent("AllyCenterBlackOverlay");
      // Ensure download mode is disabled when plugin unloads
      downloadModeState.setActive(false);
    },
  };
});
