import { useAtom } from "jotai";
import { physicsSettingsAtom } from "../../../atoms/physics";

const PhysicsControls = () => {
  const [settings, setSettings] = useAtom(physicsSettingsAtom);

  const updateSetting = (key: keyof typeof settings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings({
      gravityConstant: 0.08,
      maxVelocity: 10,
      explosionThreshold: 40,
      bounceRestitution: 0.5,
      orbitalDecayChance: 0.02,
      cursorMass: 150,
    });
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
          max="0.5"
          step="0.01"
          value={settings.gravityConstant}
          onChange={(e) => updateSetting("gravityConstant", parseFloat(e.target.value))}
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
          max="30"
          step="1"
          value={settings.maxVelocity}
          onChange={(e) => updateSetting("maxVelocity", parseFloat(e.target.value))}
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
          max="200"
          step="5"
          value={settings.explosionThreshold}
          onChange={(e) => updateSetting("explosionThreshold", parseFloat(e.target.value))}
        />
      </div>

      <div className="pp-physics-control">
        <label>
          <span>Bounce Restitution</span>
          <span>{settings.bounceRestitution.toFixed(2)}</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="2.0"
          step="0.1"
          value={settings.bounceRestitution}
          onChange={(e) => updateSetting("bounceRestitution", parseFloat(e.target.value))}
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
          max="0.2"
          step="0.01"
          value={settings.orbitalDecayChance}
          onChange={(e) => updateSetting("orbitalDecayChance", parseFloat(e.target.value))}
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
          max="500"
          step="10"
          value={settings.cursorMass}
          onChange={(e) => updateSetting("cursorMass", parseFloat(e.target.value))}
        />
      </div>
      
      <p className="pp-physics-hint">
        Click and drag particles on the background to manipulate them.
      </p>

      <button 
        type="button" 
        onClick={resetToDefaults}
        className="btn btn-secondary btn-sm"
        style={{ marginTop: 'auto' }}
      >
        Reset to Defaults
      </button>
    </div>
  );
};

export default PhysicsControls;
