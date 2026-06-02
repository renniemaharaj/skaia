import { useAtom } from "jotai";
import { physicsSettingsAtom } from "../../../atoms/physics";
import {
  defaultSettings,
  type PhysicsSettings,
} from "../../../components/ui/GravityParticles/engine";

const PhysicsControls = () => {
  const [settings, setSettings] = useAtom(physicsSettingsAtom);

  const updateSetting = <K extends keyof PhysicsSettings>(
    key: K,
    value: PhysicsSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
  };

  return (
    <div className="pp-physics-controls">
      <div className="pp-physics-control">
        <label>
          <span>Gravity (G)</span>
          <span>{settings.gravityConstant.toFixed(2)}</span>
        </label>
        <input
          type="range"
          min="0.01"
          max="2.0"
          step="0.01"
          value={settings.gravityConstant}
          onChange={(e) =>
            updateSetting("gravityConstant", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Max Velocity</span>
          <span>{settings.maxVelocity}</span>
        </label>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={settings.maxVelocity}
          onChange={(e) =>
            updateSetting("maxVelocity", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Explosion Threshold</span>
          <span>{settings.explosionThreshold}</span>
        </label>
        <input
          type="range"
          min="10"
          max="500"
          step="5"
          value={settings.explosionThreshold}
          onChange={(e) =>
            updateSetting("explosionThreshold", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Bounce Restitution</span>
          <span>{settings.bounceRestitution.toFixed(2)}</span>
        </label>
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.05"
          value={settings.bounceRestitution}
          onChange={(e) =>
            updateSetting("bounceRestitution", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Orbital Decay Chance</span>
          <span>{(settings.orbitalDecayChance * 100).toFixed(1)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="0.1"
          step="0.001"
          value={settings.orbitalDecayChance}
          onChange={(e) =>
            updateSetting("orbitalDecayChance", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Cursor Mass</span>
          <span>{settings.cursorMass}</span>
        </label>
        <input
          type="range"
          min="10"
          max="1000"
          step="10"
          value={settings.cursorMass}
          onChange={(e) =>
            updateSetting("cursorMass", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control pp-physics-checkbox">
        <label
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            display: "flex",
          }}
        >
          <span>Cursor Repels</span>
          <input
            type="checkbox"
            checked={settings.cursorRepels}
            onChange={(e) => updateSetting("cursorRepels", e.target.checked)}
            style={{ width: "auto", margin: 0 }}
          />
        </label>
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Sub-Steps</span>
          <span>{settings.subSteps}</span>
        </label>
        <input
          type="range"
          min="1"
          max="4"
          step="1"
          value={settings.subSteps}
          onChange={(e) =>
            updateSetting("subSteps", parseInt(e.target.value, 10))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Trail Length</span>
          <span>{settings.trailLength}</span>
        </label>
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          value={settings.trailLength}
          onChange={(e) =>
            updateSetting("trailLength", parseInt(e.target.value, 10))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Shockwave Force</span>
          <span>{settings.shockwaveForce.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min="0"
          max="20"
          step="0.5"
          value={settings.shockwaveForce}
          onChange={(e) =>
            updateSetting("shockwaveForce", parseFloat(e.target.value))
          }
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Fragment Mass</span>
          <span>{settings.fragmentMass.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={settings.fragmentMass}
          onChange={(e) =>
            updateSetting("fragmentMass", parseFloat(e.target.value))
          }
        />
      </div>

      <p className="pp-physics-hint">
        Click and drag particles on the background to manipulate them.
      </p>

      <button
        type="button"
        onClick={resetToDefaults}
        className="btn btn-secondary btn-sm"
        style={{ marginTop: "auto" }}
      >
        Reset to Defaults
      </button>
    </div>
  );
};

export default PhysicsControls;
